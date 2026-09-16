# Operação das correções de setembro de 2026

## Estado remoto

Atualização da execução: acesso ao Supabase confirmado. Criado o schema privado `audit_backup_20260910`, com cópia das 12 assinaturas em `push_subscriptions` e metadados de colunas, políticas e grants em `schema_metadata`; conferência retornou 12 originais e 12 cópias. Acesso revogado de PUBLIC, anon, authenticated e service_role no backup. Essa cópia no mesmo banco não substitui backup externo contra perda do projeto.

Após confirmação explícita do usuário, as migrações de segurança de push e de limites foram aplicadas e verificadas. Permanecem 12 assinaturas. anon não pode inserir/atualizar assinaturas nem executar a RPC de gravação; authenticated não pode ler a tabela diretamente. A RPC de limites é executável por service_role, não por anon. Teste transacional com service_role comprovou gravação, bloqueio de troca de proprietário e teto de chamadas; ROLLBACK eliminou os dados de teste e a contagem permaneceu 12.

Após autorização explícita adicional, CRON_SECRET foi atualizado na Vercel e RATE_LIMIT_SECRET/FOOTBALL_DAILY_BUDGET foram adicionados (teto 7000). Deployment `dpl_B9DLiZjgXL3MqmRFCZ8X1GT2XsKS` foi promovido ao domínio público `https://futebol-analise.vercel.app`. O build remoto passou com 63 testes. Consulta real retornou 173 partidas em 10/09/2026; página pública retornou 200 com frontend modular/CSP. O segredo antigo combinado ao header x-vercel-cron retornou 401 no domínio público, confirmando sua revogação na versão ativa.

Uma primeira tentativa de build falhou porque testes de requisições locais herdavam VERCEL=1. Corrigido somente o isolamento desse ambiente em tests/push-security.test.js; testes específicos de identidade Vercel permanecem ativos. Build local reproduzindo VERCEL=1 e build remoto subsequente passaram.

Usuário salvou `futstats_cron_secret` no Vault. Instalados pg_cron/pg_net e job `futstats-live-alerts` (jobid 1), ativo a cada minuto. A primeira resposta HTTP registrada foi 200, sem timeout, `success:true`, `completed:true`. Workflow antigo `FutStats Live Match Monitor` foi desativado manualmente no GitHub, preservando seu histórico; o painel confirmou a desativação.

A execução retornou `invalidSubscriptions:12`, `subscribersProcessed:0`, `notificationsSent:0`. Diagnóstico somente de metadados encontrou domínios de teste e chaves de tamanho incorreto; nenhum valor de chave foi exposto, nenhum registro foi excluído ou liberado por exceção. Os 12 registros continuam preservados, mas nenhum passou pela validação atual. É necessário cadastrar uma assinatura válida no navegador/dispositivo pelo site corrigido e testar o recebimento. HTTP 200 confirma agendamento/autenticação/execução, não entrega ao celular.

Correção posterior ao relato do celular: a classificação acima não prova que todas as assinaturas eram inválidas. O domínio `jmt17.google.com` aparece no código oficial do Chromium como endpoint legado de staging, mas faltava na allowlist; havia uma assinatura desse domínio com comprimentos canônicos de chave. Adicionado somente esse host com caminho `/fcm/send/<token>`, sem liberar outros hosts Google, portas, credenciais, fragmentos ou consultas. Tokens não são reescritos para outro provedor. Dois testes reproduziram a rejeição antes da correção e passaram depois. Build local com VERCEL=1 e build remoto passaram com 65 testes. Deployment `dpl_6JPiVGjV55pLr3jdJy7yRrPS5vHC` promovido ao domínio público. Verificação HTTP em produção com chave propositalmente inválida confirmou que o endpoint Google passa à validação de chave, enquanto host desconhecido continua rejeitado; nenhuma assinatura foi gravada nem push enviado por essa verificação. Recebimento real no celular ainda depende do teste do usuário.

As mudanças de código continuam no checkout local e foram publicadas diretamente pela CLI Vercel; ainda não foram commitadas/enviadas ao GitHub. Antes de novos deployments acionados pelo repositório, sincronize a versão corrigida para não reintroduzir o código antigo. Só reabilite o workflow quando sua versão manual-only e seu secret estiverem atualizados; o Supabase deve permanecer como único agendador automático.

