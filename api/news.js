// api/news.js
// Agregador Serverless de Manchetes e Notícias Esportivas em Tempo Real
// Consulta o feed RSS do Google Notícias, aplica filtros rigorosos de desambiguação de clubes,
// ordena da mais recente para a mais antiga e retorna o top 6 notícias precisas.

module.exports = async (req, res) => {
  const team = req.query.team;

  if (!team || typeof team !== "string" || !team.trim()) {
    res.status(400).json({ error: "Parâmetro 'team' é obrigatório." });
    return;
  }

  let cleanTeam = team.trim()
    .replace(/\bDA\b/gi, "da")
    .replace(/\bDE\b/gi, "de")
    .replace(/\bDO\b/gi, "do");

  // Se o nome tiver mais de 1 palavra (ex: "Vasco da Gama", "Real Madrid"), usa aspas para busca exata
  const isMultiWord = cleanTeam.includes(" ");
  const queryStr = isMultiWord ? `"${cleanTeam}"` : `"${cleanTeam}" futebol`;
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(queryStr)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

  try {
    const rssResp = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml"
      }
    });

    if (!rssResp.ok) {
      res.status(rssResp.status).json({ error: "Falha ao buscar feed de notícias." });
      return;
    }

    const xml = await rssResp.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    // Dicionário de termos negativos para desambiguação de homônimos / divisões estaduais menores
    const EXCLUSIONS = {
      vasco: [
        "vasco-pi", "vasco-ac", "vasco-se", "vasco-ap", "atlético-pi", "atletico-pi",
        "piauiense", "piauí", "piaui", "acreano", "garanhuns", "içara", "série a2 do piauí", "campeonato piauiense"
      ],
      botafogo: [
        "botafogo-sp", "botafogo-pb", "botafogo-ba", "botafogo da paraíba",
        "botafogo de ribeirão", "paraibano", "paulistão a2"
      ],
      flamengo: [
        "flamengo-pi", "flamengo-sp", "flamengo-se", "flamengo-ba",
        "flamengo de guarulhos", "flamengo de arcoverde", "piauiense"
      ],
      fluminense: [
        "fluminense de feira", "flu de feira", "fluminense-pi", "fluminense-ba", "piauiense"
      ],
      barcelona: [
        "barcelona de ilhéus", "barcelona-ro", "barcelona-ba", "barcelona de guayaquil", "baiano"
      ],
      athletico: [
        "atlético-pi", "atletico-ce", "atletico-ba"
      ],
      santos: [
        "santos-ap", "santos-pb"
      ],
      operario: [
        "operário-ms", "operário-mt"
      ]
    };

    const teamLower = cleanTeam.toLowerCase();
    const teamKey = Object.keys(EXCLUSIONS).find(k => teamLower.includes(k));
    const negativeList = teamKey ? EXCLUSIONS[teamKey] : [];

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemContent = match[1];
      const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/);

      let rawTitle = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim() : "";
      let source = sourceMatch ? sourceMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim() : "";

      // No Google News RSS, o título geralmente termina com " - NomeDaFonte"
      if (!source && rawTitle.includes(" - ")) {
        const parts = rawTitle.split(" - ");
        source = parts.pop().trim();
        rawTitle = parts.join(" - ").trim();
      } else if (source && rawTitle.endsWith(" - " + source)) {
        rawTitle = rawTitle.slice(0, -(source.length + 3)).trim();
      }

      // Decodificar entidades HTML no título
      rawTitle = rawTitle
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

      const lowerTitle = rawTitle.toLowerCase();

      // Filtro de exclusão de homônimos / clubes de divisões inferiores não correspondentes
      if (negativeList.some(neg => lowerTitle.includes(neg))) {
        continue;
      }

      const link = linkMatch ? linkMatch[1].trim() : "";
      const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : "";
      let timestamp = 0;
      let timeAgo = "";

      if (pubDateStr) {
        try {
          const pubDate = new Date(pubDateStr);
          timestamp = pubDate.getTime();
          const now = new Date();
          const diffMs = now - pubDate;
          const diffMins = Math.floor(diffMs / (1000 * 60));
          const diffHours = Math.floor(diffMins / 60);
          const diffDays = Math.floor(diffHours / 24);

          if (diffMins < 60) {
            timeAgo = diffMins <= 1 ? "Agora mesmo" : `Há ${diffMins} min`;
          } else if (diffHours < 24) {
            timeAgo = `Há ${diffHours}h`;
          } else {
            timeAgo = diffDays === 1 ? "Ontem" : `Há ${diffDays} dias`;
          }
        } catch {
          timeAgo = "";
        }
      }

      if (rawTitle && link) {
        items.push({
          title: rawTitle,
          source: source || "Portal de Notícias",
          link,
          pubDate: pubDateStr,
          timestamp,
          timeAgo: timeAgo || "Recente"
        });
      }
    }

    // Ordenar estritamente da mais nova para a mais antiga
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Limitar rigorosamente às 6 notícias mais recentes
    const top6 = items.slice(0, 6);

    res.setHeader("Cache-Control", "public, max-age=180, s-maxage=300");
    res.status(200).json({
      team: cleanTeam,
      count: top6.length,
      items: top6
    });
  } catch (err) {
    res.status(502).json({
      error: "Erro ao processar notícias esportivas.",
      details: err.message
    });
  }
};
