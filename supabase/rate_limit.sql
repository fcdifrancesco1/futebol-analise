-- Apply with an administrative SQL session before deploying protected routes.
-- Only server service_role may operate counters. IPs are HMAC hashes.
begin;
create table if not exists public.request_limit_counters (
  scope text not null, subject text not null, window_start bigint not null,
  window_seconds integer not null, hits integer not null check (hits > 0),
  expires_at timestamptz not null,
  primary key (scope, subject, window_start, window_seconds)
);
create index if not exists request_limit_expiry_idx on public.request_limit_counters (expires_at);
alter table public.request_limit_counters enable row level security;
revoke all on public.request_limit_counters from public, anon, authenticated;
grant select, insert, update, delete on public.request_limit_counters to service_role;
create or replace function public.consume_request_limit(
  p_scope text, p_subject text, p_limit integer, p_window_seconds integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_start bigint; v_hits integer; v_retry integer;
begin
  if p_scope is null or p_scope !~ '^[a-z][a-z0-9-]{0,63}$'
    or p_subject is null or (p_subject <> 'global' and p_subject !~ '^[a-f0-9]{64}$')
    or p_limit is null or p_limit < 1 or p_limit > 1000000
    or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid counter input';
  end if;
  v_start := floor(extract(epoch from v_now) / p_window_seconds)::bigint * p_window_seconds;
  v_retry := greatest(1, ceil(v_start + p_window_seconds - extract(epoch from v_now))::integer);
  -- Atomic upsert locks each counter across instances; denial never increments
  -- beyond the configured ceiling.
  insert into public.request_limit_counters as c (scope, subject, window_start, window_seconds, hits, expires_at)
  values (p_scope, p_subject, v_start, p_window_seconds, 1, to_timestamp(v_start + p_window_seconds))
  on conflict (scope, subject, window_start, window_seconds) do update
    set hits = c.hits + 1 where c.hits < p_limit
  returning hits into v_hits;
  -- Bounded cleanup skips locked rows, avoiding blocking active requests.
  delete from public.request_limit_counters where ctid in (
    select ctid from public.request_limit_counters
    where expires_at < v_now - interval '1 day'
    order by expires_at limit 100 for update skip locked
  );
  return jsonb_build_object('allowed', v_hits is not null, 'retry_after', v_retry);
end;
$$;
revoke all on function public.consume_request_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_request_limit(text, text, integer, integer) to service_role;
commit;
