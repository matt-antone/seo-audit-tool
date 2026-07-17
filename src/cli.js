import { writeFile, readFile } from 'node:fs/promises';
import { audit } from './crawler.js';
import { score } from './score.js';
import { compare } from './compare.js';
import { renderHtml } from './report-html.js';
import { BrowserPool } from './browser.js';

const HELP = `
seo-audit — technical SEO + AI-readiness auditor

Usage:
  seo-audit <url> [options]
  seo-audit <url> --compare <otherUrl> [options]

Options:
  --compare <url>       Audit both URLs and diff findings (any URL vs any URL)
  --json <file>         Write JSON results (default: seo-audit-<host>.json)
  --html <file>         Write HTML report
  --pdf [file]          Write PDF report (default: seo-audit-<host>.pdf; requires Chromium via Playwright)
  --max-pages <n>       Pages to crawl per site (default 30)
  --full                Crawl all discoverable pages (no page limit)
  --max-renders <n>     Max pages verified in a rendered browser (default 30)
  --concurrency <n>     Parallel fetches (default 4)
  --checks <seo|aeo|all>  Restrict finding categories (default all)
  --no-render           Skip browser rendering entirely (fast, may false-positive on SPAs)
  --render-all          Render every page, not just suspicious/failing ones (lifts --max-renders cap)
  --config <file>       JSON config: { maxPages, ignoreChecks:[], pathMap:{}, brand }
  --quiet               No progress output
  -h, --help            Show this help
`;

function parseArgs(argv) {
  const opts = { urls: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--compare': opts.compare = next(); break;
      case '--json': opts.json = next(); break;
      case '--html': opts.html = next(); break;
      case '--pdf': opts.pdf = (argv[i + 1] && !argv[i + 1].startsWith('-')) ? next() : true; break;
      case '--max-pages': opts.maxPages = +next(); break;
      case '--full': opts.full = true; break;
      case '--max-renders': opts.maxRenders = +next(); break;
      case '--concurrency': opts.concurrency = +next(); break;
      case '--checks': opts.checksFilter = next(); break;
      case '--no-render': opts.render = false; break;
      case '--render-all': opts.renderAll = true; break;
      case '--config': opts.config = next(); break;
      case '--quiet': opts.quiet = true; break;
      default:
        if (a.startsWith('-')) throw new Error(`unknown option ${a} (see --help)`);
        opts.urls.push(a);
    }
  }
  return opts;
}

const normalizeUrl = (u) => /^https?:\/\//i.test(u) ? u : 'https://' + u;

export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || opts.urls.length === 0) { console.log(HELP); return; }

  let config = {};
  if (opts.config) config = JSON.parse(await readFile(opts.config, 'utf8'));

  const auditOpts = {
    maxPages: opts.full ? Infinity : (opts.maxPages ?? config.maxPages ?? 30),
    maxRenders: opts.maxRenders ?? config.maxRenders ?? (opts.renderAll ? Infinity : 30),
    concurrency: opts.concurrency ?? config.concurrency ?? 4,
    render: opts.render ?? true,
    renderAll: opts.renderAll ?? false,
    checksFilter: opts.checksFilter ?? 'all',
    ignoreChecks: config.ignoreChecks ?? [],
    log: opts.quiet ? () => {} : (m) => console.error('  ' + m),
  };

  const baseUrl = normalizeUrl(opts.urls[0]);
  console.error(`auditing ${baseUrl} …`);
  const result = await audit(baseUrl, auditOpts);
  result.scores = score(result.findings, result.pagesCrawled);
  delete result._internalPages;

  let compareData = null;
  let compareResult = null;
  if (opts.compare) {
    const cUrl = normalizeUrl(opts.compare);
    console.error(`auditing ${cUrl} (compare target) …`);
    compareResult = await audit(cUrl, auditOpts);
    compareResult.scores = score(compareResult.findings, compareResult.pagesCrawled);
    delete compareResult._internalPages;
    compareData = compare(result, compareResult, { pathMap: config.pathMap ?? {} });
  }

  // outputs
  const host = new URL(baseUrl).host.replace(/[^a-z0-9.-]/gi, '_');
  const jsonPath = opts.json ?? `seo-audit-${host}.json`;
  const output = compareData ? { ...result, compare: { target: compareResult, diff: compareData } } : result;
  await writeFile(jsonPath, JSON.stringify(output, null, 2));
  console.error(`wrote ${jsonPath}`);

  let html = null;
  if (opts.html || opts.pdf) {
    html = renderHtml(compareData ? compareResult : result, { brand: config.brand ?? '', compareData });
  }
  if (opts.html) { await writeFile(opts.html, html); console.error(`wrote ${opts.html}`); }
  if (opts.pdf) {
    const pdfPath = opts.pdf === true ? `seo-audit-${host}.pdf` : opts.pdf;
    const pool = new BrowserPool({});
    try { await pool.pdf(html, pdfPath); console.error(`wrote ${pdfPath}`); }
    finally { await pool.close(); }
  }

  // console summary
  const c = result.scores;
  console.log(`\n${result.site.base}  —  SEO ${c.seo}/100 · AI-readiness ${c.aeo}/100 · ${result.findings.length} findings across ${result.pagesCrawled} pages`);
  if (compareData) {
    console.log(`vs ${compareData.compare.url}  —  SEO ${compareData.compare.scores.seo}/100 · AEO ${compareData.compare.scores.aeo}/100`);
    console.log(`fixed ${compareData.fixed.length} · unchanged ${compareData.unchanged.length} · new ${compareData.new.length}`);
  }
  const top = [...result.findings].sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 }[a.severity] - { critical: 0, high: 1, medium: 2, low: 3 }[b.severity])).slice(0, 8);
  for (const f of top) console.log(`  [${f.severity}] ${f.title}${f.page ? ' — ' + new URL(f.page).pathname : ''}`);
}
