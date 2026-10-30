const CACHE='cad-graph-shell-v2-ta-icons-ta-names-2-ta-update-v5';;
const STATIC=['./pwa-update.js','./','./index.html','./style.css','./app.js','./worker.js','./analyzer.py','./manifest.webmanifest','./icon.svg','./icon.svg?v=ta-20261027','./icon-192.png','./icon-512.png','./icon-maskable-192.png','./icon-maskable-512.png','./examples/parameters.py','./examples/geometry.py'];
const PYODIDE_HOST='cdn.jsdelivr.net';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cad-graph-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin===self.location.origin&&url.pathname.startsWith(new URL(self.registration.scope).pathname)){
    e.respondWith(caches.open(CACHE).then(cache=>cache.match(e.request)).then(hit=>hit||fetch(e.request).then(resp=>{
      if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return resp;
    })));return;
  }
  if(url.hostname===PYODIDE_HOST&&url.pathname.startsWith('/pyodide/v0.28.3/full/')){
    e.respondWith(caches.open(CACHE).then(cache=>cache.match(e.request)).then(hit=>hit||fetch(e.request).then(resp=>{
      if(resp.ok||resp.type==='opaque'){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return resp;
    })));}
});

/* TA PWA update worker v1. Append to sw.js (classic or module). */
(() => {
  let updating = false;
  self.addEventListener('message', event => {
    if (event.data?.type !== 'TA_UPDATE_APPLY') return;
    const reply = accepted => event.ports[0]?.postMessage({accepted});
    if (updating || !event.source?.url?.startsWith(self.registration.scope)) { reply(false); return; }
    updating = true;
    event.waitUntil((async () => {
      let windows = [];
      try {
        windows = (await self.clients.matchAll({type:'window',includeUncontrolled:true}))
          .filter(client => client.url.startsWith(self.registration.scope));
        if (!windows.length) { reply(false); return; }
        const ready = await Promise.all(windows.map(client => new Promise(resolve => {
          const channel = new MessageChannel();
          const timeout = setTimeout(() => { channel.port1.close(); resolve(false); },2000);
          channel.port1.onmessage = message => {
            clearTimeout(timeout); channel.port1.close(); resolve(message.data?.ready === true);
          };
          client.postMessage({type:'TA_UPDATE_PREPARE'},[channel.port2]);
        })));
        if (!ready.every(Boolean)) {
          windows.forEach(client => client.postMessage({type:'TA_UPDATE_CANCEL'}));
          reply(false); return;
        }
        reply(true);
        await self.skipWaiting();
      } catch {
        windows.forEach(client => client.postMessage({type:'TA_UPDATE_CANCEL'}));
        reply(false);
      } finally { updating = false; }
    })());
  });
})();
