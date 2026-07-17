// Playwright layer. Chromium is used BOTH as the raw-HTML parser (JS disabled,
// setContent — no network, no scripts) and as the renderer for escalated pages.
// Both passes run the SAME extraction function, so raw vs rendered comparisons
// are apples-to-apples.

let pw = null;
async function playwright() {
  if (pw) return pw;
  try {
    pw = await import('playwright');
    return pw;
  } catch {
    // Fall back to CJS resolution (honors NODE_PATH and global installs).
    try {
      const { createRequire } = await import('node:module');
      pw = createRequire(import.meta.url)('playwright');
      return pw;
    } catch {
      return null;
    }
  }
}

// Runs inside the page. Must be self-contained (serialized by Playwright).
const EXTRACT = () => {
  const d = document;
  const q = (sel) => d.querySelector(sel);
  const meta = (n) => q(`meta[name="${n}" i]`)?.getAttribute('content') ?? null;
  const prop = (p) => q(`meta[property="${p}"]`)?.getAttribute('content') ?? null;

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
    } catch (e) { jsonldErrors++; }
  }

  const headings = [...d.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .map(h => ({ level: +h.tagName[1], text: (h.textContent || '').trim().slice(0, 80) }));
  const imgs = [...d.images];
  const anchors = [...d.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(Boolean);
  let bodyText = '';
  if (d.body) {
    const clone = d.body.cloneNode(true);
    for (const el of clone.querySelectorAll('script,style,noscript,template')) el.remove();
    bodyText = (clone.textContent || '').replace(/\s+/g, ' ');
  }
  const words = bodyText.trim().split(/\s+/).filter(Boolean);

  return {
    title: d.title || null,
    metaDescription: meta('description'),
    metaRobots: meta('robots'),
    canonical: q('link[rel="canonical"]')?.href ?? null,
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
};

export class BrowserPool {
  constructor({ userAgent } = {}) {
    this.userAgent = userAgent;
    this.browser = null;
    this.parseCtx = null;   // JS disabled — pure parser
    this.renderCtx = null;  // JS enabled — real render
    this.available = undefined;
  }

  async ensure() {
    // Memoized: concurrent callers share one launch, else each would spawn its own Chromium.
    this.launching ??= this.#launch();
    return this.launching;
  }

  async #launch() {
    if (this.browser) return true;
    if (this.available === false) return false;
    const mod = await playwright();
    if (!mod) { this.available = false; return false; }
    try {
      this.browser = await mod.chromium.launch({ headless: true });
      this.parseCtx = await this.browser.newContext({ javaScriptEnabled: false, userAgent: this.userAgent });
      this.renderCtx = await this.browser.newContext({ javaScriptEnabled: true, userAgent: this.userAgent });
      // The parser context must never touch the network.
      await this.parseCtx.route('**/*', route => route.abort());
      this.available = true;
      return true;
    } catch (err) {
      this.available = false;
      this.launchError = err?.message || String(err);
      return false;
    }
  }

  // Parse raw HTML into a page model without executing scripts or fetching subresources.
  async parseHtml(html, baseUrl) {
    if (!(await this.ensure())) return null;
    const page = await this.parseCtx.newPage();
    try {
      const withBase = /<base\s/i.test(html)
        ? html
        : html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseUrl.replace(/"/g, '&quot;')}">`);
      await page.setContent(withBase, { waitUntil: 'domcontentloaded', timeout: 15000 });
      return await page.evaluate(EXTRACT);
    } finally {
      await page.close().catch(() => {});
    }
  }

  // Full render with JS for escalated pages.
  async renderUrl(url, { waitMs = 1200, timeout = 30000 } = {}) {
    if (!(await this.ensure())) return null;
    const page = await this.renderCtx.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(waitMs);
      const model = await page.evaluate(EXTRACT);
      return { model, status: resp?.status() ?? null };
    } catch (err) {
      return { model: null, status: null, error: err?.message || String(err) };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async pdf(html, outPath) {
    if (!(await this.ensure())) throw new Error('PDF export requires Playwright with Chromium installed (npx playwright install chromium).');
    const page = await this.renderCtx.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.emulateMedia({ media: 'print', colorScheme: 'light' });
      await page.pdf({ path: outPath, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' } });
    } finally {
      await page.close().catch(() => {});
    }
  }

  async close() {
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.launching = null;
  }
}
