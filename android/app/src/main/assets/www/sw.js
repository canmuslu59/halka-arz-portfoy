const CACHE = 'halka-arz-portfoy-v8';
const ASSETS = [
  './',
  './styles.css', './app.js', './notification-recovery.js', './icon.svg', './manifest.webmanifest', './privacy.html',
  './core/http.js', './core/data-sources.js', './core/market-reference.js', './core/gedik-calendar.js', './core/parsers.js', './core/domain.js',
  './core/analytics.js', './core/ipo-analytics.js', './core/ipo-service.js', './core/market-calendar.js',
  './core/navigation.js', './core/notification-rules.js', './core/portfolio-service.js', './core/pro-access.js',
  './core/refresh-coordinator.js', './core/repository.js', './core/theme.js'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
});
