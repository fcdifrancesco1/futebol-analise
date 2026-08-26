# Apuração — Análise de Futebol

Site para analisar times de futebol: classificação por liga, estatísticas individuais (totais e por jogo), comparação direta entre Time A × Time B, e uma estimativa de probabilidade de vitória com justificativa (não é caixa-preta — cada fator usado é mostrado com os números reais).

## Como funciona por baixo dos panos

- **Frontend**: HTML + CSS + JS puro, sem framework, sem build. Um SPA simples com roteamento por hash (`#/liga/71/2026`, `#/compare`).
- **Dados**: API-Football (via RapidAPI). Como a chave da API não pode ficar exposta no navegador, todas as chamadas passam por uma **Serverless Function da Vercel** (`api/football.js`) que funciona como proxy — o navegador nunca vê sua chave. A Vercel detecta automaticamente qualquer arquivo dentro da pasta `api/` e publica como endpoint (`/api/football`), sem precisar de configuração extra.
- **Probabilidade de vitória**: calculada no próprio navegador a partir de 4 fatores (aproveitamento na temporada, saldo de gols por jogo, forma recente, histórico de confronto direto) + bônus de mandante se você marcar quem joga em casa. A fórmula está comentada em `app.js`, função `computeProbability`.

## Passo a passo — publicar na Vercel e configurar a chave da API

Você disse que já tem a chave do API-Football no RapidAPI. Ela **não** vai em nenhum arquivo do projeto — vai como variável de ambiente direto no painel da Vercel.

### 1. Criar conta e instalar a CLI (ou usar o site, sem instalar nada)

Tem dois caminhos. Escolha o que preferir:

**Caminho A — pelo site (mais simples, sem instalar nada):**

1. Acesse **vercel.com** e clique em **Sign Up**. Você pode entrar com conta do GitHub, GitLab, Bitbucket ou email.
2. Como o projeto não está num repositório Git, o jeito mais direto pelo site é subir num repositório do GitHub primeiro (veja o Caminho A.1 abaixo) ou usar o Caminho B (CLI), que aceita pasta local direto.

**Caminho A.1 — subindo pro GitHub primeiro:**

1. Crie um repositório novo em **github.com** (botão **New** na tela inicial), com qualquer nome (ex: `futebol-analise`), pode deixar **Private**.
2. Na sua máquina, dentro da pasta `futebol-analise`, rode:
   ```
   git init
   git add .
   git commit -m "primeiro commit"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/futebol-analise.git
   git push -u origin main
   ```
   (troque `SEU-USUARIO` pelo seu usuário do GitHub)
3. De volta no site da Vercel, clique em **Add New** → **Project**.
4. Clique em **Import** ao lado do repositório `futebol-analise`.
5. Na tela de configuração, deixe tudo no padrão (Framework Preset: **Other**, Build Command e Output Directory em branco) e clique em **Deploy**.

**Caminho B — pela CLI (mais rápido, não precisa de GitHub):**

1. Instale o Node.js caso ainda não tenha (nodejs.org).
2. Abra o terminal dentro da pasta `futebol-analise` e rode:
   ```
   npx vercel
   ```
3. Na primeira vez, ele vai pedir login — escolha uma opção (GitHub, email, etc.) e siga o link que abrir no navegador.
4. Ele vai perguntar algumas coisas — pode aceitar os padrões apertando Enter em tudo:
   - "Set up and deploy?" → **Y**
   - "Which scope?" → sua conta
   - "Link to existing project?" → **N**
   - "What's your project's name?" → pode aceitar o sugerido ou digitar outro
   - "In which directory is your code located?" → **.** (aceitar o padrão)
   - Demais perguntas sobre build/output → aceitar os padrões (Enter)
5. Ao final ele mostra um link de preview. Isso já é um deploy funcionando, só falta a chave da API (próximo passo).

### 2. Configurar a variável de ambiente com sua chave

