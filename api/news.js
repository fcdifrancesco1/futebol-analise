// api/news.js
// Agregador Serverless de Manchetes e Notícias Esportivas em Tempo Real
// Consulta o feed RSS do Google Notícias com queries contextuais exclusivas para clubes de futebol,
// eliminando notícias de cidades (ex: São Paulo cidade), palavras comuns (ex: Vitória conquista)
// e termos genéricos (ex: Futebol internacional). Retorna as 6 notícias mais recentes.

const CLUB_QUERY_MAP = {
  "sao paulo": '("São Paulo FC" OR "SPFC" OR "São Paulo Futebol Clube" OR "Tricolor Paulista" OR ("São Paulo" ("Zubeldía" OR "Luciano" OR "Calleri" OR "Lucas Moura" OR "Arboleda" OR "Casares" OR "CT da Barra Funda" OR "elenco tricolor" OR "Copa do Brasil")))',
  "spfc": '("São Paulo FC" OR "SPFC" OR "São Paulo Futebol Clube" OR "Tricolor Paulista")',
  "internacional": '("Sport Club Internacional" OR "SC Internacional" OR "Inter de Porto Alegre" OR ("Internacional" ("Beira-Rio" OR "Gre-Nal" OR "GreNal" OR "Colorado gaúcho" OR "Roger Machado" OR "Borré" OR "Alan Patrick")))',
  "inter de porto alegre": '("Sport Club Internacional" OR "SC Internacional" OR "Inter de Porto Alegre" OR "Colorado")',
  "vitoria": '("Esporte Clube Vitória" OR "EC Vitória" OR "Vitória-BA" OR "Leão da Barra" OR ("Vitória" ("Barradão" OR "Ba-Vi" OR "BaVi" OR "Rubro-Negro baiano" OR "Thiago Carpini" OR "Alerrando" OR "Fábio Mota")))',
  "ec vitoria": '("Esporte Clube Vitória" OR "EC Vitória" OR "Vitória-BA" OR "Leão da Barra")',
  "sport": '("Sport Club do Recife" OR "Sport Recife" OR ("Sport" ("Ilha do Retiro" OR "Leão da Ilha" OR "Pepa" OR "Rubro-Negro pernambucano")))',
  "sport recife": '("Sport Club do Recife" OR "Sport Recife" OR "Leão da Ilha")',
  "santos": '("Santos FC" OR "Santos Futebol Clube" OR ("Santos" ("Vila Belmiro" OR "Alvinegro Praiano" OR "Carille" OR "Guilherme" OR "Otero" OR "Marcelo Teixeira")))',
  "santos fc": '("Santos FC" OR "Santos Futebol Clube" OR "Alvinegro Praiano" OR "Vila Belmiro")',
  "fortaleza": '("Fortaleza EC" OR "Fortaleza Esporte Clube" OR "Leão do Pici" OR ("Fortaleza" ("Castelão" OR "Vojvoda" OR "Tricolor do Pici" OR "Marcelo Paz")))',
  "bahia": '("EC Bahia" OR "Esporte Clube Bahia" OR "Tricolor de Aço" OR ("Bahia" ("Fonte Nova" OR "Rogério Ceni" OR "Grupo City" OR "Everton Ribeiro" OR "Cauly")))',
  "cruzeiro": '("Cruzeiro EC" OR "Cruzeiro Esporte Clube" OR "Raposa" OR ("Cruzeiro" ("Mineirão" OR "Fernando Diniz" OR "Toca da Raposa" OR "Matheus Pereira" OR "Pedrinho BH")))',
  "vasco da gama": '("Vasco da Gama" ("São Januário" OR "Gigante da Colina" OR "Cruzmaltino" OR "Pedrinho" OR "Coutinho" OR "Vegetti" OR "Rafael Paiva" OR "Brasileirão" OR "Copa do Brasil") OR "CR Vasco da Gama")',
  "vasco": '("Vasco da Gama" ("São Januário" OR "Gigante da Colina" OR "Cruzmaltino" OR "Pedrinho" OR "Coutinho" OR "Vegetti" OR "Rafael Paiva" OR "Brasileirão" OR "Copa do Brasil") OR "CR Vasco da Gama")',
  "flamengo": '("Flamengo" ("Maracanã" OR "Mengão" OR "Rubro-Negro carioca" OR "Tite" OR "Arrascaeta" OR "Pedro" OR "Gabigol" OR "Ninho do Urubu" OR "Landim"))',
  "fluminense": '("Fluminense" ("Maracanã" OR "Tricolor das Laranjeiras" OR "Mano Menezes" OR "Thiago Silva" OR "Ganso" OR "Arias" OR "Mário Bittencourt"))',
  "palmeiras": '("Palmeiras" ("Allianz Parque" OR "Verdão" OR "Alviverde" OR "Abel Ferreira" OR "Estêvão" OR "Veiga" OR "Leila Pereira" OR "Academia de Futebol"))',
  "corinthians": '("Corinthians" ("Neo Química Arena" OR "Timão" OR "Alvinegro paulista" OR "Ramón Díaz" OR "Depay" OR "Garro" OR "Yuri Alberto" OR "Augusto Melo"))',
  "gremio": '("Grêmio" ("Arena do Grêmio" OR "Tricolor Gaúcho" OR "Renato Portaluppi" OR "Renato Gaúcho" OR "Braithwaite" OR "Soteldo" OR "Guerra"))',
  "atletico mineiro": '("Atlético-MG" OR "Atlético Mineiro" OR ("Atlético" ("Arena MRV" OR "Galo da Massa" OR "Milito" OR "Hulk" OR "Paulinho" OR "Sérgio Coelho")))',
  "atletico-mg": '("Atlético-MG" OR "Atlético Mineiro" OR ("Atlético" ("Arena MRV" OR "Galo da Massa" OR "Milito" OR "Hulk" OR "Paulinho" OR "Sérgio Coelho")))',
  "athletico": '("Athletico-PR" OR "Athletico Paranaense" OR ("Athletico" ("Ligga Arena" OR "Furacão" OR "Lucho González" OR "Petraglia")))',
  "athletico paranaense": '("Athletico-PR" OR "Athletico Paranaense" OR ("Athletico" ("Ligga Arena" OR "Furacão" OR "Lucho González" OR "Petraglia")))',
  "atletico goianiense": '("Atlético-GO" OR "Atlético Goianiense" OR "Dragão de Campinas")',
  "atletico-go": '("Atlético-GO" OR "Atlético Goianiense" OR "Dragão de Campinas")',
  "america mineiro": '("América-MG" OR "América Mineiro" OR "Coelho")',
  "america-mg": '("América-MG" OR "América Mineiro" OR "Coelho")',
  "botafogo": '("Botafogo" ("Nilton Santos" OR "Engenhão" OR "Glorioso" OR "Fogão" OR "Artur Jorge" OR "John Textor" OR "Luiz Henrique" OR "Igor Jesus" OR "Alvinegro carioca"))',
  "juventude": '("EC Juventude" OR "Juventude" (futebol OR "Alfredo Jaconi" OR "Papo" OR "Jair Ventura"))',
  "cuiaba": '("Cuiabá EC" OR "Cuiabá Esporte Clube" OR "Dourado" (futebol OR "Arena Pantanal"))',
  "ceara": '("Ceará SC" OR "Ceará Sporting Club" OR "Vovô" (futebol OR "Castelão"))',
  "goias": '("Goiás EC" OR "Goiás Esporte Clube" OR "Esmeraldino" (futebol OR "Serrinha"))',
  "coritiba": '("Coritiba FC" OR "Coritiba Foot Ball Club" OR "Coxa" (futebol OR "Couto Pereira"))',
  "avai": '("Avaí FC" OR "Avaí Futebol Clube" OR "Leão da Ilha" (futebol OR "Ressacada"))',
  "chapecoense": '("Chapecoense" OR "Chape" (futebol OR "Arena Condá"))',
  "crb": '("CRB" futebol OR "Clube de Regatas Brasil" OR "Galo de Alagoas")',
  "csa": '("CSA" futebol OR "Centro Sportivo Alagoano" OR "Azulão do Mutange")',
  "ponte preta": '("Ponte Preta" OR "Macaca" (futebol OR "Moisés Lucarelli"))',
  "guarani": '("Guarani FC" OR "Guarani de Campinas" OR "Bugre" (futebol OR "Brinco de Ouro"))',
  "paysandu": '("Paysandu" OR "Papão da Curuzu" (futebol OR "Curuzu"))',
  "remo": '("Clube do Remo" OR "Leão Azul" (futebol OR "Baenão"))',
  "nautico": '("Náutico" (futebol OR "Aflitos" OR "Timbu" OR "Clube Náutico Capibaribe"))',
  "santa cruz": '("Santa Cruz FC" OR "Santa Cruz" (futebol OR "Arruda" OR "Coral"))',
  "operario": '("Operário-PR" OR "Operário Ferroviário" (futebol OR "Germano Krüger"))',
  "novorizontino": '("Novorizontino" OR "Grêmio Novorizontino" (futebol OR "Jorjão"))',
  "mirassol": '("Mirassol FC" OR "Mirassol Futebol Clube" (futebol OR "Maião"))',
  "brusque": '("Brusque FC" OR "Brusque Futebol Clube" (futebol OR "Augusto Bauer"))',
  "amazonas": '("Amazonas FC" OR "Onça-Pintada" (futebol OR "Carlos Zamith"))',
  "ituano": '("Ituano FC" OR "Galo de Itu" (futebol OR "Novelli Júnior"))',
  "londrina": '("Londrina EC" OR "Tubarão" (futebol OR "Estádio do Café"))',
  "figueirense": '("Figueirense FC" OR "Figueira" (futebol OR "Orlando Scarpelli"))',
  "parana": '("Paraná Clube" OR "Tricolor da Vila" (futebol OR "Vila Capanema"))',
  "portuguesa": '("Portuguesa de Desportos" OR "Lusa" (futebol OR "Canindé"))',
  "real madrid": '("Real Madrid" (futebol OR "Bernabéu" OR "Ancelotti" OR "Vini Jr" OR "Mbappé"))',
  "barcelona": '("FC Barcelona" OR "Barcelona" (futebol OR "La Liga" OR "Camp Nou" OR "Flick" OR "Lamine Yamal"))',
  "manchester city": '("Manchester City" OR "Man City" (futebol OR "Guardiola" OR "Haaland"))',
  "manchester united": '("Manchester United" OR "Man United" (futebol OR "Old Trafford" OR "Amorim"))',
  "liverpool": '("Liverpool FC" OR "Liverpool" (futebol OR "Premier League" OR "Anfield" OR "Salah"))',
  "chelsea": '("Chelsea FC" OR "Chelsea" (futebol OR "Premier League" OR "Stamford Bridge"))',
  "arsenal": '("Arsenal FC" OR "Arsenal" (futebol OR "Premier League" OR "Arteta" OR "Emirates"))',
  "bayern munich": '("Bayern de Munique" OR "Bayern München" OR "Bayern Munich")',
  "bayern munchen": '("Bayern de Munique" OR "Bayern München" OR "Bayern Munich")',
  "borussia dortmund": '("Borussia Dortmund" OR "BVB")',
  "paris saint germain": '("Paris Saint-Germain" OR "PSG" (futebol OR "Parc des Princes"))',
  "psg": '("Paris Saint-Germain" OR "PSG" futebol)',
  "juventus": '("Juventus" (futebol OR "Serie A" OR "Juve" OR "Turim"))',
  "milan": '("AC Milan" OR "Milan" (futebol OR "Serie A" OR "San Siro" OR "Rossonero"))',
  "inter": '("Inter de Milão" OR "Internazionale" OR "Inter Milan")',
  "internazionale": '("Inter de Milão" OR "Internazionale" OR "Inter Milan")',
  "benfica": '("SL Benfica" OR "Benfica" (futebol OR "Encarnados" OR "Estádio da Luz"))',
  "sporting": '("Sporting CP" OR "Sporting de Portugal" (futebol OR "Alvalade"))',
  "porto": '("FC Porto" OR "Porto" (futebol OR "Dragão"))',
  "boca juniors": '("Boca Juniors" (futebol OR "Bombonera" OR "Xeneize"))',
  "river plate": '("River Plate" (futebol OR "Monumental" OR "Gallardo"))'
};

