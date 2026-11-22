---
name: FutStats
description: Futebol do dia, ao vivo e em tabela, pintado nas cores de cada clube.
colors:
  night-stand: "#070b14"
  card-navy: "#101828"
  card-navy-deep: "#0b1120"
  card-raised: "#162036"
  line-navy: "#1a2540"
  line-strong: "#233150"
  chalk: "#eef2fa"
  chalk-dim: "#8d9abb"
  chalk-muted: "#5e6b8a"
  trophy-gold: "#f5b301"
  pitch-green: "#0f7a45"
  pitch-green-bright: "#19b36b"
  flare-red: "#ff3b4e"
  highlights-red: "#dc2626"
  silver-light: "#f1f4f6"
  silver-mid: "#b3bcc2"
  silver-ink: "#13222a"
  silver-ink-dim: "#3c4b53"
  live-win: "#4ade80"
  live-draw: "#fde047"
  live-lose: "#fca5a5"
  club-fallback: "#1d2a45"
typography:
  display:
    fontFamily: "Oswald, Arial Narrow, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "0.03em"
  score:
    fontFamily: "Oswald, Arial Narrow, sans-serif"
    fontSize: "56px"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "Oswald, Arial Narrow, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "0.05em"
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  team-label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 800
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    letterSpacing: "0.08em"
  brand:
    fontFamily: "Barlow Condensed, Impact, sans-serif"
    fontWeight: 700
rounded:
  bar: "6px"
  row: "9px"
  card: "14px"
  hero: "18px"
  pill: "999px"
spacing:
  row-gap: "4px"
  row-pad: "8px 12px"
  card-pad: "16px 18px"
  page-gutter-mobile: "12px"
  page-gutter: "28px"
components:
  tab-pill:
    textColor: "{colors.chalk-dim}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  tab-pill-active:
    backgroundColor: "{colors.pitch-green}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.pill}"
  filter-pill-active:
    backgroundColor: "{colors.trophy-gold}"
    textColor: "{colors.night-stand}"
    rounded: "{rounded.pill}"
  card:
    backgroundColor: "{colors.card-navy}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  match-row:
    textColor: "{colors.chalk}"
    typography: "{typography.team-label}"
    rounded: "{rounded.row}"
    padding: "{spacing.row-pad}"
  club-bar:
    textColor: "{colors.chalk}"
    rounded: "{rounded.bar}"
  league-header:
    backgroundColor: "{colors.silver-mid}"
    textColor: "{colors.silver-ink}"
    typography: "{typography.title}"
  highlights-button:
    backgroundColor: "{colors.highlights-red}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.pill}"
---

# Design System: FutStats

## Overview

**Creative North Star: "A Arquibancada em Cores"**

FutStats é o palco das torcidas. A estrutura é uma noite de estádio, em azul-marinho quase preto. Quem acende a tela são os clubes: cada linha de partida, barra de classificação, cartão de jogador e cabeçalho de jogo veste as cores do time a que pertence. O sistema é encorpado e vibrante, com faixas de cor cheias, números grandes em Oswald, sombras profundas e contraste alto. Ainda assim, a base fica sóbria, para que a cor dos clubes seja sempre a protagonista.

A leitura é de arquibancada: de relance, de longe, com uma mão. Placares e pontos ganham fonte de display. Nomes de times vão em caixa alta e peso 800, sempre em branco com sombra, para ficarem legíveis sobre qualquer cor de clube. As duas metades de um confronto se encontram exatamente no centro, onde fica o placar.

O sistema rejeita a cara de site de apostas (neon, verde-dinheiro, chamadas agressivas) e o visual genérico de template (gradientes roxos, glassmorphism, ícones emoji como enfeite).

**Key Characteristics:**
- Fundo noturno azul-marinho; a cor vem dos clubes, não da interface.
- Faixas cheias nas cores dos times, com véu escuro por cima para o texto branco.
- Confronto dividido meio a meio, com corte seco no centro do placar.
- Oswald em caixa alta para títulos, placares e pontos; Inter para todo o resto.
- Cápsulas (999px) para abas e filtros; cantos de 9 a 18px para linhas e cartões.

## Colors

A paleta é noturna e contida. A cor de verdade entra pelos clubes, por variáveis CSS geradas em tempo de execução.

### Primary
- **Cor do clube** (variável por time): definida em `public/js/team-colors.js`. Há uma tabela à mão para 136 clubes e 430 seleções; para os demais, a cor é tirada do escudo. Cada time tem uma cor principal e uma secundária. A principal pinta a metade do confronto e o começo da barra; a secundária pinta a borda externa e o fim da barra. Quando a cor ainda não está pronta, entra o **Azul de Espera** (club-fallback).
- **Verde Gramado** (pitch-green, com pitch-green-bright): aba ativa da navegação, em degradê de 135°, e barra de progresso dos perfis.

