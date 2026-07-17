// Shared entry point for the hosted/serverless audit. Wraps the same engine the
// CLI uses, but with the constraints a public web endpoint needs:
//   - Chromium-free parsing (linkedom), so it deploys without a browser binary
//   - no JS rendering (raw HTML only) to stay inside the function time budget
//   - a hard 30-page crawl cap that callers cannot exceed
import { audit } from './crawler.js';
import { score } from './score.js';
import { makeLiteParser } from './parse-lite.js';

export const MAX_PAGES = 30;

const normalizeUrl = (u) => /^https?:\/\//i.test(u) ? u : 'https://' + u;

// Clamp a requested page count into [1, MAX_PAGES]; fall back to the cap.
function clampPages(requested) {
  const n = Math.floor(Number(requested));
  if (!Number.isFinite(n) || n < 1) return MAX_PAGES;
  return Math.min(n, MAX_PAGES);
}

// Run an audit for the hosted API. Returns the JSON-serializable result object.
// Throws on invalid input so the caller can map it to a 4xx.
export async function runApiAudit({ url, maxPages, concurrency, checksFilter } = {}) {
  if (!url || typeof url !== 'string') throw new Error('missing required "url"');
  let baseUrl;
  try { baseUrl = new URL(normalizeUrl(url.trim())).toString(); }
  catch { throw new Error(`invalid url: ${url}`); }

  const result = await audit(baseUrl, {
    pool: makeLiteParser(),
    render: false,                       // no browser → no rendering
    renderAll: false,
    maxPages: clampPages(maxPages),      // hard cap, never above MAX_PAGES
    concurrency: Math.min(Math.max(Number(concurrency) || 4, 1), 8),
    checksFilter: ['seo', 'aeo', 'all'].includes(checksFilter) ? checksFilter : 'all',
  });

  result.scores = score(result.findings, result.pagesCrawled);
  delete result._internalPages;         // internal-only, not for the wire
  return result;
}
