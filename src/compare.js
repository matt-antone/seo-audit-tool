// Any-URL vs any-URL comparison. Findings are matched by (check id + path),
// with optional pathMap to translate base paths → compare paths.
export function compare(baseResult, compareResult, { pathMap = {} } = {}) {
  const key = (f, mapPath) => {
    let path = '@site';
    if (f.page) {
      try { path = new URL(f.page).pathname; } catch { path = f.page; }
      if (mapPath && pathMap[path]) path = pathMap[path];
    }
    return `${f.check}|${path}`;
  };

  const baseKeys = new Map(baseResult.findings.map(f => [key(f, true), f]));
  const compKeys = new Map(compareResult.findings.map(f => [key(f, false), f]));

  const fixed = [], unchanged = [], added = [];
  for (const [k, f] of baseKeys) {
    if (compKeys.has(k)) unchanged.push({ ...f, _k: k });
    else fixed.push({ ...f, _k: k });
  }
  for (const [k, f] of compKeys) {
    if (!baseKeys.has(k)) added.push({ ...f, _k: k });
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  const bySev = (a, b) => order[a.severity] - order[b.severity];
  fixed.sort(bySev); unchanged.sort(bySev); added.sort(bySev);

  return {
    base: { url: baseResult.site.base, scores: baseResult.scores, findings: baseResult.findings.length },
    compare: { url: compareResult.site.base, scores: compareResult.scores, findings: compareResult.findings.length },
    fixed, unchanged, new: added,
  };
}
