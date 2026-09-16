const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('Postgres counters enforce the ceiling atomically and deny public roles', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    const schema = fs.readFileSync(path.join(__dirname, '../supabase/rate_limit.sql'), 'utf8');
    await db.exec(schema);
    await db.exec(schema);
    await db.exec('SET ROLE service_role');
    const calls = await Promise.all(Array.from({length:12}, () => db.query("SELECT public.consume_request_limit('football-global','global',5,86400) AS result")));
    assert.equal(calls.filter(r => r.rows[0].result.allowed).length, 5);
    assert.equal((await db.query('SELECT hits FROM public.request_limit_counters')).rows[0].hits, 5);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query("SELECT public.consume_request_limit('football-global','global',5,86400)"), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM public.request_limit_counters'), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE authenticated');
    await assert.rejects(db.query('SELECT * FROM public.request_limit_counters'), /permission denied/);
  } finally { await db.close(); }
});

test('Postgres request windows clean expired counters and isolate subjects', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/rate_limit.sql'), 'utf8'));
    await db.exec("INSERT INTO public.request_limit_counters VALUES ('old','global',1,60,1,now()-interval '3 days')");
    await db.exec('SET ROLE service_role');
    const first = await db.query("SELECT public.consume_request_limit('football',$1,1,60) AS result", ['a'.repeat(64)]);
    const second = await db.query("SELECT public.consume_request_limit('football',$1,1,60) AS result", ['b'.repeat(64)]);
    assert.equal(first.rows[0].result.allowed, true);
    assert.equal(second.rows[0].result.allowed, true);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.request_limit_counters WHERE scope='old'")).rows[0].count, 0);
    assert.ok(first.rows[0].result.retry_after >= 1 && first.rows[0].result.retry_after <= 60);
  } finally { await db.close(); }
});