### Secondary
- **Ouro de Taça** (trophy-gold): títulos de seção da página, filtro ativo, destaque de gols do jogador e item ativo da navegação inferior. O texto sobre o ouro é quase preto.

### Tertiary
- **Vermelho Sinalizador** (flare-red): estados ao vivo e alertas.
- **Vermelho Melhores Momentos** (highlights-red): botão sólido de vídeo.

### Neutral
- **Noite de Estádio** (night-stand): fundo do app.
- **Marinho de Cartão** (card-navy → card-navy-deep): cartões, em degradê vertical.
- **Marinho Elevado** (card-raised): superfícies internas e cabeçalhos de cartão de jogo.
- **Linha Marinho** (line-navy) e **Linha Forte** (line-strong): bordas e divisórias.
- **Giz** (chalk), **Giz Apagado** (chalk-dim) e **Giz Mudo** (chalk-muted): texto principal, secundário e rótulos de coluna.
- **Prata Metálica** (silver-light → silver-mid, com tinta silver-ink): cabeçalho de competição. É escolhida para que escudos escuros, como o da Premier League, apareçam.

### Named Rules
**The Club Owns the Color Rule.** A interface não introduz cores de destaque novas. Se algo precisa de cor, que seja a do clube a que pertence. Ouro e verde marcam só estado e navegação.

**The Veil Rule.** Toda faixa em cor de clube leva um véu escuro: `rgba(0,0,0,.2–.55)` por cima, mais escuro no centro, e texto branco com `text-shadow: 0 1px 3px rgba(0,0,0,.7)`. Nunca escreva texto escuro sobre cor de clube.

**The Live Seal Rule.** O resultado ao vivo (vence, empata ou perde) aparece num selo escuro `rgba(0,0,0,.55)`, em live-win, live-draw ou live-lose. Assim ele aparece sobre qualquer cor de clube.

## Typography

**Display Font:** Oswald (com Arial Narrow)
**Body Font:** Inter (com system-ui, -apple-system, Segoe UI)
**Brand Font:** Barlow Condensed (com Impact), só no nome "FutStats"

**Character:** Oswald é a letra do placar, condensada e vertical, gritando números. Inter é a voz do comentarista, neutra e legível em tamanhos pequenos.

### Hierarchy
- **Score** (700, 56px no cabeçalho da partida, 40px no celular): placares do destaque e da página de jogo.
- **Display** (700, 22px, caixa alta, 0.03em): títulos de seção, com barra vertical de 4×20px em degradê ouro→verde à esquerda.
- **Title** (600, 15px, caixa alta, 0.05em): nome da competição no cabeçalho prateado.
- **Team label** (Inter 800, 12.5px, caixa alta): nomes de times nas linhas de partida e na classificação. No celular, passa a sigla de 3 letras (13px) ao lado do escudo.
- **Body** (Inter 400, 14px): textos e metadados.
- **Label** (Inter 700, 10.5px, caixa alta, 0.08em): cabeçalhos de coluna das tabelas.

### Named Rules
**The Numbers Shout Rule.** Placar, pontos e números-chave de estatística usam Oswald. Rótulos e texto corrido nunca usam.

**The Three Letters Rule.** Em telas de até 760px, o nome do time vira a sigla de 3 letras ao lado do escudo, sem quebrar no meio da palavra.

## Layout

- **Largura:** todas as telas usam a largura total da página, sem container máximo. O respiro lateral é de 28px no computador e 12px no celular (até 760px).
- **Página de jogos do dia:** a classificação fica numa coluna fixa (`sticky`, top 92px) ao lado das partidas. Ela troca de campeonato a cada 15s e ajusta a altura das linhas (22–35px) para caber sem rolagem.
- **Linhas de partida:** grade de três colunas (`1fr auto 1fr`), com o placar no centro exato. O horário fica sobreposto à esquerda.
- **Celular (até 760px):** o horário sobe para uma faixa própria acima da linha.
- **Classificação:** linhas separadas por 4px (`border-spacing: 0 4px`).
- **Elenco:** cartões em grade `auto-fill` com mínimo de 210px; no celular, 2 colunas.
- **Página do jogador:** duas colunas, que viram uma a partir de 1100px.
- **Pontos de quebra:** 1100px, 760px, 700px e 640px.

**The Nothing Leaks Rule.** Nenhum conteúdo passa da borda direita em 375px. Use `minmax(0, 1fr)` e `min-width: 0` em filhos de grade e flex. Selects e tabelas largas ficam dentro do cartão.

## Elevation & Depth

