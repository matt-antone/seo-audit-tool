import { gunzipSync } from 'node:zlib';

// Minimal, dependency-free sitemap reader (index + urlset), gzip-aware.
export async function loadSitemaps(fetcher, urls, { maxDepth = 2, maxUrls = 5000 } = {}) {
  const seen = new Set();
  const pages = [];
  const sitemaps = [];

  async function load(url, depth) {
    if (seen.has(url) || depth > maxDepth || pages.length >= maxUrls) return;
    seen.add(url);
    const res = await fetcher.get(url);
    const entry = { url, status: res.ok ? res.status : res.error, valid: false, urlCount: 0 };
    sitemaps.push(entry);
    if (!res.ok || res.status !== 200) return;
    let body = res.body;
    if (url.endsWith('.gz') || (body[0] === 0x1f && body[1] === 0x8b)) {
      try { body = gunzipSync(body); } catch { return; }
    }
    const text = body.toString('utf8');
    if (!/<\s*(urlset|sitemapindex)/i.test(text)) return;
    entry.valid = true;
    const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => decodeEntities(m[1].trim()));
    if (/<\s*sitemapindex/i.test(text)) {
      for (const child of locs) await load(child, depth + 1);
    } else {
      entry.urlCount = locs.length;
      entry.lastmodCount = (text.match(/<lastmod>/gi) || []).length;
      for (const p of locs) { if (pages.length < maxUrls) pages.push(p); }
    }
  }

  for (const u of urls) await load(u, 0);
  return { pages, sitemaps };
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
