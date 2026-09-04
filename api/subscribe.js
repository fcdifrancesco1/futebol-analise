// ============================================================
// Vercel Serverless Function — Gerenciamento de Assinaturas WebPush
// ============================================================

const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contato@futstats.com";

try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }
} catch (e) {
  console.warn("Aviso: VAPID setup:", e.message);
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Configuração do banco de dados não disponível no ambiente." });
  }

  // 1. Descadastramento / Remoção de Assinatura (DELETE)
  // Proteção contra IDOR: exige correspondência com a chave auth do aparelho
  if (req.method === "DELETE") {
    const endpoint = (req.query && req.query.endpoint) || (req.body && req.body.endpoint);
    const auth = (req.query && req.query.auth) || (req.body && req.body.auth);

    if (!endpoint) {
      return res.status(400).json({ error: "Endpoint não informado para remoção." });
    }

    try {
      // Verifica se o registro existe no banco para validar titularidade
      const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=auth`, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        }
      });

      if (checkRes.ok) {
        const rows = await checkRes.json();
        if (Array.isArray(rows) && rows.length > 0) {
          // Se o registro existe, valida a posse da chave auth
          if (!auth || rows[0].auth !== auth) {
            return res.status(403).json({ error: "Permissão negada: chave auth inválida para este endpoint." });
          }
        }
      }

      // Deleta garantindo a correspondência com a chave auth (elimina IDOR de forma atômica)
      const deleteQuery = auth
        ? `endpoint=eq.${encodeURIComponent(endpoint)}&auth=eq.${encodeURIComponent(auth)}`
        : `endpoint=eq.${encodeURIComponent(endpoint)}`;

      const delRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?${deleteQuery}`, {
        method: "DELETE",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Prefer": "return=representation"
        }
      });

      if (delRes.ok) {
        const deletedRows = await delRes.json();
        if (Array.isArray(deletedRows) && deletedRows.length === 0) {
          // Se nenhuma linha foi removida, o endpoint não existe ou a chave auth informada é inválida
          return res.status(403).json({ error: "Permissão negada: chave auth inválida ou endpoint não encontrado." });
        }
      }

      return res.status(200).json({ success: true, message: "Assinatura removida com sucesso." });
    } catch (err) {
      return res.status(500).json({ error: "Falha ao remover assinatura do banco.", details: err.message });
    }
  }

  // 2. Cadastro ou Atualização de Assinatura (POST)
  // Proteção contra IDOR: se o endpoint já existe, exige que o auth coincida antes de sobrescrever
  if (req.method === "POST") {
    const { endpoint, p256dh, auth, favorite_teams = [], preferences = {}, test = false } = req.body || {};

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes (endpoint, p256dh, auth)." });
    }

    const payload = {
      endpoint,
      p256dh,
      auth,
      favorite_teams,
      preferences,
      updated_at: new Date().toISOString()
    };

    try {
      // Verifica se o endpoint já existe para validar titularidade
      const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=auth`, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        }
      });

      if (checkRes.ok) {
        const rows = await checkRes.json();
        if (Array.isArray(rows) && rows.length > 0) {
          if (rows[0].auth !== auth) {
            return res.status(403).json({ error: "Permissão negada: endpoint já registrado com credencial diferente." });
          }
        }
      }

      // Remove registro anterior apenas se a chave auth coincidir
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&auth=eq.${encodeURIComponent(auth)}`, {
        method: "DELETE",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        }
      }).catch(() => {});

      // Insere o registro limpo e atualizado
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify(payload)
      });

      if (!insertRes.ok && insertRes.status !== 201) {
        if (insertRes.status === 409) {
          return res.status(403).json({ error: "Permissão negada: endpoint já registrado com credencial diferente." });
        }
        const errBody = await insertRes.text();
        console.warn("Erro ao inserir no Supabase:", insertRes.status, errBody);
      }

      // Se foi solicitado teste, envia notificação de teste em tempo real via WebPush
      let testSent = false;
      let testError = null;
      if (test && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        try {
          await webpush.sendNotification(
            {
              endpoint,
              keys: { p256dh, auth }
            },
            JSON.stringify({
              title: "⚽ FutStats - Notificações Ativadas!",
              body: "Tudo pronto! Você receberá alertas de gols, escalações e lances em tempo real.",
              icon: "https://futebol-analise.vercel.app/icon-192.png",
              badge: "https://futebol-analise.vercel.app/badge-96.png",
              tag: "test-notification-" + Date.now(),
              data: { url: "/#/" }
            })
          );
          testSent = true;
        } catch (pushErr) {
          console.warn("Erro ao enviar push de teste:", pushErr.message);
          testError = pushErr.message;
        }
      }

      return res.status(200).json({
        success: true,
        message: "Assinatura salva com sucesso no FutStats!",
        testSent,
        testError
      });
    } catch (err) {
      console.error("Erro em /api/subscribe:", err);
      return res.status(500).json({ error: "Erro ao processar assinatura.", details: err.message });
    }
  }

  // GET: Health check ou Consulta Segura de Assinantes (com Bearer CRON_SECRET)
  const authHeader = req.headers["authorization"] || "";
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    try {
      const { createClient } = require("@supabase/supabase-js");
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data, error } = await supabase.from("push_subscriptions").select("*");
      return res.status(200).json({
        status: "online",
        count: data ? data.length : 0,
        subscribers: (data || []).map(s => ({
          endpoint: s.endpoint.slice(0, 45) + "...",
          favorite_teams: s.favorite_teams,
          preferences: s.preferences,
          updated_at: s.updated_at
        })),
        error: error ? error.message : null
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(200).json({
    status: "online",
    service: "FutStats Push Subscription API",
    time: new Date().toISOString()
  });
};
