// Shared browser/Node cache logic. Only successful football responses are cached.
function safeReadStorage(storage, key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key));
    if (value === null || typeof value !== typeof fallback || Array.isArray(value) !== Array.isArray(fallback)) return fallback;
    if (typeof fallback !== 'object') return value;
    return Array.isArray(fallback) ? value : { ...fallback, ...value };
  } catch { return fallback; }
}

function cacheQuery(endpoint, params = {}) {
  return new URLSearchParams({ endpoint, ...Object.fromEntries(Object.entries(params)
    .filter(([,v]) => v !== undefined && v !== null && v !== '')
    .sort(([a],[b]) => a.localeCompare(b))) }).toString();
}
function cacheKey(endpoint, params = {}) { return `ap_cache_v95_${cacheQuery(endpoint, params)}`; }

function createApiClient({ fetch: fetcher, storage, now = Date.now, onUpdate = () => {} }) {
  const cache = new Map(), pending = new Map();
  const check = signal => { if (signal?.aborted) throw new DOMException('Navegação cancelada', 'AbortError'); };
  function invalidate(endpoint, params) {
    const key = cacheKey(endpoint, params);
    cache.delete(key);
    try { storage?.removeItem(key); } catch { /* unavailable storage */ }
  }
  async function get(endpoint, params = {}, ttlMinutes = 15, signal) {
    check(signal);
    const key = cacheKey(endpoint, params);
    const ttl = ['fixtures/players','fixtures/lineups'].includes(endpoint) ? Math.min(ttlMinutes,1) : ttlMinutes;
    let saved = cache.get(key);
    if (!saved) { try { saved = JSON.parse(storage?.getItem(key) || 'null'); } catch { /* malformed */ } }
    if (ttl > 0 && saved?.data !== undefined && now() - saved.timestamp < ttl * 60000) {
      cache.set(key,saved); onUpdate(true); return saved.data;
    }
    const existing = pending.get(key);
    if (existing && existing.signal === signal && !signal?.aborted) return existing.promise;
    const promise = (async () => {
      for (let attempt=0; attempt<2; attempt++) {
        check(signal);
        try {
          const response = await fetcher(`/api/football?${cacheQuery(endpoint,params)}`, {signal});
          check(signal);
          const body = await response.json();
          check(signal);
          if (!response.ok) {
            const err = new Error(body.error || body.message || `Erro ${response.status} ao consultar dados.`);
            err.retryable = response.status >= 500 || response.status === 429;
            throw err;
          }
          if (body.errors && Object.keys(body.errors).length) {
            const err = new Error(String(Object.values(body.errors)[0])); err.retryable=false; throw err;
          }
          const data = body.response ?? [];
          if (ttl > 0) {
            const entry={data,timestamp:now()}; cache.set(key,entry);
            try { storage?.setItem(key,JSON.stringify(entry)); } catch { /* quota */ }
            if (cache.size > 200) cache.delete(cache.keys().next().value);
          }
          onUpdate(false); return data;
        } catch (err) {
          check(signal);
          if (err.name === 'AbortError' || err.retryable === false || attempt === 1) throw err;
        }
      }
    })();
    pending.set(key,{promise,signal});
    try { return await promise; } finally { if (pending.get(key)?.promise === promise) pending.delete(key); }
  }
  return {get,invalidate,cache};
}
if (typeof module !== 'undefined') module.exports={createApiClient,cacheKey,cacheQuery,safeReadStorage};