const EXCLUSIONS = {
  "sao paulo": [
    "prefeitura", "governador", "tarcísio", "metrô", "trânsito", "rodovia",
    "acidente", "zona leste", "zona sul", "zona norte", "polícia civil",
    "polícia militar", "av. paulista", "chuva em sp", "tempo em sp", "hilton", "hotel", "hotéis", "revista hotéis"
  ],
  "internacional": [
    "epia", "aeroporto", "comércio internacional", "mercado financeiro", "tribunal",
    "tráfico", "internacional de cinema", "fundo monetário", "comunidade internacional",
    "relações internacionais", "política internacional"
  ],
  "vitoria": [
    "vitória de ", "conquista vitória", "garante vitória", "vitória por ", "cidade de vitória",
    "prefeitura de vitória", "capital capixaba", "espírito santo", "polícia de vitória",
    "vitória do flamengo", "vitória do palmeiras", "vitória do corinthians", "vitória do são paulo",
    "vitória do grêmio", "vitória do cruzeiro", "vitória do vasco", "vitória do botafogo",
    "vitória do santos", "vitória do fluminense", "vitória do galo"
  ],
  "santos": [
    "prefeitura de santos", "porto de santos", "praia de santos", "intoxicação por peixe",
    "pesca de peixe", "hospital de santos", "polícia de santos"
  ],
  "sport": [
    "futsal experience", "diadema", "prefeitura de", "secretaria de esporte"
  ],
  "vasco": [
    "bairro vasco da gama", "encostas protegidas", "prefeitura do recife",
    "incêndio em prédio", "vasco-pi", "vasco-ac", "vasco-se", "piauiense"
  ],
  "botafogo": [
    "botafogo-sp", "botafogo-pb", "botafogo-ba", "botafogo da paraíba",
    "botafogo de ribeirão", "paraibano", "paulistão a2"
  ],
  "flamengo": [
    "flamengo-pi", "flamengo-sp", "flamengo-se", "flamengo-ba", "flamengo de guarulhos"
  ],
  "fluminense": [
    "fluminense de feira", "flu de feira", "fluminense-pi", "fluminense-ba"
  ]
};

function normalizeName(str) {
  return str.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
}

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

  const normalized = normalizeName(cleanTeam);
  let queryStr = CLUB_QUERY_MAP[normalized];

  if (!queryStr) {
    // Tenta encontrar por substring
    const matchedKey = Object.keys(CLUB_QUERY_MAP).find(k => normalized.includes(k) || k.includes(normalized));
    if (matchedKey) {
      queryStr = CLUB_QUERY_MAP[matchedKey];
    } else {
      queryStr = cleanTeam.includes(" ") 
        ? `"${cleanTeam}" futebol` 
        : `"${cleanTeam}" (futebol OR "clube" OR "elenco" OR "jogo" OR "partida")`;
    }
  }

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

    const matchedExclKey = Object.keys(EXCLUSIONS).find(k => normalized.includes(k) || k.includes(normalized));
    const negativeList = matchedExclKey ? EXCLUSIONS[matchedExclKey] : [];

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

      // Decodificar entidades HTML com segurança no título
      rawTitle = rawTitle
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");

      const lowerTitle = rawTitle.toLowerCase();

      // Filtro de exclusão de homônimos / notícias de cidades / não relacionadas ao clube
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
