function getLeagueBroadcasters(leagueId, homeTeam, awayTeam, fx) {
  const tA = homeTeam?.name || "Time Mandante";
  const tB = awayTeam?.name || "Time Visitante";
  const hLower = String(tA).toLowerCase();
  const aLower = String(tB).toLowerCase();

  // Links oficiais das transmissões ao vivo dos canais do YouTube (evita vídeos antigos gravados)
  const cazeTvUrl = "https://www.youtube.com/@CazeTV/streams";
  const goatUrl = "https://www.youtube.com/@canalgoatbr/streams";
  const searchLiveYT = `https://www.youtube.com/results?search_query=${encodeURIComponent(tA + ' x ' + tB + ' ao vivo')}&sp=CAM%253D`;

  // Clubes da Liga Forte União (LFU) - Mandantes com jogos selecionados na CazéTV / Prime Video / Premiere
  const LFU_HOME_TEAMS = [
    "vasco", "cruzeiro", "corinthians", "internacional", "fluminense",
    "fortaleza", "athletico", "criciuma", "criciúma", "juventude", "cuiaba", "cuiabá", "atletico-go", "atlético-go"
  ];

  const isLfuHome = LFU_HOME_TEAMS.some(t => hLower.includes(t));

  // 1. Brasileirão Série A (71)
  if (leagueId === 71) {
    if (isLfuHome) {
      return [
        { name: "Premiere", tag: "Todos os Jogos (Pay-per-view)", logo: "/broadcast-logos/premiere.png", color: "#0056B3", bg: "rgba(0, 86, 179, 0.15)", border: "rgba(0, 86, 179, 0.4)", url: "https://globoplay.globo.com/premiere/" },
        { name: "Prime Video", tag: "Jogos Selecionados (Streaming)", logo: "/broadcast-logos/prime-video.svg", color: "#00A8E1", bg: "rgba(0, 168, 225, 0.15)", border: "rgba(0, 168, 225, 0.4)", url: "https://www.primevideo.com/" },
        { name: "CazéTV", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl }
      ];
    } else {
      // Mandantes da Libra (Flamengo, Palmeiras, São Paulo, Atlético-MG, Grêmio, Bahia, Bragantino, Vitória, Santos)
      return [
        { name: "Premiere", tag: "Exclusivo Pay-per-view", logo: "/broadcast-logos/premiere.png", color: "#0056B3", bg: "rgba(0, 86, 179, 0.15)", border: "rgba(0, 86, 179, 0.4)", url: "https://globoplay.globo.com/premiere/" },
        { name: "SporTV", tag: "TV Fechada", logo: "/broadcast-logos/sportv.jpg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://globoplay.globo.com/sportv/" },
        { name: "TV Globo", tag: "TV Aberta (Rodadas Selecionadas)", logo: "/broadcast-logos/globo.jpg", color: "#FF6600", bg: "rgba(255, 102, 0, 0.15)", border: "rgba(255, 102, 0, 0.4)", url: "https://globoplay.globo.com/" }
      ];
    }
  }

  // 2. Brasileirão Série B (72)
  if (leagueId === 72) {
    return [
      { name: "Premiere", tag: "Todos os Jogos", logo: "/broadcast-logos/premiere.png", color: "#0056B3", bg: "rgba(0, 86, 179, 0.15)", border: "rgba(0, 86, 179, 0.4)", url: "https://globoplay.globo.com/premiere/" },
      { name: "SporTV", tag: "TV Fechada", logo: "/broadcast-logos/sportv.jpg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://globoplay.globo.com/sportv/" },
      { name: "Canal GOAT", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/canal-goat.png", color: "#FACC15", bg: "rgba(250, 204, 21, 0.15)", border: "rgba(250, 204, 21, 0.4)", url: goatUrl },
      { name: "TV Brasil", tag: "TV Aberta", logo: "/broadcast-logos/band.svg", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.4)", url: "https://tvbrasil.ebc.com.br/" }
    ];
  }

  // 3. Copa do Brasil (73)
  if (leagueId === 73) {
    return [
      { name: "Premiere", tag: "Pay-per-view", logo: "/broadcast-logos/premiere.png", color: "#0056B3", bg: "rgba(0, 86, 179, 0.15)", border: "rgba(0, 86, 179, 0.4)", url: "https://globoplay.globo.com/premiere/" },
      { name: "SporTV", tag: "TV Fechada", logo: "/broadcast-logos/sportv.jpg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://globoplay.globo.com/sportv/" },
      { name: "Prime Video", tag: "Streaming", logo: "/broadcast-logos/prime-video.svg", color: "#00A8E1", bg: "rgba(0, 168, 225, 0.15)", border: "rgba(0, 168, 225, 0.4)", url: "https://www.primevideo.com/" },
      { name: "TV Globo", tag: "TV Aberta", logo: "/broadcast-logos/globo.jpg", color: "#FF6600", bg: "rgba(255, 102, 0, 0.15)", border: "rgba(255, 102, 0, 0.4)", url: "https://globoplay.globo.com/" }
    ];
  }

  // 4. Copa Libertadores (13) & Sul-Americana (11)
  if (leagueId === 13 || leagueId === 11) {
    return [
      { name: "Disney+", tag: "100% dos Jogos", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" },
      { name: "Paramount+", tag: "Streaming", logo: "/broadcast-logos/paramount.svg", color: "#0064FF", bg: "rgba(0, 100, 255, 0.15)", border: "rgba(0, 100, 255, 0.4)", url: "https://www.paramountplus.com/" },
      { name: leagueId === 13 ? "TV Globo" : "SBT", tag: "TV Aberta", logo: leagueId === 13 ? "/broadcast-logos/globo.jpg" : "/broadcast-logos/sbt.svg", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.4)", url: leagueId === 13 ? "https://globoplay.globo.com/" : "https://www.sbt.com.br/ao-vivo" }
    ];
  }

  // 5. Champions League (2)
  if (leagueId === 2) {
    return [
      { name: "HBO Max", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/hbo-max.jpg", color: "#002BE7", bg: "rgba(0, 43, 231, 0.2)", border: "rgba(0, 43, 231, 0.5)", url: "https://www.max.com/" },
      { name: "SBT", tag: "TV Aberta (Terças)", logo: "/broadcast-logos/sbt.svg", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.4)", url: "https://www.sbt.com.br/ao-vivo" },
      { name: "YouTube", tag: "Buscar Transmissão", logo: "/broadcast-logos/youtube.svg", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: searchLiveYT }
    ];
  }

  // 6. La Liga Espanhola (140)
  if (leagueId === 140) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" },
      { name: "CazéTV", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl }
    ];
  }

  // 7. Premier League (39) e Serie A Italiana (135)
  if (leagueId === 39 || leagueId === 135) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" }
    ];
  }

  // 8. Bundesliga (78)
  if (leagueId === 78) {
    return [
      { name: "Canal GOAT", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/canal-goat.png", color: "#FACC15", bg: "rgba(250, 204, 21, 0.15)", border: "rgba(250, 204, 21, 0.4)", url: goatUrl },
      { name: "CazéTV", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl },
      { name: "SporTV", tag: "TV Fechada", logo: "/broadcast-logos/sportv.jpg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://globoplay.globo.com/sportv/" },
      { name: "OneFootball", tag: "App / Site", logo: "/broadcast-logos/onefootball.svg", color: "#00E5FF", bg: "rgba(0, 229, 255, 0.15)", border: "rgba(0, 229, 255, 0.4)", url: "https://onefootball.com/pt-br/inicio" }
    ];
  }

  // 9. Liga Saudita (307)
  if (leagueId === 307) {
    return [
      { name: "Canal GOAT", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/canal-goat.png", color: "#FACC15", bg: "rgba(250, 204, 21, 0.15)", border: "rgba(250, 204, 21, 0.4)", url: goatUrl },
      { name: "BandSports", tag: "TV Fechada", logo: "/broadcast-logos/band.svg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://bandsports.band.uol.com.br/" }
    ];
  }

  // Liga Portuguesa (94) & Copa de Portugal (96)
  if (leagueId === 94 || leagueId === 96) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" }
    ];
  }

  // Eredivisie (88) & Copa da Holanda (90)
  if (leagueId === 88 || leagueId === 90) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" }
    ];
  }

  // Campeonato Turco (203) & Copa da Turquia (206)
  if (leagueId === 203 || leagueId === 206) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" },
      { name: "Canal GOAT", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/canal-goat.png", color: "#FACC15", bg: "rgba(250, 204, 21, 0.15)", border: "rgba(250, 204, 21, 0.4)", url: goatUrl }
    ];
  }

  // Copa do Rei Saudita (504)
  if (leagueId === 504) {
    return [
      { name: "Canal GOAT", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/canal-goat.png", color: "#FACC15", bg: "rgba(250, 204, 21, 0.15)", border: "rgba(250, 204, 21, 0.4)", url: goatUrl },
      { name: "BandSports", tag: "TV Fechada", logo: "/broadcast-logos/band.svg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://bandsports.band.uol.com.br/" }
    ];
  }

  // Copas Nacionais Europeias
  // Copa do Rei (143), Copa da Inglaterra (45), Copa da Liga Inglesa (48), Copa da Itália (137), Copa da Alemanha (81)
  if (leagueId === 143 || leagueId === 45 || leagueId === 48 || leagueId === 137 || leagueId === 81) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" }
    ];
  }

  // Copa da França (66)
  if (leagueId === 66) {
    return [
      { name: "CazéTV", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl },
      { name: "Prime Video", tag: "Streaming", logo: "/broadcast-logos/prime-video.svg", color: "#00A8E1", bg: "rgba(0, 168, 225, 0.15)", border: "rgba(0, 168, 225, 0.4)", url: "https://www.primevideo.com/" }
    ];
  }

  // 10. Ligue 1 (61) / Europa League (3) / Conference League (848)
  if (leagueId === 61 || leagueId === 3 || leagueId === 848) {
    return [
      { name: "CazéTV", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl },
      { name: "Band", tag: "TV Aberta", logo: "/broadcast-logos/band.svg", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.4)", url: "https://www.band.uol.com.br/ao-vivo" },
      { name: "Prime Video", tag: "Streaming", logo: "/broadcast-logos/prime-video.svg", color: "#00A8E1", bg: "rgba(0, 168, 225, 0.15)", border: "rgba(0, 168, 225, 0.4)", url: "https://www.primevideo.com/" }
    ];
  }

  // 11. Competições de Seleções: Amistosos (10), Copa do Mundo (1), Copa América (9), Eliminatórias (14), Eurocopa (4), Nations League (5)
  if (leagueId === 10 || leagueId === 1 || leagueId === 9 || leagueId === 14 || leagueId === 4 || leagueId === 5) {
    return [
      { name: "TV Globo", tag: "TV Aberta", logo: "/broadcast-logos/globo.jpg", color: "#FF6600", bg: "rgba(255, 102, 0, 0.15)", border: "rgba(255, 102, 0, 0.4)", url: "https://globoplay.globo.com/" },
      { name: "SporTV", tag: "TV Fechada", logo: "/broadcast-logos/sportv.jpg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://globoplay.globo.com/sportv/" },
      { name: "CazéTV", tag: "YouTube / Prime Video", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl },
      { name: "Disney+", tag: "Streaming", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" }
    ];
  }

  // Fallback Geral
  return [
    { name: "Disney+", tag: "Streaming", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
    { name: "HBO Max", tag: "Streaming", logo: "/broadcast-logos/hbo-max.jpg", color: "#002BE7", bg: "rgba(0, 43, 231, 0.2)", border: "rgba(0, 43, 231, 0.5)", url: "https://www.max.com/" },
    { name: "Premiere", tag: "Pay-per-view", logo: "/broadcast-logos/premiere.png", color: "#0056B3", bg: "rgba(0, 86, 179, 0.15)", border: "rgba(0, 86, 179, 0.4)", url: "https://globoplay.globo.com/" }
  ];
}

function renderMatchBroadcastGuide(fx) {
  if (!fx || !fx.teams) return "";
  const broadcasters = getLeagueBroadcasters(fx.league?.id, fx.teams.home, fx.teams.away, fx);
  // Suggestions are static and do not establish current broadcast rights.

  return `
    <div class="match-broadcast-card">
      <div class="match-broadcast-header">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="match-broadcast-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--gold);">
              <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
              <polyline points="17 2 12 7 7 2"></polyline>
            </svg>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:var(--chalk);">Onde consultar transmissão</h3>
              <span style="font-family:var(--font-mono);font-size:0.7rem;background:rgba(255,184,0,0.15);color:var(--gold);padding:2px 8px;border-radius:12px;font-weight:700;border:1px solid rgba(255,184,0,0.3);">Possíveis canais</span>
            </div>
            <p style="margin:3px 0 0 0;font-size:0.8rem;color:var(--chalk-dim);">
              Consulte a programação dos canais para <strong style="color:var(--chalk);">${escapeHtml(fx.teams.home.name)} × ${escapeHtml(fx.teams.away.name)}</strong>:
            </p>
          </div>
        </div>
      </div>

      <p class="data-disclaimer">Sugestões sem confirmação para esta partida. Direitos e disponibilidade variam por região e data; confirme no canal.</p>
      <div class="match-broadcast-buttons">
        ${broadcasters.map(b => `
          <a href="${b.url}" target="_blank" rel="noopener noreferrer" class="btn-broadcast-card" style="--btn-color:${b.color};--btn-bg:${b.bg};--btn-border:${b.border};" title="Consultar programação de ${escapeHtml(b.name)}">
            <div class="btn-broadcast-logo-wrap">
              <img src="${b.logo}" alt="${escapeHtml(b.name)}" class="btn-broadcast-logo" loading="lazy" data-image-fallback="hide">
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;">
              <span class="btn-broadcast-name">${escapeHtml(b.name)}</span>
              ${b.tag ? `<span style="font-size:0.65rem;color:var(--chalk-dim);font-family:var(--font-mono);">${escapeHtml(b.tag)}</span>` : ''}
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="btn-broadcast-arrow">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </a>
        `).join("")}
      </div>
    </div>
  `;
}
