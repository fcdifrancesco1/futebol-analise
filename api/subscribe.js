const webpush = require('web-push');
const { validateBody, rpc } = require('../lib/push-security');
const { enforceRateLimit } = require('../lib/request-security');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null });
  if (!['POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  let body;
  try { body = validateBody(req.body, req.method === 'DELETE'); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_URL) return res.status(503).json({ error: 'Banco não configurado.' });
    if (!await enforceRateLimit(req, res, { scope: 'push-subscribe', limit: 20, windowSeconds: 3600 })) return;
    if (body.test && !await enforceRateLimit(req, res, { scope: 'push-test', limit: 3, windowSeconds: 3600 })) return;
    if (req.method === 'DELETE') {
      const removed = await rpc('delete_push_subscription', { p_endpoint: body.endpoint, p_auth: body.auth });
      if (removed !== true) return res.status(403).json({ error: 'Assinatura ou credencial inválida.' });
      return res.status(200).json({ success: true });
    }
    const saved = await rpc('save_push_subscription', { p_endpoint: body.endpoint, p_auth: body.auth, p_p256dh: body.p256dh, p_favorite_teams: body.favorite_teams, p_preferences: body.preferences });
    if (saved !== true) return res.status(403).json({ error: 'Endpoint registrado com outra credencial.' });
    if (body.test) {
      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(503).json({ saved: true, testSent: false, error: 'Push não configurado.' });
      try {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contato@futstats.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
        await webpush.sendNotification({ endpoint: body.endpoint, keys: { auth: body.auth, p256dh: body.p256dh } }, JSON.stringify({ title: '⚽ FutStats - Notificações Ativadas!', body: 'Você receberá os alertas dos seus favoritos.', tag: 'test-notification', data: { url: '/#/' } }), { timeout: 5000, TTL: 60 });
      } catch { return res.status(502).json({ saved: true, testSent: false, error: 'Não foi possível confirmar a entrega do teste.' }); }
    }
    return res.status(200).json({ success: true, testSent: body.test });
  } catch { return res.status(503).json({ error: 'Não foi possível concluir a operação no banco.' }); }
};
