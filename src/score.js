// Directional 0–100 scores per category. Deductions are per check id (not per
// instance) with a small multiplier for widespread issues, so one systemic
// problem doesn't zero the score via 200 instances.
const WEIGHT = { critical: 18, high: 9, medium: 4, low: 1.5 };

export function score(findings, pagesCrawled = 1) {
  const byCat = { seo: 100, aeo: 100 };
  const grouped = new Map();
  for (const f of findings) {
    if (!grouped.has(f.check)) grouped.set(f.check, []);
    grouped.get(f.check).push(f);
  }
  for (const [, list] of grouped) {
    const f = list[0];
    const spread = Math.min(1.6, 1 + (list.length - 1) / Math.max(4, pagesCrawled)); // widespread → up to +60%
    byCat[f.category] -= WEIGHT[f.severity] * spread;
  }
  return {
    seo: Math.max(0, Math.round(byCat.seo)),
    aeo: Math.max(0, Math.round(byCat.aeo)),
  };
}

export function countBySeverity(findings) {
  const c = { critical: 0, high: 0, medium: 0, low: 0 };
  const seen = new Set();
  for (const f of findings) {
    const key = f.check + '|' + (f.page || '@site');
    if (seen.has(key)) continue;
    seen.add(key);
    c[f.severity]++;
  }
  return c;
}
