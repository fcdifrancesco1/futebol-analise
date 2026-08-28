// api/news.js
// Agregador Serverless de Manchetes e Notícias Esportivas em Tempo Real
// Consulta o feed RSS do Google Notícias para o clube solicitado e formata as manchetes com links externos.

module.exports = async (req, res) => {
  const team = req.query.team;

  if (!team || typeof team !== "string" || !team.trim()) {
    res.status(400).json({ error: "Parâmetro 'team' é obrigatório." });
    return;
  }

  const cleanTeam = team.trim();
  const query = encodeURIComponent(`${cleanTeam} futebol`);
  const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

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

    while ((match = itemRegex.exec(xml)) !== null && items.length < 12) {
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

      const link = linkMatch ? linkMatch[1].trim() : "";
      const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : "";
      let timeAgo = "";

      if (pubDateStr) {
        try {
          const pubDate = new Date(pubDateStr);
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
          timeAgo: timeAgo || "Recente"
        });
      }
    }

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900");
    res.status(200).json({
      team: cleanTeam,
      count: items.length,
      items
    });
  } catch (err) {
    res.status(502).json({
      error: "Erro ao processar notícias esportivas.",
      details: err.message
    });
  }
};
