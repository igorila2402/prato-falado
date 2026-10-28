// Cache do app para abrir rápido e funcionar sem internet.
// IMPORTANTE: troque VERSION a cada publicação (qualquer mudança em index.html, app.js, label.js, parser.js,
// taco.json…). O iPhone confere o sw.js a cada abertura; versão nova = cache novo.
const VERSION = '2026-10-28.2';
const CACHE = 'pf-' + VERSION;
const LOCAL = ['./','index.html','app.js','parser.js','label.js','config.js','taco.json','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
const CDN = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    // arquivos do app: obrigatórios; 'reload' ignora o cache HTTP do GitHub Pages (max-age 10 min)
    await c.addAll(LOCAL.map(u => new Request(u, {cache: 'reload'})));
    // bibliotecas do CDN: se falhar, a instalação continua (são buscadas de novo depois)
    await Promise.all(CDN.map(u => c.add(new Request(u, {mode: 'cors'})).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('pf-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const same = u.origin === self.location.origin;
  // Supabase, Open Food Facts, leitor de texto (tesseract) e fontes vão direto à rede, sem cache do app
  if (!same && !CDN.includes(u.href)) return;
  if (CDN.includes(u.href)) {
    // versão fixa no endereço: cache primeiro
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })));
    return;
  }
  const isNav = req.mode === 'navigate';
  // arquivos do app: rede primeiro (pega atualizações), cache se estiver sem internet
  e.respondWith(fetch(req, {cache: 'no-cache'}).then(res => {
    if (res.ok && (isNav || !u.search)) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(isNav ? 'index.html' : req, cp)); }
    return res;
  }).catch(() => isNav
    ? caches.match('index.html', {ignoreSearch: true})
    : caches.match(req, {ignoreSearch: true}).then(r => r || Response.error())));
});
