import { countBySeverity } from './score.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SEV_ORDER = ['critical', 'high', 'medium', 'low'];
const SEV_VAR = { critical: '--critical', high: '--serious', medium: '--warning', low: '--seq' };

const CSS = `
  :root { color-scheme: light;
    --page:#f9f9f7; --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
    --grid:#e1e0d9; --baseline:#c3c2b7; --border:rgba(11,11,11,.10);
    --good:#0ca30c; --warning:#fab219; --serious:#ec835a; --critical:#d03b3b; --goodtext:#006300; --seq:#2a78d6; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { color-scheme: dark;
    --page:#0d0d0d; --surface:#1a1a19; --ink:#fff; --ink2:#c3c2b7;
    --grid:#2c2c2a; --baseline:#383835; --border:rgba(255,255,255,.10); --goodtext:#0ca30c; --seq:#3987e5; } }
  @media print { :root { color-scheme: light !important; } body { font-size: 12px; } .finding { break-inside: avoid; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--page); color:var(--ink); font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif; }
  .wrap { max-width:880px; margin:0 auto; padding:40px 28px 80px; }
  header.r { border-bottom:1px solid var(--baseline); padding-bottom:18px; margin-bottom:26px; }
  header.r h1 { font-size:25px; margin:0 0 6px; letter-spacing:-.01em; }
  header.r .sub { color:var(--ink2); font-size:14px; }
  h2 { font-size:19px; margin:38px 0 12px; letter-spacing:-.01em; }
  .note { color:var(--ink2); font-size:13.5px; }
  code { background:var(--surface); border:1px solid var(--border); border-radius:4px; padding:1px 5px; font-size:13px; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin:18px 0 6px; }
  .tile { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:15px 18px; }
  .tile .l { font-size:12.5px; color:var(--ink2); text-transform:uppercase; letter-spacing:.04em; }
  .tile .v { font-size:33px; font-weight:650; line-height:1.15; margin-top:2px; }
  .tile .h { font-size:12.5px; color:var(--muted); margin-top:2px; }
  .sev { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:650; text-transform:uppercase;
    letter-spacing:.05em; border-radius:5px; padding:2px 8px; border:1px solid var(--border); background:var(--surface); }
  .sev i { width:9px; height:9px; border-radius:2px; display:inline-block; }
  .finding { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:13px 17px; margin:9px 0; }
  .finding .hd { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  .finding .hd strong { font-size:15px; }
  .finding p { font-size:14px; color:var(--ink2); margin:5px 0 0; }
  .finding .ev { font-family:ui-monospace,Menlo,monospace; font-size:12px; color:var(--muted); white-space:pre-wrap; margin-top:5px; }
  .vb { font-size:11.5px; color:var(--muted); }
  table { width:100%; border-collapse:collapse; background:var(--surface); border:1px solid var(--border); border-radius:10px; overflow:hidden; font-size:13.5px; margin:12px 0; }
  th { text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink2); font-weight:650; padding:9px 12px; border-bottom:1px solid var(--baseline); }
  td { padding:8px 12px; border-bottom:1px solid var(--grid); vertical-align:top; }
  tr:last-child td { border-bottom:none; }
  .ok { color:var(--goodtext); font-weight:650; } .bad { color:var(--critical); font-weight:650; }
  .mono { font-family:ui-monospace,Menlo,monospace; font-size:12.5px; }
  footer { margin-top:44px; padding-top:14px; border-top:1px solid var(--grid); color:var(--muted); font-size:12.5px; }
`;

function sevChip(sev) {
  return `<span class="sev"><i style="background:var(${SEV_VAR[sev]})"></i>${sev}</span>`;
}

function findingCard(f) {
  return `<div class="finding"><div class="hd">${sevChip(f.severity)}<strong>${esc(f.title)}</strong>` +
    `<span class="vb">${f.category.toUpperCase()} · verified: ${esc(f.verifiedBy)}</span></div>` +
    (f.page ? `<p class="mono">${esc(f.page)}</p>` : '') +
    `<p>${esc(f.message)}</p>` +
    (f.evidence ? `<div class="ev">${esc(f.evidence)}</div>` : '') + `</div>`;
}

function dedupe(findings) {
  const seen = new Set(); const out = [];
  for (const f of findings) {
    const k = f.check + '|' + (f.page || '@site');
    if (!seen.has(k)) { seen.add(k); out.push(f); }
  }
  return out;
}

