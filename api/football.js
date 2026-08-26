// Proxy seguro para a API-Football (api-sports.io direto).
// A chave nunca fica exposta no frontend — fica só na variável de ambiente do projeto na Vercel.

const API_HOST = "v3.football.api-sports.io";

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
  const url = `https://${API_HOST}/${endpoint}${qs ? "?" + qs : ""}`;

  try {
    const apiResp = await fetch(url, {
      headers: {
        "x-apisports-key": API_KEY,
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
