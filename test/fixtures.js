// Two in-memory fixture sites: A = broken, B = fixed. Served by test/server.js.
const longText = 'Insurance brokerage and risk management services for businesses. '.repeat(40);

export const SITE_A = {
  soft404: true,
  'robots.txt': `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: {ORIGIN}/sitemap.xml\n`,
  'sitemap.xml': `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>{ORIGIN}/</loc></url><url><loc>{ORIGIN}/about</loc></url><url><loc>{ORIGIN}/services</loc></url>
<url><loc>{ORIGIN}/blog/post1</loc></url><url><loc>{ORIGIN}/spa</loc></url></urlset>`,
  '/': `<!DOCTYPE html><html><head><title>Acme Corp | Acme Corp</title>
<meta name="description" content="Acme brings a new approach to widgets and services for everyone in the industry today.">
</head><body>
<h1>Welcome to Acme</h1><h1>The best widgets</h1>
<img src="/a.png"><img src="/b.png" alt="widget"><img src="/c.png">
<p>Short home page.</p>
<a href="/about">About</a> <a href="/services">Services</a> <a href="/blog/post1">Post</a> <a href="/spa">App</a> <a href="/missing-page">Broken</a>
</body></html>`,
  '/about': `<!DOCTYPE html><html lang="en"><head><title>About Us | Acme Corp</title>
<meta name="description" content="Learn about Acme Corp, a leading widget provider with decades of experience serving businesses.">
<meta name="viewport" content="width=device-width">
<link rel="canonical" href="{ORIGIN}/about">
<meta property="og:title" content="About Us"><meta property="og:image" content="{ORIGIN}/og.png">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme Corp"}</script>
</head><body><h1>About</h1><h2>History</h2><p>${longText}</p><img src="/d.png" alt="office"></body></html>`,
  '/services': `<!DOCTYPE html><html><head><title>Services | Acme Corp</title>
<meta name="description" content="Tour our servcies."></head>
<body><h1>Services</h1><h4>Widgets</h4><p>Category list.</p><a href="/about">About</a></body></html>`,
  '/blog/post1': `<!DOCTYPE html><html lang="en"><head><title>Widget Safety Rules Explained For Modern Factories | Acme Corp</title>
<meta name="description" content="Everything factories need to know about the new widget safety rules and how to comply this year.">
<meta name="viewport" content="width=device-width"><link rel="canonical" href="{ORIGIN}/blog/post1">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"Widget Safety"}</script>
</head><body><h1>Widget Safety Rules Explained</h1><h2>Background</h2><p>${longText}</p></body></html>`,
  '/spa': `<!DOCTYPE html><html><head><title>App</title></head><body><div id="root"></div>
<script>
document.title = 'Widget Configurator | Acme Corp';
const m = document.createElement('meta'); m.name = 'description';
m.content = 'Configure and price your widget online with our interactive tool built for procurement teams.';
document.head.appendChild(m);
document.getElementById('root').innerHTML = '<h1>Widget Configurator</h1><p>' + 'Configure widgets online with live pricing and options. '.repeat(30) + '</p>';
</script></body></html>`,
};

export const SITE_B = {
  soft404: false,
  'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: {ORIGIN}/sitemap.xml\n`,
  'llms.txt': `# Acme Corp\n\n> Widget provider.\n\n## Pages\n- [About]({ORIGIN}/about)\n`,
  'sitemap.xml': `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>{ORIGIN}/</loc></url><url><loc>{ORIGIN}/about</loc></url><url><loc>{ORIGIN}/services</loc></url>
<url><loc>{ORIGIN}/blog/post1</loc></url></urlset>`,
  '/': `<!DOCTYPE html><html lang="en"><head><title>Widgets &amp; Risk Management | Acme Corp</title>
<meta name="description" content="Acme brings a new approach to widgets and services for everyone in the industry today.">
<meta name="viewport" content="width=device-width"><link rel="canonical" href="{ORIGIN}/">
<meta property="og:title" content="Acme"><meta property="og:image" content="{ORIGIN}/home.png"><meta name="twitter:card" content="summary">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme Corp"}</script>
</head><body>
<h1>Welcome to Acme</h1><h2>The best widgets</h2>
<img src="/a.png" alt="widgets"><img src="/b.png" alt="widget"><img src="/c.png" alt="factory">
<p>${longText}</p>
<a href="/about">About</a> <a href="/services">Services</a> <a href="/blog/post1">Post</a>
</body></html>`,
  '/about': SITE_A['/about'],
  '/services': `<!DOCTYPE html><html lang="en"><head><title>Services | Acme Corp</title>
<meta name="description" content="Commercial widgets, employee benefits, and risk control from a team that reduces risk before it becomes a claim.">
<meta name="viewport" content="width=device-width"><link rel="canonical" href="{ORIGIN}/services">
<meta property="og:title" content="Services"><meta property="og:image" content="{ORIGIN}/svc.png"><meta name="twitter:card" content="summary">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}</script>
</head><body><h1>Services</h1><h2>Widgets</h2><p>${longText}</p></body></html>`,
  '/blog/post1': `<!DOCTYPE html><html lang="en"><head><title>Widget Safety Rules Explained For Modern Factories | Acme Corp</title>
<meta name="description" content="Everything factories need to know about the new widget safety rules and how to comply this year.">
<meta name="viewport" content="width=device-width"><link rel="canonical" href="{ORIGIN}/blog/post1">
<meta property="og:title" content="Widget Safety"><meta property="og:image" content="{ORIGIN}/post.png"><meta name="twitter:card" content="summary">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"Widget Safety","author":{"@type":"Person","name":"Jane Broker"},"datePublished":"2026-06-01"}</script>
</head><body><h1>Widget Safety Rules Explained</h1><p>By Jane Broker — June 1, 2026</p><time datetime="2026-06-01">June 1, 2026</time><h2>Background</h2><p>${longText}</p></body></html>`,
};
