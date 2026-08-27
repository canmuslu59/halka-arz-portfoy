const CACHE='arz-portfoy-v2';
const ASSETS=['./','./styles.css','./app.js','./manifest.webmanifest','./icon.svg','./core/domain.js','./core/parsers.js','./core/repository.js','./core/http.js','./core/data-sources.js','./core/portfolio-service.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
});
