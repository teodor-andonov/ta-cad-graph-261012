const CACHE='cad-graph-shell-v1';
const STATIC=['./','./index.html','./style.css','./app.js','./worker.js','./analyzer.py','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./examples/parameters.py','./examples/geometry.py'];
const PYODIDE_HOST='cdn.jsdelivr.net';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin===self.location.origin){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(resp=>{
      if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return resp;
    })));return;
  }
  if(url.hostname===PYODIDE_HOST&&url.pathname.startsWith('/pyodide/v0.28.3/full/')){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(resp=>{
      if(resp.ok||resp.type==='opaque'){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return resp;
    })));}
});
