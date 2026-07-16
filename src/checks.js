// Check registry. Every finding references one of these ids.
// category: 'seo' (traditional) | 'aeo' (AI readiness). severity: critical|high|medium|low.

export const CHECKS = {
  // ---- site-level ----
  'robots-missing':            { severity: 'medium',  category: 'seo', title: 'robots.txt missing or unreadable' },
  'robots-blocks-all':         { severity: 'critical',category: 'seo', title: 'robots.txt blocks all crawlers from the whole site' },
  'ai-bot-blocked':            { severity: 'high',    category: 'aeo', title: 'AI crawler blocked in robots.txt' },
  'sitemap-missing':           { severity: 'medium',  category: 'seo', title: 'No usable XML sitemap found' },
  'sitemap-invalid':           { severity: 'medium',  category: 'seo', title: 'Sitemap exists but is not valid XML' },
  'llms-txt-missing':          { severity: 'high',    category: 'aeo', title: 'No llms.txt' },
  'soft-404':                  { severity: 'medium',  category: 'seo', title: 'Unknown URLs return HTTP 200 (soft 404)' },
  'http-no-redirect':          { severity: 'high',    category: 'seo', title: 'HTTP does not redirect to HTTPS' },

  // ---- page-level ----
  'title-missing':             { severity: 'high',    category: 'seo', title: 'Missing <title>' },
  'title-duplicate-brand':     { severity: 'high',    category: 'seo', title: 'Title repeats the same text twice' },
  'title-too-long':            { severity: 'low',     category: 'seo', title: 'Title longer than 60 characters' },
  'title-too-short':           { severity: 'medium',  category: 'seo', title: 'Title shorter than 10 characters' },
  'meta-description-missing':  { severity: 'high',    category: 'seo', title: 'Missing meta description' },
  'meta-description-short':    { severity: 'low',     category: 'seo', title: 'Meta description under 50 characters' },
  'meta-description-long':     { severity: 'low',     category: 'seo', title: 'Meta description over 165 characters' },
  'h1-missing':                { severity: 'medium',  category: 'seo', title: 'No H1 heading' },
  'h1-multiple':               { severity: 'medium',  category: 'seo', title: 'More than one H1' },
  'heading-skip':              { severity: 'low',     category: 'seo', title: 'Heading levels skipped' },
  'canonical-missing':         { severity: 'medium',  category: 'seo', title: 'Missing canonical tag' },
  'img-alt-missing':           { severity: 'medium',  category: 'seo', title: 'Images without alt text' },
  'noindex':                   { severity: 'high',    category: 'seo', title: 'Page is set to noindex' },
  'og-missing':                { severity: 'low',     category: 'seo', title: 'Missing Open Graph tags' },
  'twitter-card-missing':      { severity: 'low',     category: 'seo', title: 'Missing Twitter card tags' },
  'lang-missing':              { severity: 'low',     category: 'seo', title: 'Missing lang attribute on <html>' },
  'viewport-missing':          { severity: 'medium',  category: 'seo', title: 'Missing viewport meta (mobile)' },
  'mixed-content':             { severity: 'medium',  category: 'seo', title: 'HTTP resources on an HTTPS page' },
  'thin-content':              { severity: 'medium',  category: 'seo', title: 'Thin content (under 150 words)' },
  'redirect-in-crawl':         { severity: 'low',     category: 'seo', title: 'Internal link resolves through a redirect' },
  'broken-internal':           { severity: 'high',    category: 'seo', title: 'Broken internal link (4xx/5xx)' },
  'jsonld-invalid':            { severity: 'medium',  category: 'aeo', title: 'JSON-LD present but unparseable' },
  'jsonld-missing':            { severity: 'medium',  category: 'aeo', title: 'No structured data on page' },
  'article-no-author':         { severity: 'high',    category: 'aeo', title: 'Article/BlogPosting without an author' },
  'article-no-date':           { severity: 'high',    category: 'aeo', title: 'Article/BlogPosting without a publish date' },
  'article-no-visible-byline': { severity: 'medium',  category: 'aeo', title: 'No visible author or date on article page' },
  'content-requires-js':       { severity: 'high',    category: 'aeo', title: 'Main content only exists after JavaScript runs' },

  // ---- cross-page / site-wide ----
  'duplicate-titles':          { severity: 'medium',  category: 'seo', title: 'Duplicate titles across pages' },
  'duplicate-descriptions':    { severity: 'low',     category: 'seo', title: 'Duplicate meta descriptions across pages' },
  'shared-og-image':           { severity: 'low',     category: 'seo', title: 'Most pages share one og:image' },
  'no-organization-schema':    { severity: 'high',    category: 'aeo', title: 'No Organization schema anywhere' },
  'no-faq-schema':             { severity: 'low',     category: 'aeo', title: 'No FAQ content/schema anywhere' },
};

