/* Cache only a public offline page and brand assets. Never cache private trips,
   API responses, credentials, user photos, or the Firebase SDK. */
const CACHE='gabojen-public-v12-1';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./offline.html','./assets/brand.svg','./assets/icon-192.png']))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gabojen-public-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||e.request.mode!=='navigate')return;
  e.respondWith(fetch(e.request).catch(()=>caches.match('./offline.html')));
});
