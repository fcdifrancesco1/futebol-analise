// Placar da disputa de pênaltis (score.penalty), ou null se não houve disputa.
function penaltyShootoutScore(f) {
  const pen = f?.score?.penalty;
  if (!pen || pen.home == null || pen.away == null) return null;
  return { home: pen.home, away: pen.away };
}

// "2 (4) : (3) 2" quando houve pênaltis; "2 : 2" caso contrário.
function scoreWithPenaltiesHtml(f, fallback = "-") {
  const home = f?.goals?.home ?? fallback;
  const away = f?.goals?.away ?? fallback;
  const pen = penaltyShootoutScore(f);
  if (!pen) return `${home} : ${away}`;
  return `${home} <span class="pen-score">(${pen.home})</span> : <span class="pen-score">(${pen.away})</span> ${away}`;
}

function formatLiveMatchTime(status, events = null) {
  if (!status) return "";
  const short = String(status.short || "").toUpperCase();
  const elapsed = status.elapsed;
  const extra = status.extra != null ? Number(status.extra) : null;

  // Status sem minutos decorridos
  if (short === "HT") return "INT";
  if (short === "BT") return "PROR";
  if (short === "P") return "PÊN";
  if (["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"].includes(short)) return "FIM";

  if (elapsed === null || elapsed === undefined) {
    return short || "";
  }

  // 1. Primeiro Tempo (1H)
  if (short === "1H") {
    if (extra && extra > 0) {
      return `45+${extra}'`;
    }
    if (elapsed > 45) {
      return `45+${elapsed - 45}'`;
    }
    if (elapsed === 45 && Array.isArray(events) && events.length) {
      const extraFromEvents = Math.max(
        0,
        ...events
          .filter(e => (e.time?.elapsed === 45 || (e.time?.elapsed > 45 && e.time?.elapsed < 50)) && e.time?.extra)
          .map(e => Number(e.time.extra) || 0)
      );
      if (extraFromEvents > 0) return `45+${extraFromEvents}'`;
    }
    return `${elapsed}'`;
  }

  // 2. Segundo Tempo (2H)
  if (short === "2H") {
    if (extra && extra > 0) {
      return `90+${extra}'`;
    }
    if (elapsed > 90) {
      return `90+${elapsed - 90}'`;
    }
    if (elapsed === 90 && Array.isArray(events) && events.length) {
      const extraFromEvents = Math.max(
        0,
        ...events
          .filter(e => e.time?.elapsed >= 90 && e.time?.extra)
          .map(e => Number(e.time.extra) || 0)
      );
      if (extraFromEvents > 0) return `90+${extraFromEvents}'`;
    }
    return `${elapsed}'`;
  }

  // 3. Prorrogação (ET)
  if (short === "ET") {
    if (elapsed > 120) {
      return `120+${extra || (elapsed - 120)}'`;
    }
    if (elapsed === 120 && extra && extra > 0) {
      return `120+${extra}'`;
    }
    if (elapsed > 105) {
      return `105+${extra || (elapsed - 105)}'`;
    }
    if (elapsed === 105 && extra && extra > 0) {
      return `105+${extra}'`;
    }
    return `${elapsed}'`;
  }

  // 4. Fallback genérico ao vivo
  if (extra && extra > 0) {
    if (elapsed >= 90) return `90+${extra}'`;
    if (elapsed >= 45) return `45+${extra}'`;
    return `${elapsed}+${extra}'`;
  }
  if (elapsed > 90) return `90+${elapsed - 90}'`;
  if (elapsed > 45 && short !== "2H") return `45+${elapsed - 45}'`;

  return `${elapsed}'`;
}

// Textos de status em pt-BR (a API manda códigos e "long" em inglês). O código (short)
// continua sendo usado na lógica; só o que aparece na tela passa por aqui.
const MATCH_STATUS_PT = {
  NS: "Não iniciado", TBD: "Horário a definir", "1H": "1º tempo", HT: "Intervalo", "2H": "2º tempo",
  ET: "Prorrogação", BT: "Intervalo da prorrogação", P: "Pênaltis", LIVE: "Ao vivo", SUSP: "Suspenso",
  INT: "Interrompido", FT: "Encerrado", AET: "Encerrado na prorrogação", PEN: "Encerrado nos pênaltis",
  PST: "Adiado", CANC: "Cancelado", ABD: "Abandonado", AWD: "W.O.", WO: "W.O."
};
const MATCH_FINISHED_SHORT_PT = { FT: "Fim", AET: "Fim (prorr.)", PEN: "Fim (pên.)", AWD: "W.O.", WO: "W.O." };
function matchStatusLongPt(status) {
  const short = String(status?.short || "").toUpperCase();
  return MATCH_STATUS_PT[short] || String(status?.long || "");
}

// Detalhe de evento da partida em pt-BR ("Normal Goal", "Yellow Card", "Substitution 2"...)
const EVENT_DETAIL_PT = {
  "normal goal": "Gol", "own goal": "Gol contra", "penalty": "Pênalti", "missed penalty": "Pênalti perdido",
  "yellow card": "Cartão amarelo", "red card": "Cartão vermelho", "second yellow card": "Segundo amarelo",
  "goal": "Gol", "card": "Cartão", "subst": "Substituição", "var": "VAR"
};
function eventDetailPt(detail) {
  const d = String(detail || "").trim();
  const sub = d.match(/^substitution\s*(\d+)?$/i);
  if (sub) return sub[1] ? `Substituição ${sub[1]}` : "Substituição";
  return EVENT_DETAIL_PT[d.toLowerCase()] || d;
}