const SEVERITY_WEIGHT = { critical: 18, high: 9, medium: 4, low: 1.5 };

export function makeFinding(check, { page = null, message, evidence = null, verifiedBy = 'raw' }) {
  const def = CHECKS[check];
  if (!def) throw new Error(`unknown check id: ${check}`);
  return { check, severity: def.severity, category: def.category, title: def.title, page, message, evidence, verifiedBy };
}

// ---------------- page-level checks ----------------
// model: extraction result; ctx: { url, status, redirected, redirectChain }
export function runPageChecks(model, ctx) {
  const f = [];
  const add = (check, message, evidence) => f.push(makeFinding(check, { page: ctx.url, message, evidence }));

  // title
  if (!model.title || !model.title.trim()) add('title-missing', 'Page has no <title> tag.');
  else {
    const t = model.title.trim();
    if (t.length > 60) add('title-too-long', `Title is ${t.length} chars.`, t);
    if (t.length < 10) add('title-too-short', `Title is only ${t.length} chars.`, t);
    const parts = t.split(/\s*[|\-–—:]\s*/).map(s => s.trim().toLowerCase()).filter(Boolean);
    if (parts.length >= 2 && new Set(parts).size < parts.length) {
      add('title-duplicate-brand', 'The same text appears twice in the title.', t);
    }
  }

  // meta description
  const md = model.metaDescription?.trim();
  if (!md) add('meta-description-missing', 'No meta description; search engines will improvise a snippet.');
  else {
    if (md.length < 50) add('meta-description-short', `Only ${md.length} chars.`, md);
    if (md.length > 165) add('meta-description-long', `${md.length} chars; will be truncated.`, md.slice(0, 120) + '…');
  }

  // headings
  const h1s = model.headings.filter(h => h.level === 1);
  if (h1s.length === 0) add('h1-missing', 'No H1 on the page.');
  if (h1s.length > 1) add('h1-multiple', `${h1s.length} H1s found.`, h1s.map(h => h.text).join(' | ').slice(0, 160));
  const skips = [];
  for (let i = 1; i < model.headings.length; i++) {
    const prev = model.headings[i - 1].level, cur = model.headings[i].level;
    if (cur > prev + 1) skips.push(`h${prev}→h${cur}`);
  }
  if (skips.length) add('heading-skip', `Heading levels skipped: ${[...new Set(skips)].join(', ')}.`);

  // canonical / indexability
  if (!model.canonical) add('canonical-missing', 'No rel=canonical link.');
  if (model.metaRobots && /noindex/i.test(model.metaRobots)) add('noindex', `meta robots is "${model.metaRobots}".`);

  // images
  if (model.imgsMissingAlt > 0) add('img-alt-missing', `${model.imgsMissingAlt} of ${model.imgTotal} images have no alt text.`);

  // social
  if (!model.og.title && !model.og.image) add('og-missing', 'No og:title / og:image.');
  else if (!model.twitterCard) add('twitter-card-missing', 'No twitter:* meta tags.');

  // document
  if (!model.lang) add('lang-missing', '<html> has no lang attribute.');
  if (!model.viewport) add('viewport-missing', 'No viewport meta tag.');
  if (model.mixedContent > 0 && ctx.url.startsWith('https:')) add('mixed-content', `${model.mixedContent} http:// resources on an https page.`);

  // content
  if (model.wordCount < 150) add('thin-content', `~${model.wordCount} words of body text.`);

  // structured data
  if (model.jsonldErrors > 0) add('jsonld-invalid', `${model.jsonldErrors} JSON-LD block(s) failed to parse.`);
  if (model.jsonld.length === 0) add('jsonld-missing', 'No JSON-LD structured data.');

  // article-specific
  const articles = model.jsonld.filter(x => x.type.some(t => /Article|BlogPosting|NewsArticle/i.test(t)));
  if (articles.length) {
    if (!articles.some(a => a.author)) add('article-no-author', 'BlogPosting/Article schema has no author.');
    if (!articles.some(a => a.datePublished)) add('article-no-date', 'BlogPosting/Article schema has no datePublished.');
    if (!model.visibleAuthor && !model.visibleDate && model.timeEls === 0) {
      add('article-no-visible-byline', 'No visible byline or date in the article body.');
    }
  }

  if (ctx.redirected) add('redirect-in-crawl', `Reached via redirect: ${ctx.redirectChain?.join(' → ') || ctx.url}.`);

  return f;
}