Alterações locais não aplicam automaticamente SQL, variáveis, workflows ou deploys. O estado acima registra o que efetivamente foi publicado; o roteiro abaixo também serve para futuras implantações. Não reative o token antigo.

## Ordem de implantação

1. Faça snapshot/backup do banco Supabase e registre contagens de assinaturas. O backup local do projeto não contém o banco. Inspecione tipos e políticas atuais; o SQL interrompe tipos legados incompatíveis, sem conversão destrutiva automática.
2. Pause agendadores existentes para coordenar a troca. Confira Supabase Cron e o workflow periódico antigo do GitHub. Editar o arquivo local não desativa o agendador remoto.
3. Execute `supabase/schema_rls.sql` e `supabase/rate_limit.sql` no SQL Editor autenticado. São transacionais e reexecutáveis; mantêm assinaturas e migram marcas legadas de eventos. Não execute os testes SQL em produção.
4. Configure na Vercel as variáveis de `.env.example`. Use novos `CRON_SECRET` e `RATE_LIMIT_SECRET`, independentes e aleatórios, sem expô-los em logs. Ajuste `FOOTBALL_DAILY_BUDGET` à cota. Preserve o par VAPID. Mantenha a chave de serviço só no servidor.
5. Execute `npm run build` e publique a versão corrigida com handlers, bibliotecas e assets usando este `vercel.json`. Variáveis atualizadas só entram no próximo deployment.
6. Valide leitura e permissões. Cron sem Bearer deve retornar 401, inclusive com `x-vercel-cron`. Teste criação, atualização, envio e exclusão com dispositivo de teste consentido. Indisponibilidade do banco não pode parecer sucesso.
7. No Supabase Vault, crie/atualize `futstats_cron_secret` com o mesmo novo segredo da Vercel. Execute `supabase/cron_setup.sql`, conferindo o domínio. O agendador guarda referência ao Vault, não token literal.
8. Publique o workflow GitHub sem `schedule` e atualize o secret `CRON_SECRET` caso queira disparo manual. Confirme que não há segundo agendador automático.
9. Observe logs, respostas 429/503, orçamento da API, cursores e entregas. Confirme revogação do token antigo na versão ativa, sem colocá-lo em comandos compartilhados ou URLs.

O job tem limites de tempo, consultas e entregas por execução. Checkpoints e reservas permitem retomada e reduzem duplicatas, mas não garantem todos os eventos durante indisponibilidade prolongada. Avalie capacidade antes de aumentar tráfego.

## Diagnóstico

- 400 em football: parâmetro ou combinação inválida; confira o contrato em `api/football.js`.
- 429: limite por cliente ou orçamento global; respeite `Retry-After`.
- 503: configuração, banco ou controle indisponível; confira RPCs, chave de serviço e `RATE_LIMIT_SECRET`. Não habilite fallback anônimo.
- Push inativo após falha: corrija o servidor e registre novamente. Permissão no navegador não comprova persistência no banco.
- Dados esportivos ausentes podem decorrer da cobertura do fornecedor. Não registre endpoints de assinatura completos, chaves ou cabeçalhos de autenticação.
- Service worker guarda somente assets aprovados; APIs e respostas de erro ficam fora do cache offline.

## Rollback e histórico

Pause o cron para investigar falhas. Prefira corrigir/republicar preservando novos segredos e políticas restritas. Voltar ao deployment anterior reintroduz vulnerabilidades; não faça rollback cego. Restaure arquivos do backup em outra pasta e compare. Restauração de banco exige snapshot remoto e análise de registros criados depois dele.

O token antigo apareceu em commits anteriores. Rotação efetiva é obrigatória: remover a linha atual não limpa o histórico. Não reescreva branches compartilhadas sem coordenação. Novos backups são ignorados e todos são excluídos do upload Vercel. Os 49 arquivos de backup anteriormente rastreados foram retirados do índice Git neste checkout, sem exclusão física. Essa alteração só chega ao repositório remoto após commit e push.
