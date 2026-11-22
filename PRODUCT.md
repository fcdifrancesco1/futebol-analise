# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O público torcedor em geral, com o app aberto a qualquer pessoa (há um guia de publicação na Play Store em `GUIA-PUBLICACAO-PLAYSTORE.pdf`). O torcedor usa o app para:
- ver os jogos do dia;
- acompanhar partidas ao vivo;
- consultar a classificação e os números de times e jogadores;
- receber alertas do time favorito.

O uso acontece tanto no celular quanto no computador, com o mesmo peso. Em telas largas, a classificação fica fixa ao lado dos jogos.

## Product Purpose

FutStats é um PWA de acompanhamento de futebol, em português do Brasil. Reúne jogos do dia, ao vivo, ligas e copas, páginas de time, jogador e partida, seleções e alertas Web Push de gols e escalações. O sucesso é o torcedor entender a rodada de relance: quem joga, o placar, como a tabela muda e como estão os jogadores.

## Positioning

- **Visual por clube:** linhas de partida, classificação, elenco e páginas pintadas com as cores de cada time. As cores dos clubes conhecidos ficam numa tabela à mão, e as dos demais são tiradas do escudo. A classificação se atualiza ao vivo com o placar.
- **Leve e sem anúncios:** PWA instalável, rápido, sem propaganda.

Os apps grandes (Sofascore, FlashScore, ge) são a referência de completude, não de visual.

## Operating Context

- **Uso:**
  - consulta rápida durante o dia;
  - acompanhamento ao vivo durante as rodadas, muitas vezes no celular com uma mão;
  - telas largas com a classificação do dia girando entre campeonatos.
- **Fuso e formato:** horário local; datas e números no formato brasileiro.
- **Instalação:** o app pode ser instalado como PWA.

## Capabilities and Constraints

- **Dados:** vêm da API-Football por proxies no servidor (Vercel). A cobertura varia por competição, e há um teto diário de chamadas pagas: novas telas não podem multiplicar requisições.
- **Front-end:** HTML, CSS e JavaScript sem framework. Os scripts são globais com `defer`, não módulos ES. O service worker faz cache dos assets conhecidos, versionados por `?v=`.
- **Alertas:** Web Push com agendador no Supabase. Não há promessa de entrega imediata nem exatamente uma vez.
- **Desativados por enquanto:** Bolão e Escalações (rotas redirecionam para o início).
- **Termos usados no produto:** Jogos do Dia, Ao Vivo, Ligas & Copas, Classificação, Elenco, Melhores Momentos, Rodada.

## Brand Commitments

- **Nome e marca:** FutStats, com o logo oficial e a imagem de fundo do projeto (mantidos no redesign "Courtside").
- **Idioma:** português do Brasil.
- **Cores dos clubes:** são parte da identidade e devem ser preservadas.

## Evidence on Hand

- **O que existe:** dados reais da API-Football (jogos, tabelas, jogadores, troféus) e escudos e fotos da API-Sports. Os protótipos de referência ficam em `docs/prototypes/`.
- **O que não existe:** depoimentos, números de usuários, avaliações ou parcerias. Nada disso deve ser inventado.

## Product Principles

1. A rodada se entende de relance: placar, situação e tabela antes de qualquer detalhe.
2. Cada clube é reconhecível pela cor e pelo escudo, em qualquer tela.
3. Celular e computador são cidadãos de primeira classe: nada vaza ou corta em nenhum dos dois.
4. Leveza acima de volume: nada de anúncios, e nenhuma tela que gaste a cota da API sem necessidade.
5. Dados honestos: quando a cobertura falha, o app diz isso em vez de inventar.

## Accessibility & Inclusion

- Respeitar "reduzir movimento" (`public/css/accessibility.css`). Relógios que dependem de animação precisam continuar funcionando com essa opção ligada.
- Garantir texto legível sobre as cores dos clubes, pelo contraste do texto branco nas faixas coloridas.