// Which findings can a JS render plausibly change? (absence-type findings —
// frameworks inject meta/schema/content client-side.)
const RENDER_SENSITIVE = new Set([
  'title-missing', 'meta-description-missing', 'h1-missing', 'canonical-missing',
  'jsonld-missing', 'article-no-author', 'article-no-date', 'article-no-visible-byline',
  'og-missing', 'twitter-card-missing', 'thin-content', 'img-alt-missing',
  'lang-missing', 'viewport-missing', 'h1-multiple', 'heading-skip', 'jsonld-invalid',
  'title-duplicate-brand', 'noindex',
]);

export function needsRender(rawFindings, model, rawHtml) {
  const spaMarkers = /id=["'](root|app|__next|___gatsby)["']|window\.__NUXT__|data-reactroot|ng-version=|<div id=["']q-app["']/i.test(rawHtml || '');
  const emptyish = model.wordCount < 30 || model.headings.length === 0;
  const sensitive = rawFindings.some(x => RENDER_SENSITIVE.has(x.check));
  return spaMarkers || emptyish || sensitive;
}

// ---------------- cross-page checks ----------------
export function runCrossChecks(pages /* [{url, model}] */) {
  const f = [];
  const byTitle = new Map(), byDesc = new Map(), byOg = new Map();
  let anyOrg = false, anyFaq = false;

  for (const p of pages) {
    const m = p.model;
    if (!m) continue;
    if (m.title) push(byTitle, m.title.trim(), p.url);
    if (m.metaDescription) push(byDesc, m.metaDescription.trim(), p.url);
    if (m.og?.image) push(byOg, m.og.image, p.url);
    if (m.jsonld.some(x => x.type.some(t => /Organization|LocalBusiness|InsuranceAgency/i.test(t)))) anyOrg = true;
    if (m.jsonld.some(x => x.type.some(t => /FAQPage/i.test(t)))) anyFaq = true;
  }

  for (const [t, urls] of byTitle) if (urls.length > 1) {
    f.push(makeFinding('duplicate-titles', { message: `"${t.slice(0, 70)}" used on ${urls.length} pages.`, evidence: urls.slice(0, 6).join('\n') }));
  }
  for (const [t, urls] of byDesc) if (urls.length > 1) {
    f.push(makeFinding('duplicate-descriptions', { message: `Same description on ${urls.length} pages.`, evidence: urls.slice(0, 6).join('\n') }));
  }
  const htmlPages = pages.filter(p => p.model).length;
  for (const [img, urls] of byOg) {
    if (htmlPages >= 4 && urls.length / htmlPages > 0.5) {
      f.push(makeFinding('shared-og-image', { message: `${urls.length} of ${htmlPages} pages share og:image ${img.slice(0, 80)}.` }));
    }
  }
  if (htmlPages > 0 && !anyOrg) f.push(makeFinding('no-organization-schema', { message: 'No Organization/LocalBusiness schema found on any crawled page.' }));
  if (htmlPages >= 4 && !anyFaq) f.push(makeFinding('no-faq-schema', { message: 'No FAQPage schema found on any crawled page.' }));
  return f;
}

function push(map, key, val) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(val);
}
