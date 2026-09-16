// Heuristic scores for comparison, not calibrated match probabilities.
function finiteAverage(value, fallback = 1) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function recentHeadToHead(h2h, teamAId, teamBId) {
  return (Array.isArray(h2h) ? h2h : []).filter(f =>
    ["FT", "AET", "PEN"].includes(f.fixture?.status?.short) &&
    ((f.teams?.home?.id === teamAId && f.teams?.away?.id === teamBId) ||
     (f.teams?.home?.id === teamBId && f.teams?.away?.id === teamAId)) &&
    Number.isFinite(f.goals?.home) && Number.isFinite(f.goals?.away)
  ).sort((a,b) => new Date(b.fixture?.date) - new Date(a.fixture?.date)).slice(0,6);
}

function computeProbability(statsA, statsB, h2h, homeTeamId) {
  const isAHome = homeTeamId ? homeTeamId === statsA.team.id : null;
  const isBHome = homeTeamId ? homeTeamId === statsB.team.id : null;

  const winRate = (s, isHome) => {
    if (!s.fixtures.played.total) return 0.5;
    if (isHome === null) return s.fixtures.wins.total / s.fixtures.played.total;
    const side = isHome ? "home" : "away";
    const played = s.fixtures.played[side] || 1;
    return (s.fixtures.wins[side] || 0) / played;
  };

  const goalDiffScore = (s, isHome) => {
    const side = isHome === null ? "total" : isHome ? "home" : "away";
    const gf = finiteAverage(s.goals.for.average[side]);
    const ga = finiteAverage(s.goals.against.average[side]);
    return Math.min(1, Math.max(0, (gf - ga + 3) / 6));
  };

  const formScore = (s) => {
    const map = { W: 1, D: 0.35, L: 0 };
    const chars = (s.form || "").split("").slice(-5);
    if (!chars.length) return 0.5;
    return chars.reduce((sum, c) => sum + (map[c] ?? 0.35), 0) / chars.length;
  };

  const strength = (s, isHome) =>
    40 * winRate(s, isHome) + 25 * goalDiffScore(s, isHome) + 20 * formScore(s);

  let strengthA = strength(statsA, isAHome);
  let strengthB = strength(statsB, isBHome);

  const recent = recentHeadToHead(h2h, statsA.team.id, statsB.team.id);
  let scoreA = 0.5, scoreB = 0.5;
  if (recent.length) {
    scoreA = recent.reduce((sum, f) => {
      const home = f.teams.home.id === statsA.team.id;
      const gf = home ? f.goals.home : f.goals.away;
      const ga = home ? f.goals.away : f.goals.home;
      return sum + (gf > ga ? 1 : gf === ga ? 0.5 : 0);
    }, 0) / recent.length;
    scoreB = 1 - scoreA;
  }
  strengthA += 15 * scoreA;
  strengthB += 15 * scoreB;

  if (isAHome) strengthA += 6;
  if (isBHome) strengthB += 6;

  const diff = strengthA - strengthB;
  const drawProb = Math.min(28, Math.max(16, 25 - Math.abs(diff) * 0.25));
  const remaining = 100 - drawProb;
  const sig = 1 / (1 + Math.exp(-diff / 14));
  
  let probA = Math.round(remaining * sig);
  let probB = Math.round(remaining - probA);
  const probDraw = 100 - probA - probB;

  return { probA, probB, probDraw };
}

function buildJustifications(statsA, statsB, h2h, homeTeamId) {
  const j = [];
  const nameA = statsA.team.name, nameB = statsB.team.name;

  const wrA = ((statsA.fixtures.wins.total / (statsA.fixtures.played.total || 1)) * 100);
  const wrB = ((statsB.fixtures.wins.total / (statsB.fixtures.played.total || 1)) * 100);

  j.push({
    side: wrA === wrB ? "n" : wrA > wrB ? "a" : "b",
    text: `Aproveitamento na temporada: ${nameA} venceu ${wrA.toFixed(0)}% dos jogos vs ${wrB.toFixed(0)}% do ${nameB}.`,
  });

  const gfA = parseFloat(statsA.goals.for.average.total) || 0;
  const gfB = parseFloat(statsB.goals.for.average.total) || 0;
  j.push({
    side: gfA === gfB ? "n" : gfA > gfB ? "a" : "b",
    text: `Ataque: ${nameA} marca em média ${gfA.toFixed(2)} gols/jogo vs ${gfB.toFixed(2)} do ${nameB}.`,
  });

  if (homeTeamId) {
    const homeName = homeTeamId === statsA.team.id ? nameA : nameB;
    j.push({ side: homeTeamId === statsA.team.id ? "a" : "b", text: `Fator Casa: ${homeName} atua como mandante (+6 pontos internos de força; não são pontos percentuais).` });
  }

  return j;
}


