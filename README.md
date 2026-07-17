# @matt-antone/seo-audit

Technical SEO + AI-readiness (AEO) auditor. Crawls a site, runs ~40 checks, and produces
JSON results and a client-ready PDF/HTML report. Runs locally — Node only, **no Docker**.

## The core idea: rendered-DOM verification

Most audit crawlers read raw server HTML and report false positives on JavaScript-rendered
sites ("missing meta description" that's actually injected client-side). This tool does a
fast raw-HTML pass on every page, then **escalates suspicious or failing pages to a real
headless-Chromium render and re-runs the checks against the rendered DOM**. Every finding
is tagged with how it was verified (`raw`, `rendered`, or `http`). A finding of "missing X"
on a JS-heavy page is only reported after the rendered DOM confirms it.

## Install

```bash
npm install            # inside this folder
npx playwright install chromium   # one-time browser download (~120 MB)
npm link               # optional: makes `seo-audit` available globally
```

Without the Chromium install the tool still runs (`--no-render` behavior), but findings are
raw-HTML only and the report is watermarked accordingly. PDF export requires Chromium.

## Usage

```bash
seo-audit https://www.example.com
seo-audit example.com --pdf audit.pdf --max-pages 50
seo-audit https://prod.com --compare https://staging.dev --pdf diff.pdf
seo-audit example.com --checks aeo            # AI-readiness findings only
seo-audit example.com --config clients/example.json
```

Run `seo-audit --help` for all flags.

## Outputs

- **JSON** (always): every finding with check id, severity, category (`seo`/`aeo`), page,
  evidence, and verification method — plus per-page crawl data and 0–100 scores.
- **HTML** (`--html`): self-contained client report (light/dark, print-friendly).
- **PDF** (`--pdf`): the same report printed via Chromium.

## Hosted API (Vercel)

The same engine is exposed as a JSON endpoint so a branded front-end can run audits and
lay out the results itself. It's a **separate tool** from the CLI — the CLI is unchanged.

```
GET  /api/audit?url=example.com[&maxPages=20&checks=aeo]
POST /api/audit          { "url": "example.com", "maxPages": 20 }
```

Response: `{ ok: true, maxPages: 30, result: { …same shape as the CLI JSON… } }`.
CORS is open (`*`) so the front-end can fetch it directly. Errors return
`{ ok: false, error }` with a 400 (bad input) or 500.

Differences from the CLI, by design for a public endpoint:

- **Hard cap of 30 pages** per request — `maxPages` is clamped to `[1, 30]`, no `--full`.
- **No JS rendering.** Parsing uses `linkedom` (pure JS, no Chromium), so it deploys to
  serverless with no browser binary and stays inside the function time budget. Findings are
  raw-HTML only — equivalent to the CLI's `--no-render` mode; `content-requires-js`
  SPA detection is CLI-only.

Deploy:

```bash
vercel            # preview
vercel --prod     # production
```

`vercel.json` sets the function's `maxDuration` to 300s. No env vars required.
Live example: `https://seo-audit-tool-murex.vercel.app/api/audit?url=example.com`

### Use it from a Next.js app

Two ways, depending on whether you want a second deploy.

**A. Just call the hosted endpoint** (zero extra work — it already runs). CORS is open,
so fetch it from a server component, route handler, or the client:

```js
const { result } = await fetch(
  `https://seo-audit-tool-murex.vercel.app/api/audit?url=${encodeURIComponent(site)}`,
  { cache: 'no-store' }
).then(r => r.json());
```

**B. Embed the engine — one deploy, no separate service.** The engine is plain ESM +
`linkedom` and the API path never loads Playwright (it's a lazy `import()` only reached by
the CLI's real browser pool), so it drops into an App Router route handler:

```bash
npm i github:matt-antone/seo-audit-tool
```

```js
// app/api/audit/route.js
import { runApiAudit, MAX_PAGES } from '@matt-antone/seo-audit/src/audit-api.js';

export const runtime = 'nodejs';   // linkedom + Buffer need Node, not edge
export const maxDuration = 300;    // 30-page crawls can run long

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  try {
    const result = await runApiAudit({
      url: searchParams.get('url'),
      maxPages: searchParams.get('maxPages'),
      checksFilter: searchParams.get('checks'),
    });
    return Response.json({ ok: true, maxPages: MAX_PAGES, result });
  } catch (err) {
    const bad = /missing required|invalid url/.test(err.message);
    return Response.json({ ok: false, error: err.message }, { status: bad ? 400 : 500 });
  }
}
```

Same JSON shape, same-origin (no CORS), one Vercel deploy. `playwright` still installs as a
dependency but never runs in this path.

## Compare mode

`--compare <url>` audits both URLs and classifies every finding as **fixed / unchanged /
new**, matching findings by check id + path. Works for any pair: staging vs production,
pre/post-migration, before/after an optimization pass. Use `pathMap` in a config file when
paths differ between the two sites.

## Per-client config

```json
{
  "maxPages": 50,
  "ignoreChecks": ["no-faq-schema"],
  "pathMap": { "/contact": "/contact-us" },
  "brand": "Company Name"
}
```

`ignoreChecks` is for known, accepted exceptions (e.g. a client that deliberately has no
contact page) so they stop appearing in re-audits.

## What it checks (~40 checks)

**Site-level:** robots.txt presence/sanity, per-AI-crawler access (GPTBot, ClaudeBot,
PerplexityBot, Google-Extended, CCBot, and 7 more), sitemap validity (index + gzip aware),
llms.txt, soft-404 behavior, HTTP→HTTPS.

**Page-level (SEO):** title missing/doubled/length, meta description missing/length,
H1 count, heading order, canonical, noindex, image alt text, Open Graph/Twitter cards,
lang/viewport, mixed content, thin content, redirects, broken internal links.

**Page-level (AEO):** JSON-LD presence/validity, Article/BlogPosting author + date (schema
AND visible byline), content that only exists after JavaScript runs.

**Cross-page:** duplicate titles/descriptions, one og:image shared site-wide,
no Organization schema anywhere, no FAQ schema anywhere.

Noindexed pages report only their noindex status — no snippet nagging on pages that
aren't meant to be indexed.

## Scoring

Two directional 0–100 scores (SEO, AI-readiness). Deductions are per check type — weighted
by severity, scaled up slightly when an issue is widespread — so one systemic problem
doesn't zero the score through sheer instance count.

## Tests

```bash
npm test   # spins up two local fixture sites (broken + fixed), 41 assertions,
           # including SPA escalation, compare mode, and PDF generation
```

## Notes & limits (v1)

- Respects robots.txt for its own crawl (wildcard group).
- Default crawl budget: 30 pages, 30 renders, 4 concurrent fetches — tune per site.
- Not covered yet: page-speed lab metrics, backlink data, hreflang validation, image
  weight, per-page Lighthouse. By design: no keyword tracking, ever.
