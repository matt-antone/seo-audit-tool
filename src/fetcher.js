// Raw HTTP layer — native fetch, no browser. Used for HTML retrieval,
// status probes, robots.txt, sitemaps, llms.txt.
const DEFAULT_UA = 'Mozilla/5.0 (compatible; GlyphixSEOAudit/1.0; +https://glyphix.com)';

export function makeFetcher({ userAgent = DEFAULT_UA, timeoutMs = 25000 } = {}) {
  async function get(url, { redirect = 'follow' } = {}) {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect,
        signal: ctrl.signal,
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      });
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        ok: true,
        url,
        finalUrl: res.url || url,
        redirected: res.redirected || (res.url && res.url !== url),
        status: res.status,
        contentType: res.headers.get('content-type') || '',
        body: buf,
        text: buf.toString('utf8'),
        elapsedMs: Date.now() - started,
      };
    } catch (err) {
      return { ok: false, url, error: err?.cause?.code || err?.name || String(err), elapsedMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
  return { get, userAgent };
}

export function isHtml(res) {
  return res.ok && /text\/html|application\/xhtml/i.test(res.contentType || '');
}
