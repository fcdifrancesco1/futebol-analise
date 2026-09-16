-- Run after schema_rls.sql using psql with ON_ERROR_STOP=1. All test changes roll back.
BEGIN;
DO $$
DECLARE routine regprocedure;
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'public.save_push_subscription(text,text,text,jsonb,jsonb)'::regprocedure,
    'public.delete_push_subscription(text,text)'::regprocedure,
    'public.acquire_push_run(uuid)'::regprocedure,
    'public.release_push_run(uuid,text,text,bigint)'::regprocedure,
    'public.claim_push_event(text,text,text,uuid)'::regprocedure,
    'public.finish_push_event(text,text,uuid,text)'::regprocedure
  ] LOOP
    ASSERT NOT has_function_privilege('anon',routine,'EXECUTE'), 'anon can invoke private RPC';
    ASSERT NOT has_function_privilege('authenticated',routine,'EXECUTE'), 'authenticated can invoke private RPC';
    ASSERT has_function_privilege('service_role',routine,'EXECUTE'), 'backend cannot invoke RPC';
    ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid=routine), 'RPC bypasses caller privileges';
  END LOOP;
  ASSERT NOT has_table_privilege('anon','public.push_subscriptions','SELECT'), 'public subscription disclosure';
  ASSERT NOT has_table_privilege('authenticated','public.push_subscriptions','INSERT'), 'direct subscription insertion';
  ASSERT NOT has_table_privilege('anon','public.push_delivery_events','SELECT'), 'ledger disclosure';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.push_subscriptions'::regclass), 'RLS disabled';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.push_delivery_events'::regclass), 'ledger RLS disabled';
END $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE test_endpoint text := 'https://fcm.googleapis.com/fcm/send/sql-integration-' || gen_random_uuid();
  token uuid := gen_random_uuid(); other_token uuid := gen_random_uuid(); acquired integer;
BEGIN
  ASSERT public.save_push_subscription(test_endpoint,'owner-key','public-key','[1]','{"goals":true,"sent_events":["client-forged"]}');
  ASSERT NOT public.save_push_subscription(test_endpoint,'attacker-key','changed','[2]','{"goals":false}'), 'ownership stolen';
  ASSERT (SELECT auth='owner-key' AND favorite_teams::jsonb='[1]'::jsonb FROM public.push_subscriptions WHERE push_subscriptions.endpoint=test_endpoint), 'collision modified record';
  ASSERT NOT public.delete_push_subscription(test_endpoint,NULL), 'missing auth deleted row';
  ASSERT NOT public.delete_push_subscription(test_endpoint,'attacker-key'), 'foreign auth deleted row';
  ASSERT NOT (SELECT preferences::jsonb ? 'sent_events' FROM public.push_subscriptions WHERE push_subscriptions.endpoint=test_endpoint), 'client inserted history';
  -- Isolate this transaction from a production run; these changes roll back.
  UPDATE public.push_run_state SET token=NULL,lease_until=NULL WHERE name='alerts';
  SELECT count(*) INTO acquired FROM public.acquire_push_run(token);
  ASSERT acquired=1, 'first run did not acquire';
  SELECT count(*) INTO acquired FROM public.acquire_push_run(other_token);
  ASSERT acquired=0, 'second run acquired overlapping lease';
  ASSERT public.claim_push_event(test_endpoint,'owner-key','goal-123',token), 'first claim failed';
  ASSERT NOT public.claim_push_event(test_endpoint,'owner-key','goal-123',token), 'duplicate claimed';
  ASSERT public.save_push_subscription(test_endpoint,'owner-key','public-key','[2]','{"goals":false,"sent_events":[]}');
  ASSERT NOT public.claim_push_event(test_endpoint,'owner-key','goal-123',token), 'client reset dedupe';
  ASSERT public.finish_push_event(test_endpoint,'goal-123',token,'unknown');
  ASSERT (SELECT preferences::jsonb->>'goals'='false' FROM public.push_subscriptions WHERE push_subscriptions.endpoint=test_endpoint), 'delivery overwrote preferences';
  ASSERT NOT public.finish_push_event(test_endpoint,'goal-123',token,'sent'), 'unknown outcome overwritten';
  ASSERT NOT public.release_push_run(other_token,'attacker-cursor'), 'foreign release succeeded';
  ASSERT public.release_push_run(token,test_endpoint), 'release failed';
  ASSERT (SELECT cursor_endpoint=test_endpoint FROM public.push_run_state WHERE name='alerts'), 'cursor lost';
  ASSERT public.delete_push_subscription(test_endpoint,'owner-key');
  ASSERT EXISTS(SELECT 1 FROM public.push_delivery_events WHERE push_delivery_events.endpoint=test_endpoint), 'unsubscribe erased dedupe';
END $$;
ROLLBACK;