1. Acesse **vercel.com**, entre no seu projeto (`futebol-analise` ou o nome que você deu).
2. Clique na aba **Settings** (menu superior do projeto).
3. No menu lateral, clique em **Environment Variables**.
4. No campo **Key**, digite exatamente: `FOOTBALL_API_KEY`
5. No campo **Value**, cole a sua chave do RapidAPI (a mesma que você usa pra acessar o API-Football).
6. Em **Environments**, deixe marcado **Production**, **Preview** e **Development** (os três).
7. Clique em **Save**.

### 3. Forçar um novo deploy (pra variável entrar em vigor)

Variáveis de ambiente só valem a partir do próximo deploy — o deploy que você já fez não tem acesso a ela ainda.

**Se você usou o Caminho A (GitHub):**
1. Vá na aba **Deployments** do projeto.
2. Clique nos **três pontinhos** (⋯) do deployment mais recente → **Redeploy**.
3. Confirme clicando em **Redeploy** de novo na janela que abrir.

**Se você usou o Caminho B (CLI):**
1. No terminal, dentro da pasta do projeto, rode:
   ```
   npx vercel --prod
   ```

### 4. Testar

1. Abra o link do site (ex: `https://futebol-analise.vercel.app` ou o link que a Vercel gerou).
2. Clique em qualquer liga (ex: Brasileirão Série A).
3. Se aparecer a tabela de classificação, a chave está funcionando.
4. Se aparecer uma mensagem de erro tipo "FOOTBALL_API_KEY não configurada", volta no passo 2 e confere se o nome da variável está exatamente `FOOTBALL_API_KEY` (maiúsculas, sem espaço) e se você fez o redeploy do passo 3.
5. Se aparecer erro vindo da própria API (tipo limite de requisições ou chave inválida), confere se a chave colada é a certa e se o seu plano no RapidAPI ainda tem cota disponível.

### Atualizando o site depois

- **Caminho A (GitHub)**: só dar `git add . && git commit -m "mudança" && git push` de novo — a Vercel redeploya automaticamente a cada push.
- **Caminho B (CLI)**: rodar `npx vercel --prod` de novo dentro da pasta.

## Como usar o site

- **Ligas**: tela inicial lista as competições disponíveis. Clique numa liga pra ver a classificação da temporada. Dentro da liga tem 3 sub-abas: **Classificação**, **Jogos** (próximos e resultados recentes) e **Artilheiros** (artilheiros, garçons e cartões amarelos da competição).
- **Estatísticas de um time**: clique em qualquer linha da tabela de classificação pra abrir a página do time. Tem 3 sub-abas: **Estatísticas** (totais e médias por jogo), **Elenco** (jogadores por posição, com foto e número) e **Lesões** (desfalques registrados na temporada).
- **Ao Vivo**: aba no topo, mostra os jogos em andamento nas ligas cobertas pelo site, com placar e minutagem em tempo real (precisa atualizar a página pra ver o placar mais novo).
- **Detalhe de um jogo**: clique em qualquer jogo (na lista de "Jogos" da liga, no "Ao Vivo", ou no resultado da comparação) pra ver: previsão oficial da API, odds da casa de apostas, estatísticas do jogo (posse, chutes, escanteios etc.), escalações (titulares, banco, técnico) e linha do tempo de eventos (gols, cartões, substituições).
- **Comparação**: aba **Confronto** no topo. Busque dois times por nome (pode ser de ligas diferentes — o site descobre automaticamente a liga/temporada atual de cada um). Marque quem manda o jogo, se for o caso, e clique em **Comparar**.
  - O resultado mostra: barra de probabilidade (estilo linha de meio-campo) calculada pelo próprio site, lista de justificativas com os números reais, tabela comparativa lado a lado, atalhos pro elenco de cada time, e o histórico de confrontos diretos recentes.
  - Se houver um jogo já marcado entre os dois times, aparece também uma **conferência cruzada**: a previsão oficial do algoritmo da API-Football, lado a lado com o cálculo do site, pra você comparar as duas fontes.

