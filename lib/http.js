// The deadline covers headers AND body consumption. Redirects are never followed.
async function fetchBounded(url, options = {}, { timeoutMs = 10000, maxBytes = 2 * 1024 * 1024, contentTypes } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader;
  try {
    const response = await fetch(url, { ...options, redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error('Upstream HTTP error');
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentTypes && !contentTypes.includes(contentType)) throw new Error('Unexpected content type');
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Response too large');
    reader = response.body?.getReader();
    if (!reader) throw new Error('Missing response body');
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Response too large');
      chunks.push(Buffer.from(value));
    }
    return { body: Buffer.concat(chunks, size), contentType };
  } finally {
    clearTimeout(timer);
    if (reader) { try { await reader.cancel(); } catch {} }
    controller.abort();
  }
}
function requireGet(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return true;
  res.setHeader('Allow', 'GET'); res.status(405).json({ error: 'Método não permitido.' }); return false;
}
module.exports = { fetchBounded, requireGet };
