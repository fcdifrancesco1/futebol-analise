# FutStats — acompanhamento de futebol

PWA em HTML, CSS e JavaScript para jogos do dia, partidas ao vivo, ligas, times, jogadores, comparação, escalações e alertas Web Push. Dados esportivos vêm da API-Football por proxies do servidor; cobertura e disponibilidade variam por competição.

## Desenvolvimento

Use Node.js 22 ou 24. Copie `.env.example` para `.env.local` e preencha as variáveis somente no arquivo local.

```sh
npm ci
npm run dev
npm run build
```

Servidor local: `http://127.0.0.1:4173`. Serve `public/` e executa os handlers reais, sem agendar alertas. Consultas exigem banco configurado: sem a chave de serviço ou RPCs, retornam 503 por segurança.

`npm test` executa testes Node e PostgreSQL embarcado (PGlite), sem alterar o banco remoto. `npm run check` verifica sintaxe, compatibilidade dos scripts globais, assets, ícones, dependências e alguns padrões conhecidos de segredos (não substitui um scanner completo). O build executa ambas as verificações e gera somente assets públicos em `dist/`. A CI repete esse build a cada push/PR.

## Arquitetura

| Diretório | Responsabilidade |
|---|---|
| `public/app.js` | Inicialização, rotas e atualização periódica |
| `public/js/` | Cache, modelos, notificações, acessibilidade e telas por domínio |
| `public/css/`, `public/style.css` | Estilos e acessibilidade |
| `public/sw.js` | Cache offline limitado aos assets conhecidos |
| `api/` | Proxies esportivos, imagens, notícias, assinaturas e cron |
| `lib/` | Limites distribuídos, HTTP limitado e serviços de push |
| `supabase/` | Migrações, RLS, reservas de envio e agendador |
| `tests/` | Regressões de frontend/backend e SQL |
| `docs/prototypes/` | Protótipos de referência, fora da publicação |

Scripts do navegador usam `defer` em ordem explícita no HTML; não são módulos ES. Lógica pura também é importável pelos testes. O navegador não acessa tabelas diretamente nem recebe chave de serviço. Não adicione fallback anônimo para erros do servidor.

## Configuração

| Variável do servidor | Uso |
|---|---|
| `FOOTBALL_API_KEY` | Credencial API-Sports/API-Football |
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | RPCs e tabelas protegidas; nunca enviar ao navegador |
| `RATE_LIMIT_SECRET` | Segredo aleatório independente, >=32 caracteres, para HMAC do IP |
| `FOOTBALL_DAILY_BUDGET` | Teto global diário de chamadas pagas; padrão conservador: 100 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Chaves Web Push e contato do operador |
| `CRON_SECRET` | Segredo aleatório >=32 caracteres para autorização do cron |

A chave VAPID pública é entregue por `GET /api/subscribe`. `SUPABASE_ANON_KEY` não é necessária ao aplicativo corrigido. Preserve o par VAPID existente para não invalidar assinaturas.

Teto sugerido nesta instalação: 7.000 chamadas, com reserva frente à cota de 7.500 verificada em 10/09/2026. Ajuste se o plano mudar. O contador usa dias UTC; o ciclo do fornecedor pode ser diferente. Limites por IP e orçamento global são compartilhados entre instâncias por operações atômicas no banco. Falha no controle retorna 503; limite excedido retorna 429.

## Publicação e alertas

Siga [docs/operations.md](docs/operations.md) antes de publicar. A ordem de migração, segredos e agendador importa. `vercel.json` define build, pasta `dist`, duração do cron e cabeçalhos de segurança.

Supabase Cron é o único agendador automático previsto. O workflow GitHub é somente manual e exige o secret `CRON_SECRET`. O header `x-vercel-cron` não autentica chamadas. Alterações de assinaturas exigem suas chaves correspondentes; erros de banco não são sucesso.

Reservas persistentes evitam envios duplicados do mesmo evento ao dispositivo. Entrega com resultado incerto não é repetida automaticamente: evita duplicatas, mas pode perder um alerta. Polling, cotas, cobertura e disponibilidade dos provedores impedem prometer entrega imediata ou exatamente uma vez.

## Interpretação dos dados

Comparações usam uma heurística, não probabilidades calibradas ou previsões garantidas. H2H é considerado quando disponível; o bônus de mando pertence à pontuação interna, não equivale a seis pontos percentuais. Notas estimadas e mapas simulados são estimativas/ilustrações, não medições oficiais. Transmissões sugeridas devem ser confirmadas no canal ou serviço.

O frontend atualiza telas ativas periodicamente e reaproveita consultas em andamento. Jogadores por partida e escalações têm cache curto; dados estáveis podem ter validade maior. Falhas e dados ausentes são apresentados na interface. Cache offline não fornece novos resultados ao vivo.

## Dados locais

Favoritos, preferências, escalações e configurações são persistidos no navegador. Limpar os dados do site remove o estado local. Não há login de usuário. Web Push persiste endpoint, chaves técnicas, favoritos e preferências no Supabase. Desligar alertas utiliza exclusão autenticada da assinatura; apagar só o armazenamento local não garante excluir o registro remoto.

O controle de tráfego armazena identidade HMAC derivada do IP, não IP bruto. Contadores vencidos são limpos incrementalmente; registros de deduplicação são limpos após 30 dias durante seu uso. O operador deve definir política de retenção e tratamento de pedidos dos usuários.

## Backup anterior às correções

`backups/pre-correcoes-20260909-212041.tar.gz` contém o estado completo anterior, incluindo `.git`, dependências e `.env.local`.

SHA256: `B2BC873BF0E1A4FEA3806633C66083B08F1EF629D08C7EAE46146E4B07791342`.

Contém credenciais: mantenha privado, fora do Git e deploy. Para recuperar, extraia em uma pasta separada e compare antes de substituir arquivos. Este backup não contém o banco remoto. Não reative segredos revogados ao restaurar arquivos.
