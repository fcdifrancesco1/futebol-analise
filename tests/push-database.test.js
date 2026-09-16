const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const schema = readFileSync(require.resolve('../supabase/schema_rls.sql'), 'utf8');
const integration = readFileSync(require.resolve('../supabase/tests/push-security.sql'), 'utf8');
const token = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const endpoint = 'https://fcm.googleapis.com/fcm/send/database-test';
async function database() {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  return db;
}
test('push schema fresh install, repeated application and executable security assertions', async () => {
  const db = await database();
  try { await db.exec(schema); await db.exec(schema); await db.exec(integration); }
  finally {await db.close();}
});
test('existing subscriptions and history survive schema migration with JSON columns', async () => {
  const db = await database();
  try {
    await db.exec('CREATE TABLE public.push_subscriptions(endpoint text PRIMARY KEY, auth text, p256dh text, favorite_teams json, preferences json, updated_at timestamptz);');
    await db.query('INSERT INTO push_subscriptions VALUES($1,$2,$3,$4,$5,now())',[endpoint,'owner','public','[1]','{"goals":false,"sent_events":["goal-legacy"]}']);
    await db.exec(schema);
    assert.equal((await db.query('SELECT auth, preferences FROM push_subscriptions')).rows[0].auth,'owner');
    assert.equal((await db.query('SELECT status FROM push_delivery_events WHERE event_key=$1',['goal-legacy'])).rows[0].status,'sent');
    await db.query('SELECT save_push_subscription($1,$2,$3,$4,$5)',[endpoint,'owner','public','[2]','{"goals":true}']);
    assert.deepEqual((await db.query('SELECT favorite_teams FROM push_subscriptions')).rows[0].favorite_teams,[2]);
    await db.exec(schema);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM push_delivery_events')).rows[0].count,1);
  } finally { await db.close(); }
});
test('competing upserts cannot transfer ownership and competing event reservations have one winner', async () => {
  const db = await database();
  try {
    await db.exec(schema);
    const registrations = await Promise.all(['owner','attacker'].map(auth=>db.query('SELECT save_push_subscription($1,$2,$3,$4,$5) AS saved',[endpoint,auth,'public','[1]','{}'])));
    assert.equal(registrations.filter(r=>r.rows[0].saved).length,1);
    const owner=(await db.query('SELECT auth FROM push_subscriptions WHERE endpoint=$1',[endpoint])).rows[0].auth;
    await db.query('SELECT * FROM acquire_push_run($1)',[token]);
    const claims=await Promise.all([1,2].map(()=>db.query('SELECT claim_push_event($1,$2,$3,$4) AS claimed',[endpoint,owner,'goal-1',token])));
    assert.equal(claims.filter(r=>r.rows[0].claimed).length,1);
    assert.equal((await db.query('SELECT * FROM acquire_push_run($1)',[other])).rows.length,0);
    await db.query("UPDATE push_run_state SET lease_until=now()-interval '1 second'");
    await db.query('SELECT * FROM acquire_push_run($1)',[other]);
    assert.equal((await db.query('SELECT release_push_run($1,$2) AS released',[token,'old-cursor'])).rows[0].released,false);
    await assert.rejects(db.query('SELECT claim_push_event($1,$2,$3,$4)',[endpoint,owner,'goal-2',token]),/inactive run lease/);
  } finally {await db.close();}
});
test('unsupported legacy schema fails without changing subscriptions', async () => {
  const db=await database();
  try {
    await db.exec('CREATE TABLE public.push_subscriptions(endpoint text PRIMARY KEY, auth text, p256dh text, favorite_teams text, preferences jsonb, updated_at timestamptz);');
    await db.query('INSERT INTO push_subscriptions VALUES($1,$2,$3,$4,$5,now())',[endpoint,'owner','public','[1]','{}']);
    await assert.rejects(db.exec(schema),/Preflight/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT auth FROM push_subscriptions')).rows[0].auth,'owner');
  } finally {await db.close();}
});
test('legacy serial subscription IDs remain usable by service_role', async () => {
  const db=await database();
  try {
    await db.exec('CREATE TABLE public.push_subscriptions(id bigserial PRIMARY KEY, endpoint text UNIQUE, auth text, p256dh text, favorite_teams jsonb, preferences jsonb, updated_at timestamptz);');
    await db.exec(schema);
    await db.exec('SET ROLE service_role');
    const result=await db.query('SELECT save_push_subscription($1,$2,$3,$4,$5) AS saved',[endpoint,'owner','public','[]','{}']);
    assert.equal(result.rows[0].saved,true);
  } finally {await db.close();}
});
