import http from 'node:http';

export function serve(site, port) {
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, `http://localhost:${port}`).pathname;
    const key = path === '/' ? '/' : path.replace(/\/$/, '');
    const lookup = site[key] ?? site[key.slice(1)];
    const origin = `http://localhost:${port}`;
    if (lookup !== undefined) {
      const body = lookup.replaceAll('{ORIGIN}', origin);
      const type = key.endsWith('.xml') ? 'application/xml' : key.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'content-type': type });
      res.end(body);
    } else if (site.soft404) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!DOCTYPE html><html><head><title>Acme Corp</title><meta name="robots" content="noindex"></head><body><div>Page not found</div></body></html>');
    } else {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<!DOCTYPE html><html><head><title>404</title></head><body><h1>Not Found</h1></body></html>');
    }
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}
