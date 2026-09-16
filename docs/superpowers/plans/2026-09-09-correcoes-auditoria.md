# Correções da auditoria — plano de implementação

**Objetivo:** corrigir os problemas identificados na análise após preservar o projeto completo.
**Arquitetura:** manter a PWA vanilla e Vercel, separar lógica de domínio/infraestrutura em módulos testáveis e usar transações Postgres para operações concorrentes. Supabase Cron será o único agendador automático; GitHub permitirá disparo manual autenticado.
**Escopo:** as doze recomendações da análise aprovada pelo usuário, incluindo configuração remota quando o acesso permitir.
**Restrições:** preservar funcionalidades e dados de usuários; não expor segredos; não inventar calibração estatística; validar antes de publicar.

## Backup

- [x] Arquivo completo: `backups/pre-correcoes-20260909-212041.tar.gz`.
- [x] SHA256: `B2BC873BF0E1A4FEA3806633C66083B08F1EF629D08C7EAE46146E4B07791342`.
- [x] Leitura do arquivo e presença de `.env.local`, `.git/HEAD`, frontend, backend e lockfile confirmadas.
- O backup contém credenciais e não deve ser enviado ao Git ou à hospedagem.

## Entregas independentes

- [x] Alertas: testes reproduzindo falhas; backend fail-closed; validação de assinaturas; operações atômicas; deduplicação persistente; cron autenticado; SQL reexecutável e RLS; eliminar função abandonada.
- [x] APIs: rate limiting distribuído por IP e teto global da API paga; validação de método/parâmetros; cache por endpoint; timeouts e limites de respostas; notícias com identificadores estáveis.
- [x] Frontend: módulos separados de domínio, cache, preferências, notificações e telas; falhas de cadastro visíveis; rota sem respostas antigas; H2H e mando documentados corretamente; canais prováveis; acessibilidade e SW limitado.
- [x] Infraestrutura: excluir backups e demos do deploy, imagens otimizadas, ícones com dimensões reais, build e CI com verificações reais, dependências fixadas, README e runbook atuais.
- [x] Integração local: executar testes Node e build; validar SQL no PGlite, conferir navegador e revisar diff. Banco e entrega real em produção continuam pendentes abaixo.
- [x] Configuração externa: CRON_SECRET rotacionado, SQL/cron aplicados, Vault configurado pelo usuário, deployment promovido e workflow antigo desativado. Registro de pendências de validação de dispositivo em docs/operations.md.

## Contratos de integração

- `lib/request-security.js`: `enforceRateLimit(req, res, { scope, limit, windowSeconds })` assíncrono retorna booleano; false significa resposta já enviada. Limites distribuídos usam RPC com `SUPABASE_SERVICE_ROLE_KEY`.
- `api/subscribe.js`: GET público retorna apenas estado e chave VAPID pública; POST/DELETE validam e persistem ou retornam erro HTTP; `preferences.sent_events` pertence ao servidor e não é sobrescrito por clientes.
- Scripts de frontend carregados em ordem explícita no HTML; módulos puros exportáveis para Node.
- Testes via `node --test`; ferramentas de build nunca imprimem valores de configuração.

## Verificação

Reproduzir primeiro os bugs relevantes com testes comportamentais. Depois executar a suíte completa, parser JS, checagens de assets/HTML/configuração e inspeção de navegador. Reportar separadamente resultados locais e mudanças efetivamente aplicadas na infraestrutura remota.

## Retomada e pendências externas — 10/09/2026

Atualização posterior: migrações Supabase aplicadas e verificadas, backup privado de 12 assinaturas criado, variáveis Vercel atualizadas com autorização e deployment `dpl_B9DLiZjgXL3MqmRFCZ8X1GT2XsKS` promovido. 63 testes passaram também no build remoto. Segredo antigo rejeitado (401). Vault/agendador configurados, cron retornou HTTP 200 e workflow antigo do GitHub foi desativado. Registros antigos falharam na validação; entrega em dispositivo requer nova assinatura válida. Código ainda não enviado ao GitHub. Detalhes atuais em `docs/operations.md`; itens abaixo são o histórico da etapa local anterior à publicação.

- Verificação final local: `npm run build` terminou com código 0; 63 testes passaram, nenhum falhou ou foi ignorado. `git diff --check` passou e `dist/` contém somente a PWA, sem backups, demos ou segredos.
- Backup conferido novamente por SHA256, sem alteração; cópias antigas preservadas no disco e retiradas somente do índice Git (49 arquivos).
- Branch local: `codex/correcoes-auditoria`; alterações ainda não commitadas/publicadas. Nenhum deploy ou SQL remoto aplicado.
- Revisão independente identificou e levou à correção de estado após falha de DELETE, payload de favoritos excessivo e leitura incorreta de booleanos. Testes adicionais cobrem transporte base64url e falha de limpeza local da assinatura.
- Navegador: inicialização, ligas, acordeões, escalação, modal de notificações, Escape com retorno do foco, layout móvel sem overflow horizontal; nenhum erro de console nos fluxos inspecionados. Isso não cobre todos os fluxos com dados reais.
- HTTP local: página 200 com CSP, cron sem autenticação 401, configuração pública Push 200 apenas com `vapidPublicKey`; consulta esportiva 503 sem chave de serviço/banco configurado, como previsto.
- SQL foi executado em PostgreSQL embarcado, incluindo reexecução/migração de dados legados e permissões. Não equivale a teste de concorrência entre sessões reais nem valida a infraestrutura hospedada.
- Novos segredos configurados somente em `.env.local`. O segredo antigo em produção ainda precisa de rotação coordenada. A Vercel tinha sessão autenticada; o Supabase redireciona ao login. Não trocar/publicar partes isoladas antes das migrações.
- Próximo passo: usuário autenticar no Supabase, preservar snapshot do banco e seguir `docs/operations.md` para migrações, variáveis, deploy, Vault/agendador único e verificação real.
