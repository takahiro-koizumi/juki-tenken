// 重機 点検票 ― 電波の弱い現場でも画面が開くように、アプリ本体を端末に控えておく。
// 本体（同じ住所のファイル）はネットを先に見る（直した版がすぐ届く）。ただし4秒たっても返ってこない時は控えを出し、
// ネットの結果は裏で控えに入れる。つながらない時は控えを使う。
// Firebase・QRコードの部品（版の番号入りの住所）は控えを先に使う。
const CACHE = 'juki-tenken-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon.svg'];
const NET_WAIT_MS = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function put(key, res) {
  if (!res || !res.ok) return Promise.resolve();
  const copy = res.clone();
  return caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // 画面（?k=…&m=… 付き）はどれも index.html 1つで控える
    const key = req.mode === 'navigate' ? new Request('./index.html') : req;
    const fromCache = () => caches.match(key, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'));
    const net = fetch(req).then((res) => { e.waitUntil(put(key, res)); return res; });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
      // 遅い時は控えを先に出す（控えが無い時＝初めて開いた時はネットを待つ）
      const timer = setTimeout(() => { fromCache().then(finish); }, NET_WAIT_MS);
      net.then((res) => { clearTimeout(timer); finish(res); }, () => {
        clearTimeout(timer);
        fromCache().then((r) => finish(r || Response.error()));
      });
    }));
    return;
  }
  const versioned = (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
    || url.hostname === 'cdnjs.cloudflare.com';
  if (versioned) {
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((res) => { e.waitUntil(put(req, res)); return res; }))
    );
  }
});
