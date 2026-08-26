// Proxy seguro para a API-Football via RapidAPI, no formato de Serverless Function da Vercel.
// A chave nunca fica exposta no frontend — fica só na variável de ambiente do projeto na Vercel.

const RAPIDAPI_HOST = "api-football-v1.p.rapidapi.com";

const ALLOWED_ENDPOINTS = new Set([
  "leagues",
  "teams",
  "teams/statistics",
  "standings",
  "fixtures",
  "fixtures/headtohead",
  "fixtures/events",
  "fixtures/lineups",
  "fixtures/statistics",
  "players/topscorers",
  "players/topassists",
  "players/topyellowcards",
  "players/topredcards",
  "players/squads",
  "injuries",
  "odds",
  "predictions",
]);

module.exports = async (req, res) => {
  const API_KEY = process.env.FOOTBALL_API_KEY;

  if (!API_KEY) {
    res.status(500).json({
      error: "FOOTBALL_API_KEY não configurada nas variáveis de ambiente da Vercel.",
    });
    return;
  }

  const { endpoint, ...rest } = req.query || {};

  if (!endpoint) {
    res.status(400).json({ error: "Parâmetro 'endpoint' é obrigatório." });
    return;
  }

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    res.status(400).json({ error: `Endpoint '${endpoint}' não permitido.` });
    return;
  }

  const qs = new URLSearchParams(rest).toString();
  const url = `https://${RAPIDAPI_HOST}/v3/${endpoint}${qs ? "?" + qs : ""}`;

  try {
    const apiResp = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": API_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
      },
    });

    const data = await apiResp.json();

    res.status(apiResp.status);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(data);
  } catch (err) {
    res.status(502).json({
      error: "Falha ao consultar a API-Football.",
      details: err.message,
    });
  }
};
