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

    // Helper para enviar push
    const dispatchPush = async (sub, payloadObj) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, JSON.stringify(payloadObj));
        notificationsSent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          errors.push(err.message);
        }
      }
    };

    // 3. Processar cada jogo ao vivo
    for (const fx of liveFixtures) {
      const homeId = fx.teams.home.id;
      const awayId = fx.teams.away.id;
      const elapsed = fx.fixture.status.elapsed;
      const statusShort = fx.fixture.status.short;
      const score = `${fx.goals.home ?? 0} x ${fx.goals.away ?? 0}`;

      // Filtrar inscritos que seguem pelo menos um dos times da partida
      const matchingSubs = subscribers.filter(sub => {
        const favs = sub.favorite_teams || [];
        return favs.some(f => f.id === homeId || f.id === awayId);
      });

      if (matchingSubs.length === 0) continue;

      // Evento A: Início de Partida (1H até 3 min)
      if (statusShort === "1H" && elapsed <= 3) {
        for (const sub of matchingSubs) {
          const prefs = sub.preferences || {};
          if (prefs.kickoff === false) continue;

          await dispatchPush(sub, {
            title: `⏱️ BOLA ROLANDO! (${fx.teams.home.name} x ${fx.teams.away.name})`,
            body: `Começou a partida entre ${fx.teams.home.name} e ${fx.teams.away.name} pela ${fx.league.name}!`,
            icon: fx.teams.home.logo,
            badge: "/icon-192.png",
            tag: `kickoff-${fx.fixture.id}`,
            data: { url: `/#/jogo/${fx.fixture.id}` }
          });
        }
      }

      // Evento B: Intervalo (HT)
      if (statusShort === "HT") {
        for (const sub of matchingSubs) {
          const prefs = sub.preferences || {};
          if (prefs.halftime === false) continue;

          await dispatchPush(sub, {
            title: `⏸️ INTERVALO: ${fx.teams.home.name} ${score} ${fx.teams.away.name}`,
            body: `Fim do primeiro tempo! Placar parcial: ${fx.teams.home.name} ${score} ${fx.teams.away.name}.`,
            icon: fx.teams.home.logo,
            badge: "/icon-192.png",
            tag: `halftime-${fx.fixture.id}`,
            data: { url: `/#/jogo/${fx.fixture.id}` }
          });
        }
      }

      // Evento C: Fim de Jogo (FT, AET, PEN)
      if (["FT", "AET", "PEN"].includes(statusShort)) {
        for (const sub of matchingSubs) {
          const prefs = sub.preferences || {};
          if (prefs.fulltime === false) continue;

          await dispatchPush(sub, {
            title: `🏁 FIM DE JOGO: ${fx.teams.home.name} ${score} ${fx.teams.away.name}`,
            body: `Partida encerrada! Placar final: ${fx.teams.home.name} ${score} ${fx.teams.away.name}.`,
            icon: fx.teams.home.logo,
            badge: "/icon-192.png",
            tag: `fulltime-${fx.fixture.id}`,
            data: { url: `/#/jogo/${fx.fixture.id}` }
          });
        }
      }

      // Evento D: Eventos Dinâmicos de Lance (Gols e Cartões Vermelhos)
      const eventsResp = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${fx.fixture.id}`, {
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
        const teamName = ev.team?.name || "Seu time";
        const playerName = ev.player?.name || "Jogador";

        // GOL
        if (ev.type === "Goal" && ev.detail !== "Missed Penalty") {
          for (const sub of matchingSubs) {
            const prefs = sub.preferences || {};
            if (prefs.goals === false) continue;

            await dispatchPush(sub, {
              title: `⚽ GOL DO ${teamName.toUpperCase()}! (${ev.time.elapsed}')`,
              body: `${playerName} marca para o ${teamName}! (${fx.teams.home.name} ${score} ${fx.teams.away.name})`,
              icon: ev.team?.logo || fx.teams.home.logo,
              badge: "/icon-192.png",
              tag: `goal-${fx.fixture.id}-${ev.time.elapsed}-${ev.player?.id || ''}`,
              data: { url: `/#/jogo/${fx.fixture.id}` }
            });
          }
        } 
        // CARTÃO VERMELHO
        else if (ev.type === "Card" && (ev.detail === "Red Card" || ev.detail === "Yellow Red")) {
          for (const sub of matchingSubs) {
            const prefs = sub.preferences || {};
            if (prefs.redcards === false) continue;

            await dispatchPush(sub, {
              title: `🟥 CARTÃO VERMELHO! (${ev.time.elapsed}')`,
              body: `${playerName} (${teamName}) foi expulso da partida!`,
              icon: ev.team?.logo || fx.teams.home.logo,
              badge: "/icon-192.png",
              tag: `redcard-${fx.fixture.id}-${ev.time.elapsed}-${ev.player?.id || ''}`,
              data: { url: `/#/jogo/${fx.fixture.id}` }
            });
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
