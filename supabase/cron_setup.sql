-- Set futstats_cron_secret in Supabase Vault UI to the same newly rotated CRON_SECRET in Vercel.
-- Never put the secret into SQL source, job commands, or repository files.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='futstats_cron_secret' AND length(decrypted_secret)>=32)
    THEN RAISE EXCEPTION 'Configure futstats_cron_secret in Vault first'; END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='futstats-live-alerts';
END $$;
SELECT cron.schedule('futstats-live-alerts', '* * * * *', $job$
  SELECT net.http_get(
    url := 'https://futebol-analise.vercel.app/api/cron-alerts',
    headers := jsonb_build_object('Authorization', 'Bearer ' || decrypted_secret),
    timeout_milliseconds := 55000
  ) FROM vault.decrypted_secrets WHERE name='futstats_cron_secret';
$job$);
COMMIT;
