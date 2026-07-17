// Vercel serverless function: GET|POST /api/audit?url=example.com
// Returns the audit result as JSON for a branded front-end to render.
// The crawl is capped at 30 pages (src/audit-api.js) and runs Chromium-free.
import { runApiAudit, MAX_PAGES } from '../src/audit-api.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed', allow: ['GET', 'POST'] });
    return;
  }

  // Params come from the query string (GET) or a JSON body (POST).
  const body = req.method === 'POST' && req.body ? (typeof req.body === 'string' ? safeJson(req.body) : req.body) : {};
  const q = req.query || {};
  const params = {
    url: body.url ?? q.url,
    maxPages: body.maxPages ?? q.maxPages,
    concurrency: body.concurrency ?? q.concurrency,
    checksFilter: body.checksFilter ?? q.checks,
  };

  try {
    const result = await runApiAudit(params);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ ok: true, maxPages: MAX_PAGES, result });
  } catch (err) {
    const msg = err?.message || String(err);
    const bad = /missing required|invalid url/.test(msg);
    res.status(bad ? 400 : 500).json({ ok: false, error: msg });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