A profundidade é em camadas e sombreada: cartões escuros sobre o fundo noturno, com uma sombra ambiente grande e suave. As faixas de clube ganham relevo por `drop-shadow` nos escudos e sombra no texto, não por elevação. No hover, as faixas sobem 1px e clareiam (`brightness(1.15)`).

### Shadow Vocabulary
- **Sombra de Cartão** (`box-shadow: 0 10px 30px -12px rgba(0,0,0,.6)`): todos os cartões e painéis.
- **Brilho da Aba** (`box-shadow: 0 4px 14px -4px rgba(25,179,107,.7)`): só na aba ativa da navegação.
- **Relevo do Escudo** (`filter: drop-shadow(0 2px 4px rgba(0,0,0,.5))`): escudos sobre faixas coloridas.

## Shapes

A forma é arredondada sem ser mole:
- **Cápsulas totais (999px):** abas, filtros, botões e selos.
- **Cantos médios:**
  - linhas de partida: 9px;
  - cartões: 14px;
  - cabeçalhos de jogo e do time: 18px.
- **Barras de classificação:** cantos de 6px só nas pontas da linha.
- **Fotos de jogador:** sempre redondas, com aro branco translúcido de 3px.
- **Bordas:** 1px `rgba(255,255,255,.18)` sobre faixas de clube e Linha Marinho sobre cartões.

## Components

### Navegação
- **Topo:** fundo `rgba(7,11,20,.92)`, sem `backdrop-filter`. Uma faixa tricolor de 2px fica na base: verde, branco, ouro, branco e azul.
- **Abas:** cápsulas dentro de um trilho escuro. A aba ativa usa o degradê Verde Gramado e o Brilho da Aba.
- **Celular:** navegação inferior com o item ativo em Ouro de Taça.

### Filtros / Chips
- **Estilo:** cápsula. No estado ativo, fundo em Ouro de Taça com texto quase preto.

### Cartões
- **Cantos:** 14px.
- **Fundo:** degradê vertical de Marinho de Cartão para Marinho de Cartão Profundo.
- **Borda:** 1px de Linha Marinho, com a Sombra de Cartão.

### Linha de Partida (assinatura)
- **Divisão:** o confronto é dividido meio a meio. Cada metade vai da cor secundária do time, na borda externa, para a principal, no centro, com corte seco em 50%.
- **Véu:** escuro por cima, mais forte no centro.
- **Placar:** num selo `rgba(0,0,0,.45)` em Oswald.
- **Hover:** clareia e sobe 1px.

A mesma pintura vale para o destaque do dia, o cabeçalho da partida e os cartões de jogo da página do time. Nos cartões, o cabeçalho com competição e data fica sólido, em Marinho Elevado.

### Barra de Classificação (assinatura)
- **Linha:** cada time numa faixa, da cor principal (até 45%) para a secundária, com véu.
- **Setas e zona:** setas de variação em selos escuros. A posição de zona é marcada por uma borda colorida à esquerda.
- **Ao vivo:** segue a regra do selo ao vivo.

### Cabeçalho de Competição
- **Fundo:** Prata Metálica em degradê vertical com brilho no meio.
- **Texto:** em silver-ink e Oswald 600, caixa alta. No hover, o texto fica verde-escuro (#0b5f55).

### Cartão de Elenco
- **Topo:** foto redonda sobre as cores do clube, com o número da camisa grande e translúcido no canto.
- **Nome:** numa faixa colorida.
- **Base:** três números da temporada num bloco Marinho Elevado. Os rótulos vão abreviados quando necessário (ex.: "Sofr.", "Def.").

### Botão Melhores Momentos
- **Estilo:** sólido em highlights-red, cápsula, texto branco, sem transparência.

## Do's and Don'ts

### Do:
- **Do** pintar tudo o que pertence a um time com `teamColorVars` / `matchColorVars` (`public/js/team-colors.js`), nunca com cor fixa.
- **Do** manter o véu escuro e o texto branco com sombra sobre qualquer cor de clube.
- **Do** usar Oswald para placares, pontos e títulos, e Inter para o resto.
- **Do** usar a sigla de 3 letras com o escudo no celular quando o nome não couber.
- **Do** conferir cada tela a 375px e no computador: celular e computador têm o mesmo peso.
- **Do** manter relógios que dependem de animação funcionando com "reduzir movimento" ligado.

### Don't:
- **Don't** dar cara de site de apostas: nada de neon, verde-dinheiro ou chamadas agressivas.
- **Don't** usar visual genérico de template: gradientes roxos, glassmorphism, `backdrop-filter` e emoji como enfeite.
- **Don't** criar cores de destaque novas para a interface; a cor é dos clubes.
- **Don't** escrever texto escuro sobre cor de clube nem deixar a metade de um time invadir a do outro além do centro.
- **Don't** trocar o logo oficial nem a imagem de fundo do app.
