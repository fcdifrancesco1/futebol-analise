-- Apply transactionally before deploying the new push routes. Existing subscriptions are retained.
BEGIN;
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint text PRIMARY KEY, p256dh text NOT NULL, auth text NOT NULL,
  favorite_teams jsonb NOT NULL DEFAULT '[]', preferences jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Fail before modifying data if a legacy installation uses an unsupported layout.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='push_subscriptions'
    AND column_name IN ('favorite_teams','preferences') AND data_type NOT IN ('json','jsonb'))
    THEN RAISE EXCEPTION 'Preflight: favorite_teams/preferences must be json or jsonb; inspect existing data before migration'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique ON public.push_subscriptions(endpoint);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;
-- Some existing installations use a serial ID in addition to the endpoint.
DO $$
DECLARE sequence_name text;
BEGIN
  FOR sequence_name IN
    SELECT pg_get_serial_sequence('public.push_subscriptions', column_name)
    FROM information_schema.columns WHERE table_schema='public' AND table_name='push_subscriptions'
  LOOP
    IF sequence_name IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', sequence_name);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', sequence_name);
    END IF;
  END LOOP;
END $$;
-- Remove all old policies, including policies installed outside the original script.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='push_subscriptions' LOOP
    EXECUTE format('DROP POLICY %I ON public.push_subscriptions', item.policyname);
  END LOOP;
