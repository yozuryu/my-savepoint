/**
 * Update notice: tells the viewer when a new version of the app has been deployed.
 * Loaded by assets/mobile-nav.js on every page (classic script, no dependencies).
 *
 * deploy.yml writes version.json at the site root: { v, version }. `v` is a hash of the app files only
 * (data/ and memory-card/ left out), so the deploys that follow a data run don't count; `version` is
 * the newest changelog header (v26.11.21), shown beside the title.
 * The version the viewer last loaded fresh is kept in localStorage (`sp:appVersion`); when the site's
 * differs, a notice slides up. Tapping it clears the service worker's cached app files and reloads
 * (window.spRefreshApp, also used by the Refresh app buttons, which record the version the same way).
 * Checked on load, when the app comes back to the foreground, and every 15 minutes while visible.
 */
(function () {
  if (window.spRefreshApp) return;   // loaded twice
  const BASE = (document.currentScript && document.currentScript.src || '').replace(/\/assets\/update-notice\.js.*$/, '');
  const KEY = 'sp:appVersion';
  const EVERY = 15 * 60 * 1000;
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch {} },
  };

  // The site's current version (never from a cache: sw.js lets version.json through)
  const latest = () => fetch(BASE + '/version.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null).catch(() => null);

  // Clear cached app files (not data), update the service worker, reload. Records the site's
  // version first, so the page that loads doesn't announce the update it already has.
  window.spRefreshApp = async function (known) {
    try {
      const v = known || await latest();
      if (v && v.v) store.set(v.v);
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      const reg = await (navigator.serviceWorker && navigator.serviceWorker.getRegistration());
      if (reg) await reg.update();
    } catch { /* reload anyway */ }
    location.reload();
  };

  const css = document.createElement('style');
  css.textContent = `
    .spu {
      position: fixed; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); z-index: 205;
      width: min(420px, calc(100% - 32px)); transform: translateX(-50%);
      display: flex; align-items: center; gap: 10px; padding: 9px 8px 9px 10px;
      background: #1c3349; border: 1px solid rgba(102,192,244,.45); border-left: 3px solid #66c0f4; border-radius: 3px;
      box-shadow: 0 10px 28px rgba(0,0,0,.6), 0 0 0 1px rgba(0,0,0,.35); color: #c6d4df; font: 12px 'Segoe UI', Arial, sans-serif;
      cursor: pointer; text-align: left; -webkit-tap-highlight-color: transparent;
      animation: spu-in .32s cubic-bezier(.2,.8,.2,1) backwards;
    }
    .spu.out { animation: spu-out .2s ease-in forwards; }
    @keyframes spu-in { from { opacity: 0; transform: translate(-50%, 14px); } }
    @keyframes spu-out { to { opacity: 0; transform: translate(-50%, 14px); } }
    .spu-ic { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
      background: rgba(102,192,244,.12); color: #66c0f4; }
    .spu-ic img { width: 18px; height: 18px; display: block; }
    .spu.busy .spu-ic img { animation: spu-spin .8s linear infinite; }
    @keyframes spu-spin { to { transform: rotate(360deg); } }
    .spu-t { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; }
    .spu-t em { font-style: normal; font-weight: 400; font-size: 11px; color: #66c0f4; font-variant-numeric: tabular-nums; }
    .spu-go { flex-shrink: 0; height: 28px; padding: 0 10px; display: inline-flex; align-items: center; line-height: 1; border-radius: 2px; border: 1px solid rgba(102,192,244,.45);
      background: rgba(102,192,244,.1); color: #66c0f4; font: 600 12px 'Segoe UI', Arial, sans-serif; pointer-events: none; }
    .spu-x { flex-shrink: 0; width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 2px;
      background: none; color: #546270; cursor: pointer; }
    .spu-x:hover { color: #c6d4df; }
    .spu:focus-visible, .spu-x:focus-visible { outline: 2px solid #66c0f4; outline-offset: 2px; }
    @media (max-width: 767px) {
      /* above the bottom nav; the scroll-to-top button moves up out of its way */
      .spu { bottom: calc(68px + env(safe-area-inset-bottom, 0px)); }
      .scroll-top-btn { transition: transform .25s ease; }
      html.spu-on .scroll-top-btn { transform: translateY(-62px); }
    }
    @media (prefers-reduced-motion: reduce) { .spu, .spu.out { animation: none; } .spu.out { display: none; } }
  `;
  document.head.appendChild(css);

  const X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  let el = null, dismissed = null;
  const hide = () => {
    if (!el) return;
    const old = el; el = null;
    document.documentElement.classList.remove('spu-on');
    old.classList.add('out');
    setTimeout(() => old.remove(), 220);
  };
  const show = v => {
    if (el && el.dataset.v === v.v) return;
    if (el) el.remove();
    el = document.createElement('div');
    el.className = 'spu';
    el.dataset.v = v.v;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', 'New save point reached: a new version of Savepoint is out. Load it');
    el.innerHTML = `<span class="spu-ic"><img src="${BASE}/assets/favicon.svg" alt=""></span>
      <span class="spu-t">New save point reached${/^v[\d.]+$/.test(v.version || '') ? `<em>${v.version}</em>` : ''}</span>
      <span class="spu-go">Load</span>
      <button class="spu-x" type="button" aria-label="Dismiss">${X}</button>`;
    const go = () => { if (el.classList.contains('busy')) return; el.classList.add('busy'); window.spRefreshApp(v); };
    el.addEventListener('click', e => { if (e.target.closest('.spu-x')) { dismissed = v.v; hide(); } else go(); });
    el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); go(); } });
    document.body.appendChild(el);
    document.documentElement.classList.add('spu-on');
  };

  let last = 0;
  const check = async () => {
    last = Date.now();
    const v = await latest();
    if (!v || !v.v) return;            // no version.json (local copy, older deploy): nothing to compare
    const mine = store.get();
    if (!mine) { store.set(v.v); return; }   // first visit: what's loaded is current
    if (mine === v.v) { hide(); return; }
    if (dismissed !== v.v) show(v);
  };

  setTimeout(check, 1500);   // after the page's own requests
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - last > 60 * 1000) check();
  });
  setInterval(() => { if (document.visibilityState === 'visible') check(); }, EVERY);
})();
