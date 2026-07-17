import { makeFetcher, isHtml } from './fetcher.js';
import { parseRobots, isAllowed, botAccess, AI_BOTS } from './robots.js';
import { loadSitemaps } from './sitemap.js';
import { runPageChecks, runCrossChecks, needsRender, makeFinding } from './checks.js';
import { BrowserPool } from './browser.js';

const norm = (u) => {
  try {
    const p = new URL(u);
    p.hash = '';
    let s = p.toString();
    if (p.pathname !== '/' && s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch { return null; }
};

export async function audit(baseUrl, opts = {}) {
  const {
    maxPages = 30, maxRenders = 30, concurrency = 4,
    render = true, renderAll = false,
    ignoreChecks = [], checksFilter = 'all',
    log = () => {},
  } = opts;

  const base = new URL(baseUrl);
  const origin = base.origin;
  const host = base.host;
  const fetcher = makeFetcher(opts);
  // Parser is pluggable: the CLI uses BrowserPool (Chromium), the hosted API
  // passes a Chromium-free linkedom parser. Same interface either way.
  const pool = opts.pool ?? new BrowserPool({ userAgent: fetcher.userAgent });
  const findings = [];
  const site = { base: origin, host };

  // ---------- site probes ----------
  log('probing robots.txt, sitemap, llms.txt, 404 behavior…');
  const [robotsRes, llmsRes, probe404, httpProbe] = await Promise.all([
    fetcher.get(origin + '/robots.txt'),
    fetcher.get(origin + '/llms.txt'),
    fetcher.get(origin + '/__seo-audit-404-probe-' + process.pid),
    base.protocol === 'https:' ? fetcher.get('http://' + host + '/') : Promise.resolve(null),
  ]);

  const robotsTxt = robotsRes.ok && robotsRes.status === 200 && !/text\/html/i.test(robotsRes.contentType) ? robotsRes.text : '';
  const robots = parseRobots(robotsTxt);
  site.robots = { present: !!robotsTxt, sitemaps: robots.sitemaps };
  if (!robotsTxt) findings.push(makeFinding('robots-missing', { message: `GET /robots.txt → ${robotsRes.status || robotsRes.error}.`, verifiedBy: 'http' }));
  if (robotsTxt && !isAllowed(robots, 'Googlebot', '/')) {
    findings.push(makeFinding('robots-blocks-all', { message: 'Disallow: / applies to all crawlers.', verifiedBy: 'http' }));
  }
  site.aiBots = {};
  for (const bot of AI_BOTS) {
    const acc = robotsTxt ? botAccess(robots, bot.agent) : { access: 'allowed', via: 'no robots.txt' };
    site.aiBots[bot.agent] = { ...acc, vendor: bot.vendor };
    if (acc.access === 'blocked') {
      findings.push(makeFinding('ai-bot-blocked', { message: `${bot.agent} (${bot.vendor}) blocked via ${acc.via}.`, verifiedBy: 'http' }));
    }
  }

  const llmsOk = llmsRes.ok && llmsRes.status === 200 && !/^\s*(<!doctype|<html)/i.test(llmsRes.text) && !/text\/html/i.test(llmsRes.contentType);
  site.llmsTxt = { present: llmsOk, status: llmsRes.status || llmsRes.error };
  if (!llmsOk) findings.push(makeFinding('llms-txt-missing', { message: `GET /llms.txt → ${llmsRes.status || llmsRes.error}${llmsRes.status === 200 ? ' (HTML page, not a text file)' : ''}.`, verifiedBy: 'http' }));

  if (probe404.ok && probe404.status === 200) {
    findings.push(makeFinding('soft-404', { message: 'A made-up URL returned HTTP 200 instead of 404.', evidence: probe404.url, verifiedBy: 'http' }));
  }
  site.hard404 = probe404.ok ? probe404.status !== 200 : null;

  if (httpProbe && httpProbe.ok && !String(httpProbe.finalUrl).startsWith('https://')) {
    findings.push(makeFinding('http-no-redirect', { message: `http://${host}/ resolved to ${httpProbe.finalUrl} (status ${httpProbe.status}).`, verifiedBy: 'http' }));
  }

  // ---------- sitemap ----------
  const smUrls = robots.sitemaps.length ? robots.sitemaps : [origin + '/sitemap.xml'];
  let { pages: sitemapPages, sitemaps } = await loadSitemaps(fetcher, smUrls);
  if (!sitemapPages.length && !smUrls.includes(origin + '/sitemap.xml')) {
    // robots.txt declared sitemap(s) that yielded nothing — try the conventional location
    const fallback = await loadSitemaps(fetcher, [origin + '/sitemap.xml']);
    sitemapPages = fallback.pages;
    sitemaps = sitemaps.concat(fallback.sitemaps);
  }
  site.sitemaps = sitemaps;
  site.sitemapUrlCount = sitemapPages.length;
  const smValid = sitemaps.some(s => s.valid);
  if (!smValid) {
    const anyFetched = sitemaps.some(s => s.status === 200);
    findings.push(makeFinding(anyFetched ? 'sitemap-invalid' : 'sitemap-missing', { message: anyFetched ? 'Sitemap responded but is not parseable XML.' : `No sitemap at ${smUrls.join(', ')}.`, verifiedBy: 'http' }));
  }

  // ---------- crawl ----------
  const queue = [];
  const enqueue = (u) => {
    const n = norm(u);
    if (n && new URL(n).host === host && !seen.has(n) && !queue.includes(n)) queue.push(n);
  };
  const seen = new Set();
  const pages = [];
  let renders = 0;
  let claimed = 0; // slots reserved by workers; enforces maxPages exactly under concurrency

  enqueueBase(); // homepage first, then sitemap order
  function enqueueBase() {
    queue.push(norm(origin + base.pathname));
    for (const p of sitemapPages) enqueue(p);
  }

  log(`crawling ${maxPages === Infinity ? 'all' : `up to ${maxPages}`} pages (${sitemapPages.length} sitemap URLs discovered)…`);

  async function worker() {
    while (queue.length && claimed < maxPages) {
      const url = queue.shift();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const path = new URL(url).pathname;
      if (robotsTxt && !isAllowed(robots, '*', path)) continue;

      // Reserve a slot synchronously (no await between check and increment) so
      // concurrent workers can never push past maxPages.
      if (claimed >= maxPages) break;
      claimed++;

      const res = await fetcher.get(url);
      const record = {
        url, path,
        status: res.ok ? res.status : null,
        error: res.ok ? null : res.error,
        finalUrl: res.finalUrl || null,
        redirected: !!res.redirected,
        elapsedMs: res.elapsedMs,
        verifiedBy: 'raw',
        model: null,
        findings: [],
      };
      pages.push(record);

      if (!res.ok) { record.findings.push(makeFinding('broken-internal', { page: url, message: `Fetch failed: ${res.error}.`, verifiedBy: 'http' })); continue; }
      if (res.status >= 400) { record.findings.push(makeFinding('broken-internal', { page: url, message: `HTTP ${res.status}.`, verifiedBy: 'http' })); continue; }
      if (!isHtml(res)) continue;

      let model = await pool.parseHtml(res.text, url);
      if (!model) { record.verifiedBy = 'unverified'; model = null; }

      let ctx = { url, status: res.status, redirected: res.redirected, redirectChain: res.redirected ? [url, res.finalUrl] : null };
      const applyNoindexRule = (list, m) => (m?.metaRobots && /noindex/i.test(m.metaRobots)) ? list.filter(x => x.check === 'noindex') : list;
      let pageFindings = model ? applyNoindexRule(runPageChecks(model, ctx), model) : [];

      // hybrid escalation
      if (model && render && (renderAll || needsRender(pageFindings, model, res.text)) && renders < maxRenders) {
        renders++;
        const rendered = await pool.renderUrl(url);
        if (rendered?.model) {
          const rawWords = model.wordCount;
          model = rendered.model;
          pageFindings = applyNoindexRule(runPageChecks(model, ctx), model);
          record.verifiedBy = 'rendered';
          if (rawWords < 30 && model.wordCount >= 150) {
            pageFindings.push(makeFinding('content-requires-js', { page: url, message: `Body text goes from ~${rawWords} to ~${model.wordCount} words only after JS runs — many AI crawlers will see the empty version.`, verifiedBy: 'rendered' }));
          }
        } else if (render && pool.available === false) {
          record.verifiedBy = 'raw-only (Playwright unavailable)';
        }
      }
      record.model = model;
      record.findings = pageFindings.map(x => ({ ...x, verifiedBy: record.verifiedBy === 'rendered' ? 'rendered' : x.verifiedBy }));

      // discover links
      if (model) for (const href of model.anchors) {
        try { enqueue(new URL(href, url).toString()); } catch { /* ignore */ }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  log(`crawled ${pages.length} pages, rendered ${renders}.`);

  for (const p of pages) findings.push(...p.findings);
  findings.push(...runCrossChecks(pages));

  await pool.close();

  // filters
  let final = findings.filter(f => !ignoreChecks.includes(f.check));
  if (checksFilter !== 'all') final = final.filter(f => f.category === checksFilter);

  site.playwright = pool.available !== false;
  site.rendersUsed = renders;

  return {
    tool: '@matt-antone/seo-audit v1.0.0',
    auditedAt: new Date().toISOString(),
    site,
    pagesCrawled: pages.length,
    pages: pages.map(({ model, ...rest }) => ({
      ...rest,
      title: model?.title ?? null,
      metaDescription: model?.metaDescription ?? null,
      wordCount: model?.wordCount ?? null,
      jsonldTypes: model ? [...new Set(model.jsonld.flatMap(x => x.type))] : [],
      findings: undefined,
    })),
    findings: final,
    _internalPages: pages, // kept for compare/report; stripped before JSON write
  };
}
