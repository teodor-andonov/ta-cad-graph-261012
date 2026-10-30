/* TA PWA update UI v1. Local copy: no runtime dependency on TA Guides. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  const script = document.currentScript;
  const base = new URL('./', script.src);
  const appName = document.querySelector('meta[name="application-name"]')?.content || document.title;
  const icon = document.querySelector('link[rel="icon"]')?.href;
  let registration, prepared = false, reloading = false, checking = false, manualCheck = false;
  let hadController = Boolean(navigator.serviceWorker.controller);
  let previousFocus, prepareTimeout;
  const host = document.createElement('div');
  host.id = 'ta-pwa-updates';
  const root = host.attachShadow({mode:'open'});
  root.innerHTML = `<style>
    :host{all:initial;position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483646;font:13px/1.5 system-ui,sans-serif;color:#333;color-scheme:light}
    *{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;cursor:pointer;border:1px solid #ccc;border-radius:9px;padding:8px 12px;color:#333;background:#fff}button:focus-visible{outline:2px solid #555;outline-offset:3px}button:disabled{opacity:.55;cursor:wait}
    #ta-pwa-toggle{box-shadow:0 2px 12px #0002;font-size:12px;background:#f7f7f7}#ta-pwa-card{width:min(360px,calc(100vw - 24px));padding:18px;border:1px solid #d5d5d5;border-radius:14px;background:#f7f7f7;box-shadow:0 8px 40px #0003;margin-bottom:8px}header{display:flex;align-items:center;gap:10px}img{width:32px;height:32px}h2{font-size:16px;line-height:1.3;margin:0}p{margin:12px 0}#ta-pwa-status{white-space:normal}footer{display:flex;gap:8px;flex-wrap:wrap}#ta-pwa-apply{color:white;background:#333;border-color:#333}#ta-pwa-shield{position:fixed;inset:0;background:#eee9;z-index:2147483645;display:grid;place-items:center;font:16px system-ui;color:#333}#ta-pwa-shield span{background:#f7f7f7;border:1px solid #ccc;padding:24px;border-radius:12px}
    @media(prefers-reduced-motion:no-preference){#ta-pwa-card{animation:appear .18s ease-out}@keyframes appear{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}}
  </style><div id="ta-pwa-shield" hidden><span>Updating…</span></div><section id="ta-pwa-card" role="region" aria-labelledby="ta-pwa-heading" hidden><header><img alt=""><h2 id="ta-pwa-heading">App updates</h2></header><p id="ta-pwa-status" role="status" aria-live="polite"></p><footer><button id="ta-pwa-apply" hidden>Update now</button><button id="ta-pwa-check">Check for updates</button><button id="ta-pwa-later">Close</button></footer></section><button id="ta-pwa-toggle" aria-expanded="false" aria-controls="ta-pwa-card">Updates</button>`;
  root.querySelector('img').src = icon || '';
  const get = id => root.getElementById('ta-pwa-'+id);
  const show = (message, available = false) => {
    get('card').hidden = false;
    get('toggle').setAttribute('aria-expanded','true');
    get('heading').textContent = available ? 'Update available' : 'App updates';
    get('status').textContent = message;
    get('apply').hidden = !available;
    get('later').textContent = available ? 'Later' : 'Close';
    get('toggle').textContent = available ? 'Update available' : 'Updates';
  };
  const offer = () => show(`A new version of ${appName} is ready. Update reloads all open windows for this app. Save your work first.`, true);
  const hide = () => {
    get('card').hidden = true;
    get('toggle').setAttribute('aria-expanded','false');
    (previousFocus?.isConnected ? previousFocus : get('toggle')).focus();
  };
  const safe = () => {
    try { return typeof window.taPwaCanUpdate === 'function' && window.taPwaCanUpdate() === true; }
    catch { return false; }
  };
  const release = () => { clearTimeout(prepareTimeout); prepared = false; get('shield').hidden = true; };
  navigator.serviceWorker.addEventListener('message', event => {
    if (!event.source?.scriptURL || new URL(event.source.scriptURL).href !== new URL('sw.js',base).href) return;
    if (event.data?.type === 'TA_UPDATE_PREPARE') {
      let ready = false;
      try { ready = safe(); } catch { /* Fail closed when an app guard fails. */ }
      if (ready) { prepared = true; get('shield').hidden = false; prepareTimeout = setTimeout(release,15000); }
      event.ports[0]?.postMessage({ready});
    }
    if (event.data?.type === 'TA_UPDATE_CANCEL') release();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (prepared && !reloading) { reloading = true; location.reload(); }
    else show('An update is active. Save your work, then reload this window.',true);
  });
  const watch = worker => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && registration?.waiting && navigator.serviceWorker.controller) offer();
    });
  };
  const check = async (manual = false) => {
    if (manual) { manualCheck = true; show('Checking for updates…'); }
    if (!registration || checking || prepared) return;
    checking = true;
    try {
      await registration.update();
      const worker = registration.installing;
      if (worker && !['installed','activated','redundant'].includes(worker.state)) {
        await new Promise(resolve => worker.addEventListener('statechange', () => {
          if (['installed','activated','redundant'].includes(worker.state)) resolve();
        }));
      }
      if (registration.waiting) offer();
      else if (manualCheck) show('You’re up to date.');
    } catch { if (manualCheck) show('Could not check for updates. Connect to the internet and try again.'); }
    finally { checking = false; manualCheck = false; }
  };
  get('toggle').onclick = () => {
    previousFocus = document.activeElement;
    if (!get('card').hidden) return hide();
    if (registration?.waiting) offer(); else void check(true);
    get('later').focus();
  };
  get('later').onclick = hide;
  root.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  get('check').onclick = () => void check(true);
  get('apply').onclick = async () => {
    if (!safe()) { show('Save your work and finish or close the current operation in this window, then try again.',true); return; }
    const worker = registration?.waiting;
    if (!worker) { if (!reloading) { prepared = true; reloading = true; location.reload(); } return; }
    get('apply').disabled = true;
    show('Checking that all app windows are ready…',true);
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      release(); get('apply').disabled = false;
      show('The update could not start. Close other app windows and try again.',true);
      channel.port1.close();
    },10000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout); channel.port1.close();
      if (!event.data?.accepted) {
        release(); get('apply').disabled = false;
        show('Save work and finish operations in every window for this app, or close the other windows, then try again.',true);
      }
    };
    worker.postMessage({type:'TA_UPDATE_APPLY'},[channel.port2]);
  };
  const start = async () => {
    document.body.append(host);
    try {
      registration = await navigator.serviceWorker.register(new URL('sw.js',base),{
        scope:base.href, updateViaCache:'none', type:script.dataset.workerType || 'classic'
      });
      registration.addEventListener('updatefound', () => watch(registration.installing));
      watch(registration.installing);
      if (registration.waiting && navigator.serviceWorker.controller) offer();
      void check();
      setInterval(() => { if (document.visibilityState === 'visible') void check(); },60*60*1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
      window.addEventListener('online', () => void check());
    } catch { show('Offline updates are unavailable. Open this app online and try again.'); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else void start();
})();
