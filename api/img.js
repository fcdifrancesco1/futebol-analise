// api/img.js
// Proxy Serverless de Imagens para contornar bloqueadores de anúncio (AdBlock, Brave, Pi-Hole, DNS)
// Permite que escudos de times e fotos de jogadores carreguem em qualquer navegador ou rede restrita.

module.exports = async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== "string" || !url.startsWith("https://media.api-sports.io/")) {
    res.status(400).send("URL de imagem inválida ou não autorizada.");
    return;
  }

  try {
    const imgResp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!imgResp.ok) {
      res.status(imgResp.status).send("Imagem não encontrada.");
      return;
    }

    const contentType = imgResp.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await imgResp.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
    res.send(buffer);
  } catch (err) {
    res.status(502).send("Falha ao carregar imagem via proxy.");
  }
};
