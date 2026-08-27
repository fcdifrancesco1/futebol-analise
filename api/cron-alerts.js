// ============================================================
// Vercel Serverless Function — Robô de Monitoramento e Disparo Push
// ============================================================

const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || "a70fc65a67c10981ace9813a509db554";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://aqihpureclilnstdacii.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxaWhwdXJlY2xpbG5zdGRhY2lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODIyODksImV4cCI6MjEwMzM1ODI4OX0.2odEs0rD_tBsEbHhaLlu1JMOXkJrqs8WKhboasPgvWw";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BMjC-8Rjccu_uZoj0BaFDXpUatXC1yShp_foJEdb0uixT398zbT4JlvTfRDeRswaBqRQx6ezRF8mAutCCfE-Q6A";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "gWKwUrc5XBpYUOBExM1ha_M3ugoo5JbM7mQSMt4Lk_c";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contato@apuracao.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = async (req, res) => {
  try {
    // 1. Buscar todos os celulares inscritos na tabela
    const { data: subscribers, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*");

    if (subError) throw subError;

    if (!subscribers || subscribers.length === 0) {
      return res.status(200).json({
        message: "Nenhum celular inscrito ainda na tabela push_subscriptions.",
        time: new Date().toISOString()
      });
    }

    // 2. Buscar jogos ao vivo na API-Football
    const apiResp = await fetch("https://v3.football.api-sports.io/fixtures?live=all", {
      headers: { "x-apisports-key": FOOTBALL_API_KEY }
    });

    const liveData = await apiResp.json();
    const liveFixtures = liveData.response || [];

    if (liveFixtures.length === 0) {
      return res.status(200).json({
        message: "Nenhum jogo ao vivo acontecendo no momento.",
        activeSubscribers: subscribers.length,
        time: new Date().toISOString()
      });
    }

    let notificationsSent = 0;
    const errors = [];

    // 3. Para cada jogo ao vivo, verificar se algum inscrito segue os times
    for (const fx of liveFixtures) {
      const homeId = fx.teams.home.id;
      const awayId = fx.teams.away.id;
      const elapsed = fx.fixture.status.elapsed;
      const score = ${fx.goals.home ?? 0} x ;

      // Filtrar inscritos que seguem o time da casa ou visitante
      const matchingSubs = subscribers.filter(sub => {
        const favs = sub.favorite_teams || [];
        return favs.some(f => f.id === homeId || f.id === awayId);
      });

      if (matchingSubs.length === 0) continue;

      // Buscar eventos recentes desta partida
      const eventsResp = await fetch(https://v3.football.api-sports.io/fixtures/events?fixture=, {
        headers: { "x-apisports-key": FOOTBALL_API_KEY }
      });
      const eventsData = await eventsResp.json();
      const events = eventsData.response || [];

      // Filtrar eventos dos últimos 2 minutos
      const recentEvents = events.filter(e => {
        const eventMin = e.time.elapsed;
        return elapsed && (elapsed - eventMin <= 2 && elapsed - eventMin >= 0);
      });

      for (const ev of recentEvents) {
        let title = "";
        let body = "";
        const teamName = ev.team?.name || "Seu time";
        const playerName = ev.player?.name || "Jogador";

        if (ev.type === "Goal" && ev.detail !== "Missed Penalty") {
          title = ⚽ GOL DO ! (');
          body = ${playerName} marca para o ! (  );
        } else if (ev.type === "Card" && ev.detail === "Red Card") {
          title = 🟥 CARTÃO VERMELHO! (');
          body = ${playerName} () foi expulso da partida!;
        }

        if (!title) continue;

        const payload = JSON.stringify({
          title,
          body,
          icon: ev.team?.logo || fx.teams.home.logo,
          badge: "/icon-192.png",
          url: /#/jogo/
        });

        // Enviar notificação para os celulares dos torcedores
        for (const sub of matchingSubs) {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          };

          try {
            await webpush.sendNotification(pushSubscription, payload);
            notificationsSent++;
          } catch (err) {
            // Se o token expirou no navegador, remove do banco
            if (err.statusCode === 410 || err.statusCode === 404) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            } else {
              errors.push(err.message);
            }
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      liveMatchesChecked: liveFixtures.length,
      notificationsSent,
      activeSubscribers: subscribers.length,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      error: "Erro no processador de notificações",
      details: err.message
    });
  }
};
