import { serve } from './server.js';
import { SITE_A, SITE_B } from './fixtures.js';
import { audit } from '../src/crawler.js';
import { score } from '../src/score.js';
import { compare } from '../src/compare.js';
import { renderHtml } from '../src/report-html.js';
import { BrowserPool } from '../src/browser.js';
import { writeFile } from 'node:fs/promises';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } };
const has = (r, check, pathIncl) => r.findings.some(f => f.check === check && (!pathIncl || (f.page || '').includes(pathIncl)));
const not = (r, check, pathIncl) => !has(r, check, pathIncl);

const A_PORT = 8931, B_PORT = 8932;
const a = await serve(SITE_A, A_PORT);
const b = await serve(SITE_B, B_PORT);

console.log('\n— auditing fixture site A (broken) —');
const rA = await audit(`http://localhost:${A_PORT}/`, { maxPages: 20, log: () => {} });
rA.scores = score(rA.findings, rA.pagesCrawled);

console.log('site-level checks:');
ok(has(rA, 'ai-bot-blocked'), 'detects GPTBot blocked in robots.txt');
ok(rA.findings.filter(f => f.check === 'ai-bot-blocked').length === 1, 'only GPTBot flagged, not other AI bots');
ok(has(rA, 'llms-txt-missing'), 'detects missing llms.txt');
ok(has(rA, 'soft-404'), 'detects soft 404 (unknown URL → 200)');
ok(not(rA, 'sitemap-missing') && not(rA, 'sitemap-invalid'), 'valid sitemap accepted');
ok(not(rA, 'robots-missing'), 'robots.txt accepted');

console.log('page-level checks:');
ok(has(rA, 'title-duplicate-brand', '/'), 'detects doubled title on homepage');
ok(has(rA, 'h1-multiple', A_PORT + '/'), 'detects multiple H1s on homepage');
ok(has(rA, 'img-alt-missing'), 'detects images without alt');
ok(has(rA, 'meta-description-short', '/services'), 'detects short/typo meta description on /services');
ok(has(rA, 'thin-content', '/services'), 'detects thin content on /services');
ok(has(rA, 'heading-skip', '/services'), 'detects heading level skip (h1→h4)');
ok(has(rA, 'article-no-author', '/blog/post1'), 'detects BlogPosting without author');
ok(has(rA, 'article-no-date', '/blog/post1'), 'detects BlogPosting without date');
ok(has(rA, 'article-no-visible-byline', '/blog/post1'), 'detects missing visible byline');
ok(has(rA, 'canonical-missing', A_PORT + '/'), 'detects missing canonical on homepage');
ok(not(rA, 'canonical-missing', '/about'), 'no canonical false positive on /about');
ok(not(rA, 'meta-description-missing', '/about'), 'no meta-desc false positive on /about');
ok(not(rA, 'jsonld-missing', '/about'), 'JSON-LD detected on /about (no false positive)');
ok(has(rA, 'noindex', '/missing-page'), 'soft-404 target page surfaces its noindex meta');

console.log('hybrid rendering:');
const spaPage = rA._internalPages.find(p => p.path === '/spa');
ok(spaPage?.verifiedBy === 'rendered', 'SPA page escalated to rendered verification');
ok(has(rA, 'content-requires-js', '/spa'), 'detects JS-only content on SPA page');
ok(not(rA, 'title-missing', '/spa') && not(rA, 'meta-description-missing', '/spa'), 'no false positives on SPA page after render (title/meta injected by JS)');
ok(not(rA, 'h1-missing', '/spa'), 'no h1-missing false positive on SPA page after render');

console.log('cross-page checks:');
ok(not(rA, 'no-organization-schema'), 'Organization schema found site-wide (no false positive)');
ok(has(rA, 'no-faq-schema'), 'notes absence of FAQ schema');

console.log('\n— auditing fixture site B (fixed) —');
const rB = await audit(`http://localhost:${B_PORT}/`, { maxPages: 20, log: () => {} });
rB.scores = score(rB.findings, rB.pagesCrawled);
ok(not(rB, 'ai-bot-blocked'), 'no AI bots blocked on B');
ok(not(rB, 'llms-txt-missing'), 'llms.txt accepted on B');
ok(not(rB, 'soft-404'), 'hard 404s accepted on B');
ok(not(rB, 'title-duplicate-brand'), 'fixed title accepted');
ok(not(rB, 'article-no-author') && not(rB, 'article-no-date'), 'author/date schema accepted');
ok(not(rB, 'no-faq-schema'), 'FAQPage schema found on B');
ok(rB.scores.seo > rA.scores.seo, `SEO score improves (A ${rA.scores.seo} → B ${rB.scores.seo})`);
ok(rB.scores.aeo > rA.scores.aeo, `AEO score improves (A ${rA.scores.aeo} → B ${rB.scores.aeo})`);

console.log('\n— compare mode —');
const diff = compare(rA, rB);
ok(diff.fixed.some(f => f.check === 'llms-txt-missing'), 'compare: llms-txt-missing classified as fixed');
ok(diff.fixed.some(f => f.check === 'title-duplicate-brand'), 'compare: doubled title classified as fixed');
ok(diff.unchanged.length >= 0 && Array.isArray(diff.new), 'compare: structure sane');
ok(!diff.new.some(f => f.check === 'soft-404'), 'compare: no phantom new findings for fixed items');

console.log('\n— reports —');
const html = renderHtml(rA, { brand: 'Glyphix', compareData: null });
ok(html.includes('AI-Readiness Audit') && html.includes('GPTBot'), 'HTML report renders with AI bot table');
const htmlCmp = renderHtml(rB, { brand: 'Glyphix', compareData: diff });
ok(htmlCmp.includes('Comparison:') && htmlCmp.includes('Fixed'), 'HTML compare section renders');
await writeFile('test/out-report.html', html);
await writeFile('test/out-compare.html', htmlCmp);

let pdfOk = false;
try {
  const pool = new BrowserPool({});
  await pool.pdf(html, 'test/out-report.pdf');
  await pool.close();
  const { statSync } = await import('node:fs');
  pdfOk = statSync('test/out-report.pdf').size > 10000;
} catch (e) { console.log('  (pdf error: ' + e.message + ')'); }
ok(pdfOk, 'PDF export produces a real PDF');

a.close(); b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
