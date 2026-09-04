-- ============================================================
-- FutStats — Agendamento de Alertas Automáticos no Supabase
-- Executar no Supabase SQL Editor para ativar o robô a cada 1 minuto
-- ============================================================

-- 1. Habilitar extensões necessárias para cron e requisições HTTP
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Remover agendamento anterior se existir
DO $$
BEGIN
  PERFORM cron.unschedule('futstats-live-alerts');
EXCEPTION WHEN OTHERS THEN
  -- Ignora caso o job ainda não exista
END $$;

-- 3. Agendar requisição para o robô da Vercel a cada minuto
SELECT cron.schedule(
  'futstats-live-alerts',
  '* * * * *',
  $$
  SELECT net.http_get(
    url:='https://futebol-analise.vercel.app/api/cron-alerts',
    headers:='{"Authorization": "Bearer futstats_cron_secure_secret_token"}'::jsonb
  );
  $$
);
