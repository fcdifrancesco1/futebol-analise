// ============================================================
// Vercel Serverless Function — Robô de Monitoramento e Disparo Push
// ============================================================

const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
// Aceita SERVICE_ROLE_KEY com prioridade para leitura segura no backend com RLS ativo, ou ANON_KEY
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contato@futstats.com";

let vapidConfigured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  } catch (e) {
    console.warn("Erro ao configurar VAPID:", e.message);
  }
}

const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

module.exports = async (req, res) => {
  // Verificação de Autorização (Fail-Closed: exige autorização válida)
  const authHeader = req.headers["authorization"] || "";
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized = isVercelCron || (cronSecret && authHeader === `Bearer ${cronSecret}`);
  if (!isAuthorized) {
    return res.status(401).json({ error: "Acesso não autorizado ao robô de alertas." });
  }

  if (!FOOTBALL_API_KEY) {
    return res.status(500).json({ error: "FOOTBALL_API_KEY não configurada nas variáveis de ambiente da Vercel." });
  }

  if (!supabase) {
    return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY não configurada." });
  }

  if (!vapidConfigured) {
    return res.status(500).json({ error: "VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY não configurada." });
  }

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

    // Helper para enviar push exatamente uma única vez por evento/tag
    let notificationsSent = 0;
    const errors = [];
    const subUpdates = new Map(); // endpoint -> updated sent_events array

    const dispatchPushOnce = async (sub, payloadObj) => {
      const tag = payloadObj.tag;
      const currentSentEvents = subUpdates.get(sub.endpoint) || (sub.preferences?.sent_events || []);

      // Se a notificação já foi disparada anteriormente para este celular, ignora!
      if (tag && currentSentEvents.includes(tag)) {
        return false;
      }

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payloadObj),
          {
            TTL: 86400, // 24 horas de retenção caso o celular esteja temporariamente sem rede
            urgency: "high" // Força o Google FCM a acordar o Chrome imediatamente mesmo com app fechado
          }
        );
        notificationsSent++;

        if (tag) {
          const nextSentEvents = [...currentSentEvents, tag].slice(-60); // Mantém últimos 60 eventos para não inflar o JSON
          subUpdates.set(sub.endpoint, nextSentEvents);
        }
        return true;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          errors.push(err.message);
        }
        return false;
      }
    };

    // 2. Buscar jogos ao vivo e jogos de hoje no fuso brasileiro
    const todayBR = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    const [liveResp, todayResp] = await Promise.all([
      fetch("https://v3.football.api-sports.io/fixtures?live=all", {
        headers: { "x-apisports-key": FOOTBALL_API_KEY }
      }),
      fetch(`https://v3.football.api-sports.io/fixtures?date=${todayBR}&timezone=America/Sao_Paulo`, {
        headers: { "x-apisports-key": FOOTBALL_API_KEY }
      })
    ]);

    const liveData = await liveResp.json();
    const todayData = await todayResp.json();

    const liveFixtures = liveData.response || [];
    const todayFixtures = todayData.response || [];

    // Mapear todas as partidas a serem verificadas
    const allRelevantFixturesMap = new Map();
    liveFixtures.forEach(f => allRelevantFixturesMap.set(f.fixture.id, f));
    todayFixtures.forEach(f => allRelevantFixturesMap.set(f.fixture.id, f));

    // 3. Processar cada partida relevante
    for (const [fixtureId, fx] of allRelevantFixturesMap.entries()) {
      const homeId = fx.teams.home.id;
      const awayId = fx.teams.away.id;
      const elapsed = fx.fixture.status.elapsed;
      const statusShort = fx.fixture.status.short;
      const baseScore = `${fx.goals.home ?? 0} x ${fx.goals.away ?? 0}`;

      // Filtrar inscritos que seguem os times OU esta partida específica (tolerância numérica e string)
      const matchingSubs = subscribers.filter(sub => {
        const favTeams = Array.isArray(sub.favorite_teams)
          ? sub.favorite_teams
          : (typeof sub.favorite_teams === "string" ? JSON.parse(sub.favorite_teams || "[]") : []);
        const favFixtures = sub.preferences?.favorite_fixtures || sub.favorite_fixtures || [];

        const followsTeam = favTeams.some(f => {
          const fid = typeof f === "object" && f !== null ? f.id : f;
          return Number(fid) === Number(homeId) || Number(fid) === Number(awayId);
        });
        const followsFixture = favFixtures.some(f => {
          const fid = typeof f === "object" && f !== null ? f.id : f;
          return Number(fid) === Number(fixtureId);
        });

        return followsTeam || followsFixture;
      });

      if (matchingSubs.length === 0) continue;

      // Evento 0: Alerta de Escalações Oficiais (Dispara estritamente 1 única vez quando saem as escalações)
      if (["NS", "TBD", "1H"].includes(statusShort)) {
        const pendingLineupSubs = matchingSubs.filter(sub => {
          const currentSent = subUpdates.get(sub.endpoint) || (sub.preferences?.sent_events || []);
          return sub.preferences?.lineups !== false && !currentSent.includes(`lineups-${fixtureId}`);
        });

        if (pendingLineupSubs.length > 0) {
          try {
            const lineupsResp = await fetch(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`, {
              headers: { "x-apisports-key": FOOTBALL_API_KEY }
            });
            const lineupsData = await lineupsResp.json();
            const lineups = lineupsData.response || [];

            if (lineups.length > 0 && (lineups[0]?.startXI?.length > 0 || lineups[1]?.startXI?.length > 0)) {
              for (const sub of pendingLineupSubs) {
                await dispatchPushOnce(sub, {
                  title: `📋 ESCALAÇÕES CONFIRMADAS!`,
                  body: `As escalações oficiais de ${fx.teams.home.name} × ${fx.teams.away.name} já estão no ar!`,
                  icon: fx.teams.home.logo || "https://futebol-analise.vercel.app/icon-192.png",
                  badge: "https://futebol-analise.vercel.app/badge-96.png",
                  tag: `lineups-${fixtureId}`,
                  data: { url: `/#/jogo/${fixtureId}` }
                });
              }
            }
          } catch (e) {
            console.warn("Erro ao checar escalações:", e.message);
          }
        }
      }

      // Evento A: Início de Partida (1H - primeiros 15 minutos com proteção anti-duplicação)
      if (statusShort === "1H" && (elapsed === null || elapsed === undefined || elapsed <= 15)) {
        for (const sub of matchingSubs) {
          const prefs = sub.preferences || {};
          if (prefs.kickoff === false) continue;

          await dispatchPushOnce(sub, {
            title: `⏱️ BOLA ROLANDO!`, 
            body: `⏱️ Começou ${fx.teams.home.name} × ${fx.teams.away.name} pela ${fx.league.name}!`,
            icon: fx.teams.home.logo,
            badge: "https://futebol-analise.vercel.app/badge-96.png",
            tag: `kickoff-${fixtureId}`,
            data: { url: `/#/jogo/${fixtureId}` }
          });
        }
      }

      // Evento B: Intervalo (HT)
      if (statusShort === "HT") {
        for (const sub of matchingSubs) {
          const prefs = sub.preferences || {};
          if (prefs.halftime === false) continue;

          await dispatchPushOnce(sub, {
            title: `⏸️ INTERVALO: ${fx.teams.home.name} ${baseScore} ${fx.teams.away.name}`,
            body: `Fim do primeiro tempo! Placar parcial: ${fx.teams.home.name} ${baseScore} ${fx.teams.away.name}.`,
            icon: fx.teams.home.logo,
            badge: "https://futebol-analise.vercel.app/badge-96.png",
            tag: `halftime-${fixtureId}`,
            data: { url: `/#/jogo/${fixtureId}` }
          });
        }
      }

      // Evento C: Fim de Jogo (FT, AET, PEN)
      if (["FT", "AET", "PEN"].includes(statusShort)) {
        for (const sub of matchingSubs) {
          const prefs = sub.preferences || {};
          if (prefs.fulltime === false) continue;

          await dispatchPushOnce(sub, {
            title: `🏁 FIM DE JOGO: ${fx.teams.home.name} ${baseScore} ${fx.teams.away.name}`,
            body: `Partida encerrada! Placar final: ${fx.teams.home.name} ${baseScore} ${fx.teams.away.name}.`,
            icon: fx.teams.home.logo,
            badge: "https://futebol-analise.vercel.app/badge-96.png",
            tag: `fulltime-${fixtureId}`,
            data: { url: `/#/jogo/${fixtureId}` }
          });
        }
      }

      // Evento D: Eventos Dinâmicos de Lance (Gols e Cartões Vermelhos nos jogos ao vivo)
      if (["1H", "2H", "ET", "P", "LIVE"].includes(statusShort)) {
        try {
          const eventsResp = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`, {
            headers: { "x-apisports-key": FOOTBALL_API_KEY }
          });
          const eventsData = await eventsResp.json();
          const events = eventsData.response || [];

          // Calcular o placar real atual baseado na contagem de gols da lista de eventos
          let realHomeGoals = 0;
          let realAwayGoals = 0;
          events.forEach(e => {
            if (e.type === "Goal" && e.detail !== "Missed Penalty") {
              if (e.team?.id === homeId) realHomeGoals++;
              else if (e.team?.id === awayId) realAwayGoals++;
            }
          });

          // Filtrar eventos dos últimos 3 minutos
          const recentEvents = events.filter(e => {
            const eventMin = e.time?.elapsed;
            return elapsed && (elapsed - eventMin <= 3 && elapsed - eventMin >= 0);
          });

          for (const ev of recentEvents) {
            const teamName = ev.team?.name || "Seu time";
            const rawPlayer = ev.player?.name;
            const isOwnGoal = ev.detail === "Own Goal";
            const isPen = ev.detail === "Penalty";

            // GOL
            if (ev.type === "Goal" && ev.detail !== "Missed Penalty") {
              // Garante que o time que marcou tenha pelo menos 1 gol ou o valor real acumulado
              const finalHomeGoals = Math.max(realHomeGoals, fx.goals?.home ?? 0, (ev.team?.id === homeId ? 1 : 0));
              const finalAwayGoals = Math.max(realAwayGoals, fx.goals?.away ?? 0, (ev.team?.id === awayId ? 1 : 0));
              const dynamicScore = `${finalHomeGoals} x ${finalAwayGoals}`;

              let playerPhrase = "";
              if (rawPlayer && rawPlayer.trim() && rawPlayer.toLowerCase() !== "jogador") {
                playerPhrase = `${rawPlayer}${isPen ? ' (pênalti)' : isOwnGoal ? ' (contra)' : ''} marca aos ${ev.time.elapsed}'!`;
              } else {
                playerPhrase = `Gol ${isOwnGoal ? 'contra ' : ''}do ${teamName} aos ${ev.time.elapsed}'!`;
              }

              for (const sub of matchingSubs) {
                const prefs = sub.preferences || {};
                if (prefs.goals === false) continue;

                await dispatchPushOnce(sub, {
                  title: `⚽ GOL DO ${teamName.toUpperCase()}!`, 
                  body: `⚽ ${playerPhrase} ${fx.teams.home.name} ${dynamicScore} ${fx.teams.away.name}`,
                  icon: ev.team?.logo || fx.teams.home.logo,
                  badge: "https://futebol-analise.vercel.app/badge-96.png",
                  tag: `goal-${fixtureId}-${ev.time.elapsed}-${ev.player?.id || ev.team?.id || ''}`,
                  data: { url: `/#/jogo/${fixtureId}` }
                });
              }
            } 
            // CARTÃO VERMELHO
            else if (ev.type === "Card" && (ev.detail === "Red Card" || ev.detail === "Yellow Red")) {
              const playerName = (rawPlayer && rawPlayer.trim() && rawPlayer.toLowerCase() !== "jogador") ? rawPlayer : teamName;
              
              for (const sub of matchingSubs) {
                const prefs = sub.preferences || {};
                if (prefs.redcards === false) continue;

                await dispatchPushOnce(sub, {
                  title: `🟥 CARTÃO VERMELHO!`, 
                  body: `🟥 ${playerName} (${teamName}) foi expulso aos ${ev.time.elapsed}'!`,
                  icon: ev.team?.logo || fx.teams.home.logo,
                  badge: "https://futebol-analise.vercel.app/badge-96.png",
                  tag: `redcard-${fixtureId}-${ev.time.elapsed}-${ev.player?.id || ''}`,
                  data: { url: `/#/jogo/${fixtureId}` }
                });
              }
            }
          }
        } catch (e) {
          console.warn("Erro ao processar eventos do jogo:", e.message);
        }
      }
    }

    // 4. Salvar histórico de eventos já enviados para evitar qualquer repetição nos próximos ciclos
    if (subUpdates.size > 0) {
      for (const [endpoint, updatedEvents] of subUpdates.entries()) {
        const targetSub = subscribers.find(s => s.endpoint === endpoint);
        if (targetSub) {
          const mergedPrefs = {
            ...(targetSub.preferences || {}),
            sent_events: updatedEvents
          };
          await supabase
            .from("push_subscriptions")
            .update({ preferences: mergedPrefs, updated_at: new Date().toISOString() })
            .eq("endpoint", endpoint);
        }
      }
    }

    return res.status(200).json({
      success: true,
      matchesChecked: allRelevantFixturesMap.size,
      liveMatches: liveFixtures.length,
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
