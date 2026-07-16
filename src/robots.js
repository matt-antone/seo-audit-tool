// Correct-enough robots.txt parser: groups of user-agents followed by rules.
export const AI_BOTS = [
  { agent: 'GPTBot', vendor: 'OpenAI (training + search index)' },
  { agent: 'OAI-SearchBot', vendor: 'OpenAI (ChatGPT search)' },
  { agent: 'ChatGPT-User', vendor: 'OpenAI (live browsing)' },
  { agent: 'ClaudeBot', vendor: 'Anthropic (Claude)' },
  { agent: 'anthropic-ai', vendor: 'Anthropic (legacy)' },
  { agent: 'PerplexityBot', vendor: 'Perplexity (index)' },
  { agent: 'Perplexity-User', vendor: 'Perplexity (live browsing)' },
  { agent: 'Google-Extended', vendor: 'Google (Gemini grounding)' },
  { agent: 'CCBot', vendor: 'Common Crawl (many AI datasets)' },
  { agent: 'Applebot-Extended', vendor: 'Apple Intelligence' },
  { agent: 'Bytespider', vendor: 'ByteDance' },
  { agent: 'meta-externalagent', vendor: 'Meta AI' },
];

export function parseRobots(text) {
  const groups = []; // { agents: [], rules: [{type, path}] }
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (let line of (text || '').split(/\r?\n/)) {
    line = line.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'sitemap') { sitemaps.push(val); continue; }
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ type: key, path: val });
    }
  }
  return { groups, sitemaps };
}

function groupFor(parsed, agent) {
  const a = agent.toLowerCase();
  let exact = null, star = null;
  for (const g of parsed.groups) {
    if (g.agents.some(x => x === a || (x !== '*' && a.includes(x)))) exact = exact || g;
    if (g.agents.includes('*')) star = star || g;
  }
  return exact || star || null;
}

// Longest-match wins, allow beats disallow on ties (Google semantics, simplified).
export function isAllowed(parsed, agent, path = '/') {
  const g = groupFor(parsed, agent);
  if (!g) return true;
  let best = null;
  for (const r of g.rules) {
    if (!r.path) { if (r.type === 'disallow') continue; }
    const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp('^' + pattern);
    if (re.test(path)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) best = r;
    }
  }
  if (!best) return true;
  return best.type === 'allow';
}

export function botAccess(parsed, agent) {
  const g = groupFor(parsed, agent);
  const rootAllowed = isAllowed(parsed, agent, '/');
  if (!g) return { access: 'allowed', via: 'no rule' };
  const viaStar = !g.agents.some(x => x !== '*');
  if (!rootAllowed) return { access: 'blocked', via: viaStar ? 'wildcard (*) group' : 'explicit rule' };
  return { access: 'allowed', via: viaStar ? 'wildcard (*) group' : 'explicit rule' };
}