const PlayerRatingEngine = {
  NOTA_BASE: 6.0,
  NOTA_MIN: 3.0,
  NOTA_MAX: 10.0,
  MINUTOS_MINIMOS: 10,

  PRECISAO_ESPERADA: { G: 0.65, D: 0.82, M: 0.83, F: 0.74 },
  PASSES_REFERENCIA: { G: 30, D: 55, M: 55, F: 25 },

  PESOS_DISCRETOS: {
    G: {
      gol: 3.0, assistencia: 1.2,
      penaltiDefendido: 1.5, penaltiSofrido: 0.4, penaltiCometido: -0.8,
      penaltiConvertido: 0.8, penaltiPerdido: -0.7,
      amarelo: -0.30, vermelho: -1.60, golContra: -1.20,
    },
    D: {
      gol: 1.60, assistencia: 1.00,
      penaltiDefendido: 0, penaltiSofrido: 0.40, penaltiCometido: -0.80,
      penaltiConvertido: 0.60, penaltiPerdido: -0.70,
      amarelo: -0.22, vermelho: -1.40, golContra: -1.00,
    },
    M: {
      gol: 1.30, assistencia: 0.90,
      penaltiDefendido: 0, penaltiSofrido: 0.40, penaltiCometido: -0.70,
      penaltiConvertido: 0.55, penaltiPerdido: -0.70,
      amarelo: -0.22, vermelho: -1.40, golContra: -0.90,
    },
    F: {
      gol: 1.10, assistencia: 0.85,
      penaltiDefendido: 0, penaltiSofrido: 0.45, penaltiCometido: -0.60,
      penaltiConvertido: 0.50, penaltiPerdido: -0.80,
      amarelo: -0.20, vermelho: -1.30, golContra: -0.90,
    },
  },

  PESOS_VOLUME: {
    G: {
      defesa: 0.16, chuteNoGol: 0.10, chuteFora: 0.02, passeDecisivo: 0.12,
      desarme: 0.06, interceptacao: 0.10, bloqueio: 0.12,
      dribleCerto: 0.02, dribleErrado: -0.02, driblado: -0.10,
      dueloGanho: 0.030, dueloPerdido: -0.020,
      faltaSofrida: 0.020, faltaCometida: -0.040, impedimento: 0,
    },
    D: {
      defesa: 0, chuteNoGol: 0.16, chuteFora: 0.04, passeDecisivo: 0.14,
      desarme: 0.11, interceptacao: 0.11, bloqueio: 0.13,
      dribleCerto: 0.07, dribleErrado: -0.03, driblado: -0.08,
      dueloGanho: 0.038, dueloPerdido: -0.018,
      faltaSofrida: 0.025, faltaCometida: -0.045, impedimento: -0.03,
    },
    M: {
      defesa: 0, chuteNoGol: 0.16, chuteFora: 0.04, passeDecisivo: 0.15,
      desarme: 0.10, interceptacao: 0.10, bloqueio: 0.10,
      dribleCerto: 0.08, dribleErrado: -0.035, driblado: -0.06,
      dueloGanho: 0.035, dueloPerdido: -0.018,
      faltaSofrida: 0.030, faltaCometida: -0.040, impedimento: -0.04,
    },
    F: {
      defesa: 0, chuteNoGol: 0.18, chuteFora: 0.045, passeDecisivo: 0.15,
      desarme: 0.07, interceptacao: 0.07, bloqueio: 0.07,
      dribleCerto: 0.09, dribleErrado: -0.035, driblado: -0.03,
      dueloGanho: 0.032, dueloPerdido: -0.015,
      faltaSofrida: 0.030, faltaCometida: -0.035, impedimento: -0.06,
    },
  },

  PESOS_CONTEXTO: {
    G: { golMarcado: 0.06, golSofrido: -0.32, cleanSheet: 0.80 },
    D: { golMarcado: 0.10, golSofrido: -0.24, cleanSheet: 0.55 },
    M: { golMarcado: 0.14, golSofrido: -0.14, cleanSheet: 0.22 },
    F: { golMarcado: 0.16, golSofrido: -0.08, cleanSheet: 0.10 },
  },

  num(v) {
    return v === null || v === undefined ? 0 : Number(v) || 0;
  },

  clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  },

  normalizarPosicao(pos) {
    const p = String(pos || '').trim().toUpperCase();
    return ['G', 'D', 'M', 'F'].includes(p) ? p : 'M';
  },

  resolverPasses(passes) {
    if (!passes) return null;
    const total = this.num(passes.total);
    if (total <= 0) return null;
    if (passes.accuracy === null || passes.accuracy === undefined) return null;

    const acc = Number(passes.accuracy);
    if (Number.isNaN(acc)) return null;

    let certos;
    if (acc <= total && acc > 0) {
      certos = acc;
    } else {
      certos = total * (acc / 100);
    }
    if (acc <= 100 && acc > total * 0.98 && total > 100) {
      certos = total * (acc / 100);
    }
    return { certos, precisao: this.clamp(certos / total, 0, 1) };
  },

  fatorVolume(minutos) {
    const m = Math.max(minutos, 1);
    return this.clamp(Math.sqrt(90 / m), 1.0, 1.6);
  },

  calcularNota(stats, ctx = {}, opcoes = {}) {
    const usarContextoTime = opcoes.usarContextoTime ?? true;
    const minutosMinimos = opcoes.minutosMinimos ?? this.MINUTOS_MINIMOS;

    const minutos = this.num(stats?.games?.minutes);
    if (minutos < minutosMinimos) {
      return { nota: null, detalhe: { motivo: 'minutos_insuficientes', minutos } };
    }

    const pos = this.normalizarPosicao(stats?.games?.position);
    const pd = this.PESOS_DISCRETOS[pos];
    const pv = this.PESOS_VOLUME[pos];
    const pc = this.PESOS_CONTEXTO[pos];

    const golsMarcados = this.num(ctx.golsMarcados);
    const golsSofridos = this.num(ctx.golsSofridos);
    const golsContra = this.num(ctx.golsContra);

    // 1. Eventos discretos
    const golsTotais = this.num(stats?.goals?.total);
    const penConvertidos = this.num(stats?.penalty?.scored);
    const golsAbertos = Math.max(golsTotais - penConvertidos, 0);

    let discreto = 0;
    discreto += golsAbertos * pd.gol;
    discreto += penConvertidos * pd.penaltiConvertido;
    discreto += this.num(stats?.goals?.assists) * pd.assistencia;
    discreto += this.num(stats?.penalty?.missed) * pd.penaltiPerdido;
    discreto += this.num(stats?.penalty?.saved) * pd.penaltiDefendido;
    discreto += this.num(stats?.penalty?.won) * pd.penaltiSofrido;
    discreto += this.num(stats?.penalty?.commited || stats?.penalty?.committed) * pd.penaltiCometido;
    discreto += this.num(stats?.cards?.yellow) * pd.amarelo;
    discreto += this.num(stats?.cards?.red) * pd.vermelho;
    discreto += golsContra * pd.golContra;

    // 2. Eventos de volume
    const chutesTotais = this.num(stats?.shots?.total);
    const chutesNoGol = this.num(stats?.shots?.on);
    const chutesFora = Math.max(chutesTotais - chutesNoGol, 0);

    const dribTent = this.num(stats?.dribbles?.attempts);
    const dribCertos = this.num(stats?.dribbles?.success);
    const dribErrados = Math.max(dribTent - dribCertos, 0);

    const duelosTotal = this.num(stats?.duels?.total);
    const duelosGanhos = this.num(stats?.duels?.won);
    const duelosPerdidos = Math.max(duelosTotal - duelosGanhos, 0);

    let volume = 0;
    volume += this.num(stats?.goals?.saves) * pv.defesa;
    volume += chutesNoGol * pv.chuteNoGol;
    volume += chutesFora * pv.chuteFora;
    volume += this.num(stats?.passes?.key) * pv.passeDecisivo;
    volume += this.num(stats?.tackles?.total) * pv.desarme;
    volume += this.num(stats?.tackles?.interceptions) * pv.interceptacao;
    volume += this.num(stats?.tackles?.blocks) * pv.bloqueio;
    volume += dribCertos * pv.dribleCerto;
    volume += dribErrados * pv.dribleErrado;
    volume += this.num(stats?.dribbles?.past) * pv.driblado;
    volume += duelosGanhos * pv.dueloGanho;
    volume += duelosPerdidos * pv.dueloPerdido;
    volume += this.num(stats?.fouls?.drawn) * pv.faltaSofrida;
    volume += this.num(stats?.fouls?.committed) * pv.faltaCometida;
    volume += this.num(stats?.offsides) * pv.impedimento;

    volume *= this.fatorVolume(minutos);

    // 3. Precisão de passe
    let contribPasse = 0;
    const p = this.resolverPasses(stats?.passes);
    if (p) {
      const desvio = p.precisao - this.PRECISAO_ESPERADA[pos];
      const pesoVolume = this.clamp(this.num(stats.passes.total) / this.PASSES_REFERENCIA[pos], 0, 1.5);
      contribPasse = desvio * 3.0 * pesoVolume;
      contribPasse = this.clamp(contribPasse, -0.9, 0.9);
    }

    // 4. Contexto de time
    let contexto = 0;
    if (usarContextoTime) {
      contexto += golsMarcados * pc.golMarcado;
      contexto += golsSofridos * pc.golSofrido;
      if (golsSofridos === 0) contexto += pc.cleanSheet;
      contexto *= this.clamp(minutos / 90, 0.35, 1);
    }

    // 5. Consolidação
    const bruto = this.NOTA_BASE + discreto + volume + contribPasse + contexto;
    const nota = Number(this.clamp(bruto, this.NOTA_MIN, this.NOTA_MAX).toFixed(1));

    return {
      nota,
      detalhe: {
        posicao: pos,
        minutos,
        base: this.NOTA_BASE,
        discreto: Number(discreto.toFixed(3)),
        volume: Number(volume.toFixed(3)),
        passe: Number(contribPasse.toFixed(3)),
        contexto: Number(contexto.toFixed(3)),
        bruto: Number(bruto.toFixed(3)),
        ratingApi: stats?.games?.rating ? Number(stats.games.rating) : null,
      },
    };
  },

  extrairGolsContra(events = []) {
    const mapa = {};
    (events || []).forEach((e) => {
      if (e.type === 'Goal' && (e.detail === 'Own Goal' || (e.comments && /own goal/i.test(e.comments))) && e.player?.id) {
        mapa[e.player.id] = (mapa[e.player.id] || 0) + 1;
      }
    });
    return mapa;
  },

  processarNotasPartida(fixturePlayersArr, fx, events = []) {
    if (!Array.isArray(fixturePlayersArr) || fixturePlayersArr.length === 0) {
      return { playersMap: {}, mvpId: null, melhorNota: 0 };
    }

    const mapaGolsContra = this.extrairGolsContra(events);
    const homeTeamId = fx?.teams?.home?.id;
    const homeGoals = fx?.goals?.home ?? 0;
    const awayGoals = fx?.goals?.away ?? 0;

    const resultadoPorJogador = {};
    let melhorNota = 0;
    let mvpId = null;

    fixturePlayersArr.forEach((bloco) => {
      const isHome = bloco.team?.id === homeTeamId;
      const golsMarcados = isHome ? homeGoals : awayGoals;
      const golsSofridos = isHome ? awayGoals : homeGoals;

      (bloco.players || []).forEach((item) => {
        const stats = item.statistics?.[0];
        if (!stats) return;

        const pid = item.player?.id;
        if (!pid) return;

        const { nota, detalhe } = this.calcularNota(
          stats,
          {
            golsMarcados,
            golsSofridos,
            golsContra: this.num(mapaGolsContra[pid]),
          }
        );

        const ratingFinal = nota !== null ? nota : (stats.games?.rating ? parseFloat(stats.games.rating) : null);

        if (ratingFinal !== null && ratingFinal > melhorNota && ratingFinal >= 7.0) {
          melhorNota = ratingFinal;
          mvpId = pid;
        }

        resultadoPorJogador[pid] = {
          player: item.player,
          team: bloco.team,
          statistics: item.statistics,
          ratingCalculado: nota,
          ratingFinal: ratingFinal !== null ? ratingFinal.toFixed(1) : (stats.games?.rating || null),
          detalheNota: detalhe
        };
      });
    });

    return { playersMap: resultadoPorJogador, mvpId, melhorNota };
  }
};


if (typeof module !== 'undefined') module.exports = { computeProbability, buildJustifications, PlayerRatingEngine, recentHeadToHead, finiteAverage };