export function renderHtml(result, { brand = 'Glyphix', compareData = null } = {}) {
  const findings = dedupe(result.findings);
  const counts = countBySeverity(findings);
  const bySev = Object.fromEntries(SEV_ORDER.map(s => [s, findings.filter(f => f.severity === s)]));
  const bots = result.site.aiBots || {};

  const botRows = Object.entries(bots).map(([agent, b]) =>
    `<tr><td class="mono">${esc(agent)}</td><td>${esc(b.vendor)}</td><td class="${b.access === 'blocked' ? 'bad' : 'ok'}">${esc(b.access)} <span class="note">(${esc(b.via)})</span></td></tr>`).join('');

  const pageRows = (result.pages || []).filter(p => p.status).slice(0, 60).map(p =>
    `<tr><td class="mono">${esc(p.path)}</td><td>${p.status}</td><td>${esc((p.title || '—').slice(0, 60))}</td>` +
    `<td>${p.metaDescription ? 'yes' : '<span class="bad">no</span>'}</td><td>${p.wordCount ?? '—'}</td>` +
    `<td class="note">${esc(p.verifiedBy)}</td></tr>`).join('');

  let compareSection = '';
  if (compareData) {
    const row = (f) => `<tr><td>${sevChip(f.severity)}</td><td>${esc(f.title)}</td><td class="mono">${esc(f._k.split('|')[1])}</td></tr>`;
    compareSection = `
    <h2>Comparison: ${esc(compareData.base.url)} → ${esc(compareData.compare.url)}</h2>
    <div class="tiles">
      <div class="tile"><div class="l">Fixed</div><div class="v" style="color:var(--goodtext)">${compareData.fixed.length}</div></div>
      <div class="tile"><div class="l">Unchanged</div><div class="v">${compareData.unchanged.length}</div></div>
      <div class="tile"><div class="l">New</div><div class="v" style="color:var(--critical)">${compareData.new.length}</div></div>
      <div class="tile"><div class="l">Scores</div><div class="v" style="font-size:20px">SEO ${compareData.base.scores.seo}→${compareData.compare.scores.seo}<br>AEO ${compareData.base.scores.aeo}→${compareData.compare.scores.aeo}</div></div>
    </div>
    ${compareData.fixed.length ? `<h2>Fixed</h2><table><tr><th>Severity</th><th>Finding</th><th>Path</th></tr>${compareData.fixed.map(row).join('')}</table>` : ''}
    ${compareData.new.length ? `<h2>New issues</h2><table><tr><th>Severity</th><th>Finding</th><th>Path</th></tr>${compareData.new.map(row).join('')}</table>` : ''}
    ${compareData.unchanged.length ? `<h2>Still open</h2><table><tr><th>Severity</th><th>Finding</th><th>Path</th></tr>${compareData.unchanged.map(row).join('')}</table>` : ''}`;
  }

  const sections = SEV_ORDER.filter(s => bySev[s].length).map(s =>
    `<h2 style="text-transform:capitalize">${s} (${bySev[s].length})</h2>` + bySev[s].map(findingCard).join('')).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEO &amp; AI-Readiness Audit — ${esc(result.site.host)}</title><style>${CSS}</style></head>
<body><div class="wrap">
<header class="r">
  <h1>SEO &amp; AI-Readiness Audit</h1>
  <div class="sub"><strong>${esc(result.site.base)}</strong> · ${new Date(result.auditedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · prepared by ${esc(brand)}<br>
  ${result.pagesCrawled} pages crawled · ${result.site.rendersUsed} verified in a rendered browser DOM${result.site.playwright ? '' : ' · <strong>Playwright unavailable — findings are raw-HTML only and may include false positives on JS-rendered sites</strong>'}</div>
</header>
<div class="tiles">
  <div class="tile"><div class="l">Traditional SEO</div><div class="v">${result.scores.seo}<span style="font-size:17px;color:var(--muted)">/100</span></div></div>
  <div class="tile"><div class="l">AI readiness</div><div class="v">${result.scores.aeo}<span style="font-size:17px;color:var(--muted)">/100</span></div></div>
  <div class="tile"><div class="l">Pages crawled</div><div class="v">${result.pagesCrawled}</div><div class="h">${result.site.sitemapUrlCount} in sitemap</div></div>
  <div class="tile"><div class="l">Issues</div><div class="v">${counts.critical + counts.high + counts.medium + counts.low}</div>
    <div class="h">${counts.critical} critical · ${counts.high} high · ${counts.medium} medium · ${counts.low} low</div></div>
</div>
${compareSection}
${sections || '<p class="ok" style="font-size:17px">No issues found. Clean bill of health.</p>'}
<h2>AI crawler access</h2>
<table><tr><th>Crawler</th><th>Used by</th><th>Access</th></tr>${botRows}</table>
<h2>Pages</h2>
<table><tr><th>Path</th><th>Status</th><th>Title</th><th>Meta desc</th><th>Words</th><th>Verified by</th></tr>${pageRows}</table>
<footer>Generated by seo-audit v1.0.0 · findings marked "rendered" were confirmed against a JavaScript-rendered DOM; "raw" findings come from server HTML; "http" from status probes. Scores are directional.</footer>
</div></body></html>`;
}