function getMatchStatusCategory(fixture) {
  if (!fixture) return { isLive: false, isFinished: false, isScheduled: true, isPostponed: false, isStaleLive: false, label: "NS", short: "NS", badgeHtml: `<span class="fixture-date">--:--</span>` };
  const status = fixture.status || {};
  const short = String(status.short || "").toUpperCase();
  const kickoff = fixture.date ? new Date(fixture.date).getTime() : 0;
  const minutesSinceKickoff = kickoff > 0 ? (Date.now() - kickoff) / 60000 : 0;

  // 1. Partidas ao vivo (1H, 2H, HT, ET, P, BT, LIVE)
  const liveShorts = ["1H", "2H", "HT", "ET", "P", "BT", "LIVE"];
  if (liveShorts.includes(short)) {
    // PROTEÇÃO CONTRA JOGOS CONGELADOS NO FEED DA API:
    // Se a partida começou há mais de 160 minutos (2h40m) e o provedor ainda marca como 1H ou 2H,
    // o jogo na vida real já acabou e o feed da API-Sports travou sem emitir o status FT.
    if (minutesSinceKickoff > 160) {
      return {
        isLive: false,
        isFinished: true,
        isScheduled: false,
        isPostponed: false,
        isStaleLive: true,
        label: "Fim",
        short: "FT",
        badgeHtml: `<span class="fixture-date" style="color:var(--chalk-dim);font-weight:600;" title="Partida encerrada (feed da transmissão finalizado em ${status.elapsed || 90}')">Fim</span>`
      };
    }
    const timeDisplay = formatLiveMatchTime(status);
    return {
      isLive: true,
      isFinished: false,
      isScheduled: false,
      isPostponed: false,
      isStaleLive: false,
      label: timeDisplay,
      short,
      badgeHtml: `<span class="fixture-date" style="color:#10B981;font-weight:700;"><i class="live-dot" aria-hidden="true"></i>${timeDisplay}</span>`
    };
  }

  // 2. Partidas Finalizadas
  const finishedShorts = ["FT", "AET", "PEN", "AWD", "WO"];
  const isFinishedText = String(status.long || "").toLowerCase().includes("finish") || 
                         String(status.long || "").toLowerCase().includes("encerrado") ||
                         String(status.long || "").toLowerCase().includes("final");
  if (finishedShorts.includes(short) || isFinishedText) {
    return {
      isLive: false,
      isFinished: true,
      isScheduled: false,
      isPostponed: false,
      isStaleLive: false,
      label: MATCH_FINISHED_SHORT_PT[short] || "Fim",
      short: short || "FT",
      badgeHtml: `<span class="fixture-date" style="color:var(--chalk-dim);font-weight:600;" title="${matchStatusLongPt({ short: short || "FT" })}">${MATCH_FINISHED_SHORT_PT[short] || "Fim"}</span>`
    };
  }

  // 3. Partidas Adiadas, Canceladas, Suspensas ou Interrompidas
  if (["PST", "CANC", "ABD", "SUSP", "INT"].includes(short)) {
    let label = "Adiado";
    let color = "#F59E0B";
    if (short === "CANC") { label = "Cancelado"; color = "#EF4444"; }
    else if (short === "ABD") { label = "Abandonado"; color = "#EF4444"; }
    else if (short === "SUSP") { label = "Suspenso"; color = "#F59E0B"; }
    else if (short === "INT") { label = "Interrompido"; color = "#F59E0B"; }

    return {
      isLive: false,
      isFinished: false,
      isScheduled: false,
      isPostponed: true,
      isStaleLive: false,
      label,
      short,
      badgeHtml: `<span class="fixture-date" style="color:${color};font-weight:600;">${label}</span>`
    };
  }

  // 4. Partidas Agendadas / Não Iniciadas (NS, TBD)
  const timeStr = fixture.date ? new Date(fixture.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
  if (short === "NS" || short === "TBD") {
    // Se o horário programado era há mais de 120 minutos e a API ainda está como NS
    if (short === "NS" && minutesSinceKickoff > 120) {
      return {
        isLive: false,
        isFinished: false,
        isScheduled: true,
        isPostponed: false,
        isStaleLive: false,
        label: "Aguardando",
        short: "NS",
        badgeHtml: `<span class="fixture-date" style="color:var(--gold);font-weight:600;" title="Início previsto para ${timeStr}, aguardando sinal da transmissão">${timeStr} (Aguardando)</span>`
      };
    }
    return {
      isLive: false,
      isFinished: false,
      isScheduled: true,
      isPostponed: false,
      isStaleLive: false,
      label: timeStr,
      short: short || "NS",
      badgeHtml: `<span class="fixture-date">${timeStr}</span>`
    };
  }

  // Fallback padrão
  return {
    isLive: false,
    isFinished: false,
    isScheduled: true,
    isPostponed: false,
    isStaleLive: false,
    label: short || timeStr,
    short: short || "NS",
    badgeHtml: `<span class="fixture-date">${short || timeStr}</span>`
  };
}

// ============================================================
// ============================================================
// Formatador Rigoroso de Rodadas e Copas
// ============================================================
function formatRoundName(r) {
  if (!r) return "Partidas";
  let s = String(r).trim();

  // 1. Se for fase de grupos ou fase de liga com número (ex: Group Stage - 1, League Stage - 4, etc.)
  const groupMatch = s.match(/(?:Group Stage|League Stage|Fase de Grupos|Fase de Liga|Fase de Grupo)\s*-\s*(\d+)/i);
  if (groupMatch) {
    return `Fase de Grupos — Rodada ${groupMatch[1]}`;
  }

  // 2. Se for liga de pontos corridos (ex: Regular Season - 14, Round 14, Rodada 14)
  if (/Regular Season\s*-\s*\d+/i.test(s) || /^Round\s*\d+$/i.test(s) || /^Rodada\s*\d+$/i.test(s)) {
    const matchNum = s.match(/\d+/);
    if (matchNum) return `Rodada ${matchNum[0]}`;
  }

  const isLeg1 = /[-_ ]1$|\b1st leg\b|\bida\b/i.test(s);
  const isLeg2 = /[-_ ]2$|\b2nd leg\b|\bvolta\b/i.test(s);
  const legSuffix = isLeg1 ? " — Jogo de Ida" : isLeg2 ? " — Jogo de Volta" : "";
  const cleanPhase = s.replace(/[-_ ]\d+$/, "").replace(/\s*-\s*(1st|2nd)\s*Leg/i, "").trim();

  // 3. Fases de mata-mata em ordem estrita de prioridade (evita que 1st Round vire Final)
  if (/Round of 64|1st Qualifying|1ª Fase|1st Round/i.test(cleanPhase)) return "1ª Fase" + legSuffix;
  if (/2nd Qualifying|2ª Fase|2nd Round/i.test(cleanPhase)) return "2ª Fase" + legSuffix;
  if (/3rd Qualifying|3ª Fase|3rd Round/i.test(cleanPhase)) return "3ª Fase" + legSuffix;
  if (/Round of 32|16th Finals|16 avos/i.test(cleanPhase)) return "16 avos de Final" + legSuffix;
  if (/Round of 16|8th Finals|Oitavas/i.test(cleanPhase)) return "Oitavas de Final" + legSuffix;
  if (/Quarter-finals|Quarterfinals|Quartas/i.test(cleanPhase)) return "Quartas de Final" + legSuffix;
  if (/Semi-finals|Semifinals|Semifinal/i.test(cleanPhase)) return "Semifinal" + legSuffix;
  if (/^Final$|^Finals$|Grande Final|Championship Final/i.test(cleanPhase)) return "Grande Final" + legSuffix;
  if (/Play-offs|Playoffs/i.test(cleanPhase)) return "Play-offs" + legSuffix;
  if (/Group Stage|Fase de Grupos/i.test(cleanPhase)) return "Fase de Grupos";
  if (/Preliminary/i.test(cleanPhase)) return "Fase Preliminar" + legSuffix;

  // Fallback para qualquer número de rodada
  const matchNum = s.match(/\d+/);
  if (matchNum && /Round|Rodada/i.test(s)) return `Rodada ${matchNum[0]}`;

  return cleanPhase + legSuffix;
}

function extractRoundNumber(title) {
  const t = String(title).toLowerCase();
  if (t.includes("fase preliminar")) return 1;
  if (t.includes("1ª fase") || t.includes("1ª pré") || t.includes("1st qualifying")) return 2;
  if (t.includes("2ª fase") || t.includes("2ª pré") || t.includes("2nd qualifying")) return 3;
  if (t.includes("3ª fase") || t.includes("3ª pré") || t.includes("3rd qualifying")) return 4;
  if (t.includes("play-offs") || t.includes("playoff")) return 5;
  
  if (t.includes("fase de grupos") || t.includes("fase de liga")) {
    const m = title.match(/\d+/);
    return m ? 10 + parseInt(m[0], 10) : 10;
  }

  if (t.includes("16 avos") || t.includes("round of 32")) return 50;
  if (t.includes("oitavas") || t.includes("round of 16")) return 60;
  if (t.includes("quartas") || t.includes("quarter")) return 70;
  if (t.includes("semifinal") || t.includes("semi-finals")) return 80;
  if (t.includes("grande final") || t.includes("final")) return 90;

  const m = title.match(/\d+/);
  return m ? parseInt(m[0], 10) : 9999;
}

const CL_2026_SCHEDULE = {"1635606":[7,"2027-01-20T19:00:00+00:00"],"1635607":[6,"2026-12-09T19:00:00+00:00"],"1635608":[4,"2026-11-04T19:00:00+00:00"],"1635609":[8,"2027-01-27T19:00:00+00:00"],"1635610":[1,"2026-09-15T19:00:00+00:00"],"1635611":[4,"2026-11-03T19:00:00+00:00"],"1635612":[7,"2027-01-19T19:00:00+00:00"],"1635613":[6,"2026-12-08T19:00:00+00:00"],"1635614":[2,"2026-09-30T19:00:00+00:00"],"1635615":[5,"2026-11-24T19:00:00+00:00"],"1635616":[4,"2026-11-03T19:00:00+00:00"],"1635617":[8,"2027-01-27T19:00:00+00:00"],"1635618":[3,"2026-10-20T19:00:00+00:00"],"1635619":[8,"2027-01-27T19:00:00+00:00"],"1635620":[5,"2026-11-24T19:00:00+00:00"],"1635621":[1,"2026-09-15T19:00:00+00:00"],"1635622":[6,"2026-12-09T19:00:00+00:00"],"1635623":[2,"2026-09-30T19:00:00+00:00"],"1635624":[7,"2027-01-20T19:00:00+00:00"],"1635625":[4,"2026-11-04T19:00:00+00:00"],"1635626":[3,"2026-10-21T19:00:00+00:00"],"1635627":[6,"2026-12-09T19:00:00+00:00"],"1635628":[5,"2026-11-24T19:00:00+00:00"],"1635629":[7,"2027-01-20T19:00:00+00:00"],"1635630":[2,"2026-09-29T19:00:00+00:00"],"1635631":[5,"2026-11-24T19:00:00+00:00"],"1635632":[4,"2026-11-03T19:00:00+00:00"],"1635633":[3,"2026-10-20T19:00:00+00:00"],"1635634":[8,"2027-01-27T19:00:00+00:00"],"1635635":[4,"2026-11-04T19:00:00+00:00"],"1635636":[1,"2026-09-16T19:00:00+00:00"],"1635637":[6,"2026-12-09T19:00:00+00:00"],"1635638":[3,"2026-10-20T19:00:00+00:00"],"1635639":[5,"2026-11-24T19:00:00+00:00"],"1635640":[6,"2026-12-08T19:00:00+00:00"],"1635641":[7,"2027-01-19T19:00:00+00:00"],"1635642":[3,"2026-10-21T19:00:00+00:00"],"1635643":[2,"2026-09-30T19:00:00+00:00"],"1635644":[8,"2027-01-27T19:00:00+00:00"],"1635645":[5,"2026-11-25T19:00:00+00:00"],"1635646":[1,"2026-09-16T19:00:00+00:00"],"1635647":[5,"2026-11-25T19:00:00+00:00"],"1635648":[8,"2027-01-27T19:00:00+00:00"],"1635649":[3,"2026-10-21T19:00:00+00:00"],"1635650":[7,"2027-01-19T19:00:00+00:00"],"1635651":[3,"2026-10-20T19:00:00+00:00"],"1635652":[6,"2026-12-08T19:00:00+00:00"],"1635653":[1,"2026-09-15T19:00:00+00:00"],"1635654":[8,"2027-01-27T19:00:00+00:00"],"1635655":[7,"2027-01-19T19:00:00+00:00"],"1635656":[5,"2026-11-24T19:00:00+00:00"],"1635657":[1,"2026-09-16T19:00:00+00:00"],"1635658":[4,"2026-11-04T19:00:00+00:00"],"1635659":[1,"2026-09-16T19:00:00+00:00"],"1635660":[3,"2026-10-21T19:00:00+00:00"],"1635661":[6,"2026-12-09T19:00:00+00:00"],"1635662":[2,"2026-09-29T19:00:00+00:00"],"1635663":[6,"2026-12-08T19:00:00+00:00"],"1635664":[7,"2027-01-19T19:00:00+00:00"],"1635665":[4,"2026-11-03T19:00:00+00:00"],"1635666":[8,"2027-01-27T19:00:00+00:00"],"1635667":[7,"2027-01-20T19:00:00+00:00"],"1635668":[3,"2026-10-21T19:00:00+00:00"],"1635669":[6,"2026-12-09T19:00:00+00:00"],"1635670":[6,"2026-12-09T19:00:00+00:00"],"1635671":[4,"2026-11-04T19:00:00+00:00"],"1635672":[1,"2026-09-16T19:00:00+00:00"],"1635673":[8,"2027-01-27T19:00:00+00:00"],"1635674":[5,"2026-11-25T19:00:00+00:00"],"1635675":[3,"2026-10-21T19:00:00+00:00"],"1635676":[2,"2026-09-30T19:00:00+00:00"],"1635677":[1,"2026-09-16T19:00:00+00:00"],"1635678":[6,"2026-12-08T19:00:00+00:00"],"1635679":[3,"2026-10-20T19:00:00+00:00"],"1635680":[1,"2026-09-15T19:00:00+00:00"],"1635681":[2,"2026-09-29T19:00:00+00:00"],"1635682":[8,"2027-01-27T19:00:00+00:00"],"1635683":[2,"2026-09-29T19:00:00+00:00"],"1635684":[5,"2026-11-24T19:00:00+00:00"],"1635685":[3,"2026-10-20T19:00:00+00:00"],"1635686":[8,"2027-01-27T19:00:00+00:00"],"1635687":[2,"2026-09-29T19:00:00+00:00"],"1635688":[1,"2026-09-15T19:00:00+00:00"],"1635689":[7,"2027-01-19T19:00:00+00:00"],"1635690":[5,"2026-11-24T19:00:00+00:00"],"1635691":[4,"2026-11-03T19:00:00+00:00"],"1635692":[7,"2027-01-19T19:00:00+00:00"],"1635693":[2,"2026-09-29T19:00:00+00:00"],"1635694":[1,"2026-09-15T19:00:00+00:00"],"1635695":[3,"2026-10-20T19:00:00+00:00"],"1635696":[6,"2026-12-08T19:00:00+00:00"],"1635697":[4,"2026-11-03T19:00:00+00:00"],"1635698":[3,"2026-10-21T19:00:00+00:00"],"1635699":[1,"2026-09-16T19:00:00+00:00"],"1635700":[2,"2026-09-30T19:00:00+00:00"],"1635701":[6,"2026-12-09T19:00:00+00:00"],"1635702":[4,"2026-11-03T19:00:00+00:00"],"1635703":[7,"2027-01-19T19:00:00+00:00"],"1635704":[2,"2026-09-29T19:00:00+00:00"],"1635705":[6,"2026-12-08T19:00:00+00:00"],"1635706":[1,"2026-09-15T19:00:00+00:00"],"1635707":[6,"2026-12-08T19:00:00+00:00"],"1635708":[4,"2026-11-03T19:00:00+00:00"],"1635709":[3,"2026-10-20T19:00:00+00:00"],"1635710":[1,"2026-09-15T19:00:00+00:00"],"1635711":[2,"2026-09-29T19:00:00+00:00"],"1635712":[3,"2026-10-20T19:00:00+00:00"],"1635713":[4,"2026-11-03T19:00:00+00:00"],"1635714":[3,"2026-10-21T19:00:00+00:00"],"1635715":[8,"2027-01-27T19:00:00+00:00"],"1635716":[5,"2026-11-25T19:00:00+00:00"],"1635717":[4,"2026-11-04T19:00:00+00:00"],"1635718":[1,"2026-09-16T19:00:00+00:00"],"1635719":[2,"2026-09-30T19:00:00+00:00"],"1635720":[8,"2027-01-27T19:00:00+00:00"],"1635721":[7,"2027-01-20T19:00:00+00:00"],"1635722":[6,"2026-12-09T19:00:00+00:00"],"1635723":[7,"2027-01-20T19:00:00+00:00"],"1635724":[8,"2027-01-27T19:00:00+00:00"],"1635725":[5,"2026-11-25T19:00:00+00:00"],"1635726":[5,"2026-11-25T19:00:00+00:00"],"1635727":[4,"2026-11-04T19:00:00+00:00"],"1635728":[2,"2026-09-30T19:00:00+00:00"],"1635729":[8,"2027-01-27T19:00:00+00:00"],"1635730":[5,"2026-11-25T19:00:00+00:00"],"1635731":[7,"2027-01-20T19:00:00+00:00"],"1635732":[2,"2026-09-30T19:00:00+00:00"],"1635733":[4,"2026-11-04T19:00:00+00:00"],"1635734":[2,"2026-09-30T19:00:00+00:00"],"1635735":[8,"2027-01-27T19:00:00+00:00"],"1635736":[1,"2026-09-16T19:00:00+00:00"],"1635737":[6,"2026-12-08T19:00:00+00:00"],"1635738":[5,"2026-11-24T19:00:00+00:00"],"1635739":[7,"2027-01-19T19:00:00+00:00"],"1635740":[1,"2026-09-15T19:00:00+00:00"],"1635741":[2,"2026-09-29T19:00:00+00:00"],"1635742":[7,"2027-01-20T19:00:00+00:00"],"1635743":[5,"2026-11-25T19:00:00+00:00"],"1635744":[8,"2027-01-27T19:00:00+00:00"],"1635745":[3,"2026-10-21T19:00:00+00:00"],"1635746":[8,"2027-01-27T19:00:00+00:00"],"1635747":[7,"2027-01-20T19:00:00+00:00"],"1635748":[4,"2026-11-04T19:00:00+00:00"],"1635749":[5,"2026-11-25T19:00:00+00:00"]};

// Pre-processamento inteligente de Fase de Grupos/Fase de Liga da Champions e Copas:
function preprocessLeagueFixtures(allFixtures) {
  if (!Array.isArray(allFixtures) || allFixtures.length === 0) return allFixtures;

  allFixtures.forEach(f => {
    const sched = CL_2026_SCHEDULE[f.fixture?.id];
    if (sched) {
      f.league.round = "Group Stage - " + sched[0];
      f.fixture.date = sched[1];
    }
  });

  return allFixtures;
}

function skeletonTable() {
  return `
    <div class="card skeleton">
      <div class="skeleton-title skeleton"></div>
      <div class="skeleton-box skeleton"></div>
      <div class="skeleton-box skeleton"></div>
    </div>`;
}

function skeletonCards(count = 2) {
  return Array.from({ length: count }, () => `
    <div class="card skeleton" style="margin-bottom:16px;">
      <div class="skeleton-title skeleton"></div>
      <div class="skeleton-box skeleton"></div>
      <div class="skeleton-box skeleton"></div>
    </div>
  `).join("");
}

function errorBox(msg) {
  return `
    <div class="card" style="text-align:center;padding:40px 20px;">
      <h3 style="color:var(--terracotta);margin-top:0;">Falha ao carregar dados</h3>
      <p style="color:var(--chalk-dim);">${escapeHtml(msg)}</p>
      <button class="btn ghost small" data-action="reload">Tentar novamente</button>
    </div>`;
}

function subNav(items) {
  return `
    <div class="subnav">
      ${items.map(it => `<a class="subnav-item ${it.active ? 'active' : ''}" href="${it.href}">${escapeHtml(it.label)}</a>`).join('')}
    </div>`;
}

function breadcrumbs(crumbs) {
  return `
    <div class="breadcrumbs-bar">
      <nav class="breadcrumbs" aria-label="Rastro de navegação">
        ${crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return isLast 
            ? `<span>${escapeHtml(c.label)}</span>`
            : `<a href="${c.href}">${escapeHtml(c.label)}</a><span class="breadcrumbs-sep">/</span>`;
        }).join('')}
      </nav>
      <button class="btn-back" data-action="back" title="Retornar à tela anterior">
        ← Voltar
      </button>
    </div>`;
}

// Ícones de traço (no lugar de emojis): desenho único, herdam a cor do texto.
// Caminhos no estilo Lucide (ISC), redesenhados em 24x24.
const ICON_PATHS = {
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  ball: '<circle cx="12" cy="12" r="10"/><path d="m12 7 4.2 3-1.6 5h-5.2l-1.6-5z" fill="currentColor"/><path d="M12 2v5M16.2 10l5.3-1.7M14.6 15l3.3 4.6M9.4 15l-3.3 4.6M7.8 10 2.5 8.3"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
};
function icon(name, size = 16) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ""}</svg>`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Eficiência por minutos jogados: "1 a cada X min" e média por 90 min.
// Retorna null quando não há minutos ou nenhuma participação (evita "1 a cada ∞").
function perMinuteRate(count, minutes) {
  const n = Number(count), min = Number(minutes);
  if (!Number.isFinite(n) || !Number.isFinite(min) || n <= 0 || min <= 0) return null;
  return {
    minutesPer: Math.round(min / n),
    per90: (n * 90 / min).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    minutes: min
  };
}

function sanitizeUrl(url) {
  if (!url || typeof url !== "string") return "#";
  const trimmed = url.trim();
  try {
    if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("#")) {
      return escapeHtml(trimmed);
    }
    const base = (typeof window !== "undefined" && window.location && window.location.origin) ? window.location.origin : "https://futebol-analise.vercel.app";
    const parsed = new URL(trimmed, base);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return escapeHtml(trimmed);
    }
  } catch {
    // Malformed URL
  }
  return "#";
}

// Sigla de 3 letras para times no celular. Primeiras letras do nome, exceto:
// - siglas consagradas que evitam colisões no mesmo campeonato (CFC x COR, CAP x CAM);
// - prefixo de sigla ("AC Milan", "RB Leipzig") é descartado;
// - prefixo comum ("Manchester City", "Real Madrid", "Atletico-MG") vira inicial + 2 letras do nome seguinte.
const TEAM_SHORT_OVERRIDES = {
  "coritiba": "CFC", "corinthians": "COR", "athletico paranaense": "CAP", "atletico paranaense": "CAP",
  "atletico mg": "CAM", "atletico goianiense": "ACG", "rb bragantino": "RBB", "red bull bragantino": "RBB",
  "atletico madrid": "ATM", "bayern munchen": "BAY", "bayern munich": "BAY"
};
const TEAM_SHORT_PREFIXES = new Set(["manchester", "real", "atletico", "athletic", "athletico", "borussia", "bayer", "eintracht", "sporting", "west", "olympique", "racing", "deportivo"]);
function teamShortName(name) {
  const words = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[\s\-.]+/).filter(Boolean);
  const key = words.join(" ").toLowerCase();
  if (TEAM_SHORT_OVERRIDES[key]) return TEAM_SHORT_OVERRIDES[key];
  if (words.length > 1 && /^[A-Z]{2,3}$/.test(words[0])) words.shift();
  const letters = w => w.replace(/[^A-Za-z]/g, "");
  if (words.length > 1 && TEAM_SHORT_PREFIXES.has(words[0].toLowerCase()) && letters(words[1]).length >= 2) {
    return (letters(words[0])[0] + letters(words[1]).slice(0, 2)).toUpperCase();
  }
  return letters(words.join("")).slice(0, 3).toUpperCase();
}

// Número com vírgula decimal (pt-BR) para exibir; aceita número ou texto da API ("1.5").
function ptDecimal(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : String(value ?? "");
}

// Valor já formatado como texto ("7.5", "12.4%"): troca só o ponto decimal por vírgula.
function ptDecimalText(value) {
  return String(value ?? "").replace(/(\d)\.(\d)/g, "$1,$2");
}

// A API escreve muitos clubes brasileiros sem acento ("Sao Paulo", "Gremio"): só palavras inteiras.
const TEAM_NAME_ACCENTS = {
  Sao: "São", Vitoria: "Vitória", Gremio: "Grêmio", Atletico: "Atlético", Ceara: "Ceará", Goias: "Goiás",
  Cuiaba: "Cuiabá", America: "América", Avai: "Avaí", Criciuma: "Criciúma", Parana: "Paraná",
  Nautico: "Náutico", Operario: "Operário", Maringa: "Maringá"
};
const TEAM_NAME_ACCENT_RE = new RegExp(`\\b(${Object.keys(TEAM_NAME_ACCENTS).join("|")})\\b`, "g");
function formatTeamName(name) {
  if (!name) return "";
  return String(name)
    .replace(/^Atletico Paranaense$/, "Athletico Paranaense")
    .replace(/-sc$/i, "")
    .replace(TEAM_NAME_ACCENT_RE, w => TEAM_NAME_ACCENTS[w])
    .replace(/\bDA\b/g, "da")
    .replace(/\bDE\b/g, "de")
    .replace(/\bDO\b/g, "do")
    .replace(/\bDOS\b/g, "dos")
    .replace(/\bDAS\b/g, "das");
}

// ============================================================
// Preferências do Usuário & Time Favorito
// ============================================================
const UserPrefs = {
  KEY: "futstats_user_prefs_v1",
  get() {
    return safeReadStorage(browserStorage("localStorage"), this.KEY, {});
  },
  getFavoriteTeam() {
    return this.get().favoriteTeam || null;
  },
  setFavoriteTeam(team) {
    const prefs = this.get();
    prefs.favoriteTeam = team;
    prefs.onboarded = true;
    localStorage.setItem(this.KEY, JSON.stringify(prefs));
    updateFavoriteTeamHeader();

    // Garante que o clube favorito (ex: Real Madrid) entre nos alertas automáticos
    if (team && team.id) {
      const teamObj = { id: Number(team.id), name: team.name, logo: team.logo };
      if (!state.favoriteTeams.some(f => Number(f.id) === teamObj.id)) {
        state.favoriteTeams.push(teamObj);
      }
      if (typeof NotificationManager !== "undefined" && NotificationManager.syncPreferences) {
        NotificationManager.syncPreferences().catch(err => toast("Não foi possível sincronizar alertas: " + err.message));
      }
    }
  },
  hasOnboarded() {
    return !!this.get().onboarded;
  },
  setOnboarded() {
    const prefs = this.get();
    prefs.onboarded = true;
    localStorage.setItem(this.KEY, JSON.stringify(prefs));
  }
};

function updateFavoriteTeamHeader() {
  const btn = document.getElementById("btn-fav-team-header");
  if (!btn) return;
  const fav = UserPrefs.getFavoriteTeam();
  if (fav) {
    btn.innerHTML = `
      <img src="${fav.logo}" alt="" class="fav-team-crest" data-image-fallback="hide">
      <span style="font-size:0.65rem;opacity:0.7;margin-left:2px;">▾</span>
    `;
    btn.title = `Seu Time: ${formatTeamName(fav.name)} (Clique para trocar)`;
  } else {
    btn.innerHTML = `<span class="fav-team-label">${icon("star", 14)} Escolher time</span>`;
    btn.title = "Escolha seu time do coração";
  }
}

function showOnboardingModal(isChange = false) {
  let backdropEl = document.getElementById("onboarding-modal-backdrop");
  if (backdropEl) backdropEl.remove();

  backdropEl = document.createElement("div");
  backdropEl.id = "onboarding-modal-backdrop";
  backdropEl.className = "onboarding-backdrop";

  const POPULAR_CHOICES = [
    { id: 127, name: "Flamengo", logo: "https://media.api-sports.io/football/teams/127.png" },
    { id: 121, name: "Palmeiras", logo: "https://media.api-sports.io/football/teams/121.png" },
    { id: 529, name: "Barcelona", logo: "https://media.api-sports.io/football/teams/529.png" },
    { id: 541, name: "Real Madrid", logo: "https://media.api-sports.io/football/teams/541.png" },
    { id: 50, name: "Manchester City", logo: "https://media.api-sports.io/football/teams/50.png" },
    { id: 40, name: "Liverpool", logo: "https://media.api-sports.io/football/teams/40.png" }
  ];

  backdropEl.innerHTML = `
    <div class="onboarding-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div>
            <h3 style="margin:0;font-size:1.2rem;font-weight:800;color:var(--chalk);">${isChange ? 'Trocar Time do Coração' : 'Bem-vindo ao FutStats!'}</h3>
            <p style="margin:2px 0 0;font-size:0.8rem;color:var(--chalk-dim);">${isChange ? 'Escolha o novo clube para acompanhar notícias e receber alertas.' : 'Escolha seu time para receber notícias e alertas em tempo real.'}</p>
          </div>
        </div>
        <button id="btn-close-onboarding" style="background:none;border:none;color:var(--chalk);font-size:1.2rem;cursor:pointer;">✕</button>
      </div>

      <!-- Barra de busca com auto-complete -->
      <div style="margin-top:14px;position:relative;">
        <div style="display:flex;align-items:center;background:rgba(255,255,255,0.06);border:1px solid var(--line-strong);border-radius:var(--radius-sm);padding:0 12px;">
          <span style="color:var(--chalk-dim);margin-right:8px;display:inline-flex;">${icon("search", 16)}</span>
          <input type="text" id="input-onboarding-search" placeholder="Busque qualquer clube (ex: Corinthians, Chelsea, Grêmio...)" autocomplete="off" style="width:100%;background:transparent;border:none;color:var(--chalk);padding:10px 0;font-family:var(--font-body);font-size:0.88rem;outline:none;">
        </div>
        <div id="onboarding-search-results" style="margin-top:10px;display:none;max-height:220px;overflow-y:auto;"></div>
      </div>

      <!-- Atalhos Populares -->
      <div id="onboarding-popular-section" style="margin-top:18px;">
        <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--gold);font-weight:700;display:block;margin-bottom:8px;">SUGESTÕES POPULARES:</span>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:8px;">
          ${POPULAR_CHOICES.map(c => `
            <div class="onboarding-team-chip" data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-logo="${c.logo}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;cursor:pointer;transition:all 0.15s ease;">
              <img src="${c.logo}" alt="" style="width:24px;height:24px;object-fit:contain;" data-image-fallback="hide">
              <span style="font-size:0.8rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(c.name)}</span>
            </div>
          `).join("")}
        </div>
      </div>

      ${!isChange ? `
        <div style="margin-top:20px;text-align:center;">
          <button id="btn-skip-onboarding" style="background:none;border:none;color:var(--chalk-dim);font-size:0.78rem;cursor:pointer;text-decoration:underline;">
            Pular e escolher mais tarde
          </button>
        </div>
      ` : ''}
    </div>
  `;

  document.body.appendChild(backdropEl);

  function selectAndSaveTeam(team) {
    UserPrefs.setFavoriteTeam(team);
    if (!state.favoriteTeams.some(f => f.id === team.id)) {
      state.favoriteTeams.push({ id: team.id, name: team.name, logo: team.logo });
      NotificationManager.syncPreferences().catch(err => toast("Não foi possível sincronizar alertas: " + err.message));
    }
    backdropEl.remove();
    toast(`${team.name} definido como seu time do coração!`, false);
    if (!location.hash || location.hash === "#/") {
      renderHome();
    }
  }

  // Close / Skip
  document.getElementById("btn-close-onboarding")?.addEventListener("click", () => {
    UserPrefs.setOnboarded();
    backdropEl.remove();
  });
  document.getElementById("btn-skip-onboarding")?.addEventListener("click", () => {
    UserPrefs.setOnboarded();
    backdropEl.remove();
  });

  // Popular chips
  backdropEl.querySelectorAll(".onboarding-team-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      selectAndSaveTeam({
        id: Number(chip.dataset.id),
        name: chip.dataset.name,
        logo: chip.dataset.logo
      });
    });
  });

  // Search input
  const searchInput = document.getElementById("input-onboarding-search");
  const resultsContainer = document.getElementById("onboarding-search-results");
  const popularSection = document.getElementById("onboarding-popular-section");
  let searchDebounce;

  searchInput?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (q.length < 3) {
      resultsContainer.innerHTML = "";
      resultsContainer.style.display = "none";
      if (popularSection) popularSection.style.display = "block";
      return;
    }

    if (popularSection) popularSection.style.display = "none";
    resultsContainer.style.display = "block";
    resultsContainer.innerHTML = `<div style="padding:10px;text-align:center;color:var(--chalk-dim);font-size:0.8rem;">Buscando clubes...</div>`;

    searchDebounce = setTimeout(async () => {
      try {
        const resp = await apiGet("teams", { search: q }, 60);
        if (!searchInput.isConnected || searchInput.value.trim() !== q) return;
        if (!resp || !resp.length) {
          resultsContainer.innerHTML = `<div style="padding:10px;text-align:center;color:var(--chalk-dim);font-size:0.8rem;">Nenhum clube encontrado com "${escapeHtml(q)}".</div>`;
          return;
        }

        resultsContainer.innerHTML = resp.map(item => {
          const t = item.team;
          return `
            <div class="onboarding-search-item" data-id="${t.id}" data-name="${escapeHtml(t.name)}" data-logo="${t.logo}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:6px;margin-bottom:6px;cursor:pointer;">
              <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                <img src="${t.logo}" alt="" style="width:28px;height:28px;object-fit:contain;" data-image-fallback="hide">
                <div>
                  <div style="font-weight:700;font-size:0.85rem;color:var(--chalk);">${escapeHtml(t.name)}</div>
                  <div style="font-size:0.7rem;color:var(--gold);">${escapeHtml(t.country || "")}</div>
                </div>
              </div>
              <span style="font-size:0.75rem;color:var(--cyan);font-weight:700;">Escolher</span>
            </div>
          `;
        }).join("");

        resultsContainer.querySelectorAll(".onboarding-search-item").forEach(item => {
          item.addEventListener("click", () => {
            selectAndSaveTeam({
              id: Number(item.dataset.id),
              name: item.dataset.name,
              logo: item.dataset.logo
            });
          });
        });
      } catch (err) {
        if (err.name === 'AbortError' || !searchInput.isConnected || searchInput.value.trim() !== q) return;
        resultsContainer.innerHTML = `<div style="padding:10px;text-align:center;color:#EF4444;font-size:0.8rem;">Erro ao buscar clubes.</div>`;
      }
    }, 300);
  });
}

async function loadTeamNews(teamName, containerId) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const resp = await fetch(`/api/news?team=${encodeURIComponent(teamName)}`, { signal: routeController.signal });
    if (!resp.ok) throw new Error("Erro ao carregar notícias");
    const data = await resp.json();
    let items = data.items || [];

    // Só notícias dos últimos 14 dias, sem palpites de aposta; da mais nova para a mais velha, até 6
    const NEWS_MAX_AGE = 14 * 24 * 3600 * 1000;
    const tsMs = t => (t && t < 1e12 ? t * 1000 : t) || 0;
    items = items
      .filter(it => Date.now() - tsMs(it.timestamp) < NEWS_MAX_AGE && !/palpite|aposta|\bodds\b|\bbet\b/i.test(it.title || ""))
      .sort((a, b) => tsMs(b.timestamp) - tsMs(a.timestamp)).slice(0, 6);

    if (!items.length) {
      container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">Nenhuma notícia dos últimos 14 dias sobre este time.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="news-grid">
        ${items.map(item => `
          <a class="news-card-item" href="${sanitizeUrl(item.link)}" target="_blank" rel="noopener noreferrer" title="Ler matéria completa no portal ${escapeHtml(item.source)}">
            <div class="news-title">${escapeHtml(item.title)}</div>
            <div class="news-meta-row">
              <span class="news-source-badge">${escapeHtml(item.source)}</span>
              <div style="display:flex;align-items:center;gap:6px;">
                <span>${escapeHtml(item.timeAgo)}</span>
              </div>
            </div>
          </a>
        `).join("")}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">Não foi possível carregar as notícias agora.</div>`;
  }
}

// ============================================================
// Roteamento
// ============================================================
