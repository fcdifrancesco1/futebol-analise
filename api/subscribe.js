// ============================================================
// Vercel Serverless Function — Gerenciamento de Assinaturas WebPush
// ============================================================

const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://aqihpureclilnstdacii.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxaWhwdXJlY2xpbG5zdGRhY2lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODIyODksImV4cCI6MjEwMzM1ODI4OX0.2odEs0rD_tBsEbHhaLlu1JMOXkJrqs8WKhboasPgvWw";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BMjC-8Rjccu_uZoj0BaFDXpUatXC1yShp_foJEdb0uixT398zbT4JlvTfRDeRswaBqRQx6ezRF8mAutCCfE-Q6A";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "gWKwUrc5XBpYUOBExM1ha_M3ugoo5JbM7mQSMt4Lk_c";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contato@futstats.com";

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
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

  // 1. Descadastramento / Remoção de Assinatura
  if (req.method === "DELETE") {
    const endpoint = req.query.endpoint || (req.body && req.body.endpoint);
    if (!endpoint) {
      return res.status(400).json({ error: "Endpoint não informado para remoção." });
    }

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: "DELETE",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        }
      });
      return res.status(200).json({ success: true, message: "Assinatura removida com sucesso." });
    } catch (err) {
      return res.status(500).json({ error: "Falha ao remover assinatura do banco.", details: err.message });
    }
  }

  // 2. Cadastro ou Atualização de Assinatura (POST)
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
      // Remove registro anterior para evitar violação de unicidade ou problemas com RLS no upsert
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
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
        const errBody = await insertRes.text();
        console.warn("Erro ao inserir no Supabase:", insertRes.status, errBody);
      }

      // Se foi solicitado teste, envia notificação de teste em tempo real via WebPush
      let testSent = false;
      let testError = null;
      if (test) {
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

  // GET: Health check
  res.status(200).json({
    status: "online",
    service: "FutStats Push Subscription API",
    time: new Date().toISOString()
  });
};