## Sobre cada fonte de dado nova

| Tela | Endpoint da API | Observação |
|---|---|---|
| Jogos da liga | `fixtures` | próximos (`next`) e recentes (`last`) |
| Artilheiros/garçons/cartões | `players/topscorers`, `players/topassists`, `players/topyellowcards` | top 10 de cada, por liga/temporada |
| Elenco | `players/squads` | agrupado por posição |
| Lesões | `injuries` | por time e temporada; cobertura varia por competição |
| Ao vivo | `fixtures?live=all` | filtrado só pras ligas da lista `LEAGUES` |
| Eventos do jogo | `fixtures/events` | gols, cartões, substituições, VAR |
| Escalações | `fixtures/lineups` | só aparece depois que os times confirmam, perto do horário do jogo |
| Estatísticas do jogo | `fixtures/statistics` | posse, chutes, escanteios, faltas etc — só aparece durante/depois do jogo |
| Odds | `odds` | usa o primeiro bookmaker que a API retornar, mercado "Match Winner" |
| Previsão oficial | `predictions` | algoritmo próprio da API-Football, mostrado como conferência cruzada do cálculo do site |

Nem toda competição tem cobertura completa de todas essas informações (algumas ligas menores não têm odds ou estatísticas detalhadas, por exemplo) — quando faltar dado, a seção correspondente simplesmente não aparece na tela, sem quebrar o resto da página.

## Ligas incluídas

Brasileirão Série A, Brasileirão Série B, Copa Libertadores, Copa Sul-Americana, Copa do Brasil, La Liga, Premier League, Ligue 1, Bundesliga, Serie A (Itália), Champions League, Europa League e Conference League.

Uma ressalva sobre o ID da **Copa do Brasil** (73): esse é o ID mais usado pela comunidade de desenvolvedores da API-Football, mas eu não consegui confirmar 100% na documentação oficial (ela não publica uma tabela pública com todos os IDs). Se, ao testar, a Copa do Brasil aparecer sem dados ou com o torneio errado, é só me avisar — dá pra confirmar o ID certo chamando `leagues?search=Copa do Brasil` uma vez e ajustando a constante `LEAGUES` no `app.js`.

Pra adicionar outra liga: abra `app.js`, ache a constante `LEAGUES` no topo do arquivo, e adicione um item novo com o `id` da liga na API-Football (dá pra achar o ID pesquisando o nome da liga na documentação do api-football.com ou usando o endpoint `leagues?search=nome` uma vez).

## Sobre a cota da API

O plano gratuito do API-Football (via RapidAPI) tem limite diário de requisições. Cada tela consome algumas chamadas:
- Classificação: 1 chamada.
- Jogos da liga: 2 chamadas (próximos + recentes).
- Artilheiros/garçons/cartões: 3 chamadas.
- Página de time: 2 chamadas (estatísticas + últimos jogos).
- Elenco: 1 chamada. Lesões: 1 chamada.
- Ao vivo: 1 chamada.
- Detalhe de um jogo: até 5 chamadas (eventos, escalação, estatísticas, odds, previsão — rodam em paralelo e cada uma pode falhar individualmente sem travar a tela).
- Comparação: 3 chamadas (estatísticas dos 2 times + confronto direto), mais 1 chamada extra por time na primeira vez que ele é buscado, mais 2 chamadas se houver conferência cruzada com jogo marcado.

Se o site parar de responder com erro de limite, é a cota diária que acabou — ela reseta em 24h. Se você usar bastante essas telas (principalmente Detalhe do jogo e Ao Vivo), vale considerar um plano pago no RapidAPI.

## Estrutura de arquivos

```
futebol-analise/
├── index.html
├── style.css
├── app.js
└── api/
    └── football.js   (Serverless Function — proxy que esconde a chave da API)
```

Sem `localStorage`, sem Firebase — o site não guarda nada, é só consulta em tempo real à API a cada visita.
