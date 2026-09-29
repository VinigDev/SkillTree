/* Skill Tree · service worker do app instalável
   Estratégia: a página (index.html) vem da REDE PRIMEIRO, para sempre abrir a versão mais nova publicada;
   a cópia salva só é usada sem internet ou com a rede muito lenta. O index.html já traz tudo embutido
   (código, estilos e fontes), então essa cópia basta para o app funcionar offline.
   Dados (localStorage) e sincronização (Supabase) não passam por aqui. */
var VERSION = 'st-sw-2';
var SHELL = 'st-shell'; // uma única entrada: a última página do app baixada com sucesso
var SLOW_MS = 4000; // rede lenta: depois disso abre a cópia salva (e a nova continua baixando para a próxima vez)

var scopePath = new URL('./', self.location).pathname;
function isAppPage(url) {
  return url.origin === self.location.origin && (url.pathname === scopePath || url.pathname === scopePath + 'index.html');
}
function isHtml(res) {
  return res && res.ok && (res.headers.get('content-type') || '').indexOf('text/html') !== -1;
}
function saved() {
  return caches.open(SHELL).then(function (c) { return c.match('./'); });
}
function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Skill Tree · sem conexão</title>' +
      '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#050506;color:#fee2e2;font:500 16px Rajdhani,system-ui,sans-serif;text-align:center">' +
      '<div style="padding:24px;max-width:420px"><div style="color:#facc15;font-weight:700;letter-spacing:.2em;text-transform:uppercase">Sem conexão</div>' +
      '<p style="color:#a1a1aa">Abra o Skill Tree uma vez com internet para ele ficar disponível offline neste aparelho.</p>' +
      '<button onclick="location.reload()" style="margin-top:8px;background:#facc15;color:#000;border:0;padding:10px 16px;font:700 13px Rajdhani,system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;cursor:pointer">Tentar de novo</button></div></body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
  // guarda a página já na instalação (se a rede falhar agora, fica para a próxima abertura)
  e.waitUntil(
    fetch('./', { cache: 'no-cache', credentials: 'same-origin' })
      .then(function (r) { if (isHtml(r)) return caches.open(SHELL).then(function (c) { return c.put('./', r); }); })
      .catch(function () {})
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('st-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return; // só a abertura da página; o resto vai direto para a rede
  var url = new URL(req.url);
  if (!isAppPage(url)) return;

  var finish;
  e.waitUntil(new Promise(function (r) { finish = r; setTimeout(r, 60000); })); // mantém o worker vivo até salvar a página nova
  var net = fetch(req).then(
    function (res) {
      if (isHtml(res)) {
        var copy = res.clone();
        caches.open(SHELL).then(function (c) { return c.put('./', copy); }).then(finish, finish);
      } else finish();
      return res;
    },
    function (err) { finish(); throw err; }
  );

  e.respondWith(new Promise(function (resolve) {
    var done = false;
    var give = function (r) { if (!done && r) { done = true; resolve(r); } };
    var fallback = function () { return saved().then(function (c) { return c || offlinePage(); }); };
    var timer = setTimeout(function () { saved().then(function (c) { if (c) give(c); }); }, SLOW_MS);
    net.then(
      function (res) { clearTimeout(timer); if (res.ok) give(res); else fallback().then(function (c) { give(c.status === 503 ? res : c); }); },
      function () { clearTimeout(timer); fallback().then(give); }
    );
  }));
});