END $$;
CREATE POLICY push_service_only ON public.push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.push_delivery_events (
  endpoint text NOT NULL, event_key text NOT NULL, token uuid,
  status text NOT NULL CHECK (status IN ('reserved','sent','unknown','expired')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(endpoint,event_key)
);
CREATE INDEX IF NOT EXISTS push_delivery_events_age ON public.push_delivery_events(created_at);
CREATE TABLE IF NOT EXISTS public.push_run_state (
  name text PRIMARY KEY, token uuid, lease_until timestamptz,
  cursor_endpoint text NOT NULL DEFAULT ''
);
ALTER TABLE public.push_run_state ADD COLUMN IF NOT EXISTS active_endpoint text NOT NULL DEFAULT '';
ALTER TABLE public.push_run_state ADD COLUMN IF NOT EXISTS cursor_fixture bigint NOT NULL DEFAULT 0;
INSERT INTO public.push_run_state(name) VALUES ('alerts') ON CONFLICT DO NOTHING;
ALTER TABLE public.push_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_run_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_delivery_events, public.push_run_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_delivery_events, public.push_run_state TO service_role;
DROP POLICY IF EXISTS push_service_only ON public.push_delivery_events;
CREATE POLICY push_service_only ON public.push_delivery_events FOR ALL TO service_role USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS push_service_only ON public.push_run_state;
CREATE POLICY push_service_only ON public.push_run_state FOR ALL TO service_role USING(true) WITH CHECK(true);

-- Carry forward legacy deduplication without rewriting preference snapshots.
INSERT INTO public.push_delivery_events(endpoint,event_key,status)
SELECT s.endpoint, event_key, 'sent'
FROM public.push_subscriptions s
CROSS JOIN LATERAL jsonb_array_elements_text(
 CASE WHEN jsonb_typeof(s.preferences::jsonb->'sent_events')='array'
 THEN s.preferences::jsonb->'sent_events' ELSE '[]'::jsonb END
) AS e(event_key)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint text,p_auth text,p_p256dh text,p_favorite_teams jsonb,p_preferences jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved text;
BEGIN
  IF jsonb_typeof(p_favorite_teams) IS DISTINCT FROM 'array' OR jsonb_array_length(p_favorite_teams)>50
    OR jsonb_typeof(p_preferences) IS DISTINCT FROM 'object'
    OR octet_length(p_preferences::text)>16384 THEN RAISE EXCEPTION 'invalid subscription payload'; END IF;
  INSERT INTO public.push_subscriptions(endpoint,auth,p256dh,favorite_teams,preferences,updated_at)
  VALUES(p_endpoint,p_auth,p_p256dh,p_favorite_teams,p_preferences-'sent_events',now())
  ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, favorite_teams=EXCLUDED.favorite_teams,
    preferences=EXCLUDED.preferences, updated_at=now()
  WHERE public.push_subscriptions.auth=EXCLUDED.auth
  RETURNING endpoint INTO saved;
  RETURN saved IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text,p_auth text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE removed text;
BEGIN
  IF p_auth IS NULL OR p_auth='' THEN RETURN false; END IF;
  DELETE FROM public.push_subscriptions WHERE endpoint=p_endpoint AND auth=p_auth RETURNING endpoint INTO removed;
  RETURN removed IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION public.acquire_push_run(p_token uuid)
RETURNS TABLE(cursor_endpoint text,active_endpoint text,cursor_fixture bigint) LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'token required'; END IF;
  RETURN QUERY UPDATE public.push_run_state s SET token=p_token, lease_until=now()+interval '120 seconds'
    WHERE name='alerts' AND (lease_until IS NULL OR lease_until<now()) RETURNING s.cursor_endpoint,s.active_endpoint,s.cursor_fixture;
  -- Mark interrupted attempts honestly; never retry an uncertain provider outcome automatically.
  UPDATE public.push_delivery_events SET status='unknown',updated_at=now()
    WHERE status='reserved' AND updated_at<now()-interval '3 minutes';
  DELETE FROM public.push_delivery_events WHERE created_at<now()-interval '30 days';
END $$;
CREATE OR REPLACE FUNCTION public.release_push_run(p_token uuid,p_cursor text,p_active text DEFAULT '',p_fixture bigint DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE released text;
BEGIN
  UPDATE public.push_run_state SET token=NULL,lease_until=NULL,cursor_endpoint=coalesce(p_cursor,''),active_endpoint=coalesce(p_active,''),cursor_fixture=coalesce(p_fixture,0)
    WHERE name='alerts' AND token=p_token RETURNING name INTO released;
  RETURN released IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION public.claim_push_event(p_endpoint text,p_auth text,p_event text,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE claimed text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.push_run_state WHERE name='alerts' AND token=p_token AND lease_until>now())
    THEN RAISE EXCEPTION 'inactive run lease'; END IF;
  IF length(p_event)>200 OR p_event IS NULL OR p_event='' THEN RAISE EXCEPTION 'invalid event'; END IF;
  INSERT INTO public.push_delivery_events(endpoint,event_key,token,status)
    SELECT p_endpoint,p_event,p_token,'reserved' WHERE EXISTS(
      SELECT 1 FROM public.push_subscriptions WHERE endpoint=p_endpoint AND auth=p_auth)
    ON CONFLICT DO NOTHING RETURNING event_key INTO claimed;
  RETURN claimed IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION public.finish_push_event(p_endpoint text,p_event text,p_token uuid,p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE finished text;
BEGIN
  IF p_status NOT IN ('sent','unknown','expired') THEN RAISE EXCEPTION 'invalid outcome'; END IF;
  UPDATE public.push_delivery_events SET status=p_status,updated_at=now()
    WHERE endpoint=p_endpoint AND event_key=p_event AND token=p_token AND status='reserved'
    RETURNING event_key INTO finished;
  RETURN finished IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.save_push_subscription(text,text,text,jsonb,jsonb),
 public.delete_push_subscription(text,text), public.acquire_push_run(uuid), public.release_push_run(uuid,text,text,bigint),
 public.claim_push_event(text,text,text,uuid), public.finish_push_event(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text,text,text,jsonb,jsonb),
 public.delete_push_subscription(text,text), public.acquire_push_run(uuid), public.release_push_run(uuid,text,text,bigint),
 public.claim_push_event(text,text,text,uuid), public.finish_push_event(text,text,uuid,text) TO service_role;
COMMIT;
