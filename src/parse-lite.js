// Chromium-free page parser. Runs the SAME extraction contract as browser.js's
// EXTRACT (see that file), but against a linkedom DOM instead of a real browser.
// Used by the hosted/serverless audit path where launching Chromium isn't viable.
//
// It cannot execute JavaScript, so it sees the raw HTML only — equivalent to the
// CLI's --no-render mode. The output shape MUST stay in lockstep with EXTRACT so
// crawler.js and the checks treat both parsers identically.
import { parseHTML } from 'linkedom';

export function makeLiteParser() {
  return {
    available: true,
    // Same signature the crawler expects from BrowserPool.parseHtml.
    async parseHtml(html, baseUrl) {
      try { return extract(html, baseUrl); }
      catch { return null; }
    },
    // No JS execution without a browser — rendering is a no-op here. The crawler
    // only calls this when render:true, which the serverless path never sets.
    async renderUrl() { return null; },
    async close() {},
  };
}

function extract(html, baseUrl) {
  const { document: d } = parseHTML(html);
  const q = (sel) => d.querySelector(sel);
  const meta = (n) => q(`meta[name="${n}" i]`)?.getAttribute('content') ?? null;
  const prop = (p) => q(`meta[property="${p}"]`)?.getAttribute('content') ?? null;
  const abs = (v) => { if (!v) return null; try { return new URL(v, baseUrl).toString(); } catch { return v; } };

  const jsonld = [];
  let jsonldErrors = 0;
  for (const s of d.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const j = JSON.parse(s.textContent);
      const items = Array.isArray(j) ? j : (j && j['@graph'] ? j['@graph'] : [j]);
      for (const it of items) {
        if (it && typeof it === 'object') {
          jsonld.push({
            type: [].concat(it['@type'] || []),
            author: it.author ? (it.author.name || (typeof it.author === 'string' ? it.author : null)) : null,
            datePublished: it.datePublished || null,
            dateModified: it.dateModified || null,
          });
        }
      }
    } catch { jsonldErrors++; }
  }

  const headings = [...d.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .map(h => ({ level: +h.tagName[1], text: (h.textContent || '').trim().slice(0, 80) }));
  const imgs = [...d.querySelectorAll('img')];
  const anchors = [...d.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(Boolean);

  let bodyText = '';
  if (d.body) {
    const clone = d.body.cloneNode(true);
    for (const el of clone.querySelectorAll('script,style,noscript,template')) el.remove();
    bodyText = (clone.textContent || '').replace(/\s+/g, ' ');
  }
  const words = bodyText.trim().split(/\s+/).filter(Boolean);

  const canonicalEl = q('link[rel="canonical"]');

  return {
    title: d.title || null,
    metaDescription: meta('description'),
    metaRobots: meta('robots'),
    canonical: abs(canonicalEl?.getAttribute('href')),
    hreflangs: [...d.querySelectorAll('link[rel="alternate"][hreflang]')].map(l => l.getAttribute('hreflang')).filter(Boolean),
    lang: d.documentElement.getAttribute('lang'),
    viewport: !!q('meta[name="viewport" i]'),
    og: { title: prop('og:title'), description: prop('og:description'), image: prop('og:image'), url: prop('og:url') },
    twitterCard: !!q('meta[name^="twitter:" i]'),
    headings,
    jsonld,
    jsonldErrors,
    imgTotal: imgs.length,
    imgsMissingAlt: imgs.filter(i => !((i.getAttribute('alt') || '').trim())).length,
    anchors,
    wordCount: words.length,
    hasMainEl: !!q('main, article, [role="main"]'),
    timeEls: d.querySelectorAll('time').length,
    visibleDate: /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d\d|\b20\d\d-\d\d-\d\d\b/.test(bodyText),
    visibleAuthor: /\bBy\s+[A-Z][\w&.,'’ -]{2,60}/.test(bodyText),
    mixedContent: d.querySelectorAll('img[src^="http://"], script[src^="http://"], link[href^="http://"][rel="stylesheet"]').length,
  };
}
