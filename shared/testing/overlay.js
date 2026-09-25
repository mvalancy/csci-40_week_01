// Injected into every page under test. Draws the "AI is testing" HUD:
// glowing border, step banner, fake cursor with click ripples, live key
// chips, and assertion toasts. Pure DOM, pointer-events: none, so it never
// interferes with the app being tested.
export function installOverlay() {
  if (window.__aiOverlay) return;
  const api = (window.__aiOverlay = { queue: [] });

  const boot = () => {
    const root = document.createElement('div');
    root.id = '__ai-overlay';
    root.innerHTML = `
      <style>
        #__ai-overlay, #__ai-overlay * { box-sizing: border-box; font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace; }
        #__ai-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
        #__ai-overlay .frame { position: absolute; inset: 0; border: 3px solid transparent; border-radius: 4px;
          background: conic-gradient(from var(--a), #ff2d95, #7c4dff, #00e5ff, #76ff03, #ff2d95) border-box;
          -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; animation: __spin 3s linear infinite; opacity: .9; }
        @property --a { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
        @keyframes __spin { to { --a: 360deg; } }
        #__ai-overlay .banner { position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: 999px;
          background: rgba(10,10,20,.82); color: #e8f7ff; font-size: 13px; letter-spacing: .02em;
          border: 1px solid rgba(0,229,255,.5); box-shadow: 0 0 24px rgba(0,229,255,.35); backdrop-filter: blur(6px); max-width: 80vw; }
        #__ai-overlay .dot { width: 10px; height: 10px; border-radius: 50%; background: #ff2d55; box-shadow: 0 0 10px #ff2d55; animation: __pulse 1s infinite; flex: none; }
        @keyframes __pulse { 50% { opacity: .25; } }
        #__ai-overlay .who { color: #00e5ff; font-weight: 700; flex: none; }
        #__ai-overlay .num { color: #ffcf40; flex: none; }
        #__ai-overlay .step { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #__ai-overlay .toasts { position: absolute; right: 14px; top: 60px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
        #__ai-overlay .toast { padding: 6px 12px; border-radius: 8px; font-size: 12px; color: #eafff0;
          background: rgba(8,40,20,.88); border: 1px solid #2bd96b; box-shadow: 0 0 16px rgba(43,217,107,.35);
          animation: __in .25s ease-out, __out .4s ease-in 3.2s forwards; }
        #__ai-overlay .toast.fail { background: rgba(60,8,12,.9); border-color: #ff3b5c; color: #ffe8ec; box-shadow: 0 0 16px rgba(255,59,92,.5); }
        #__ai-overlay .toast.info { background: rgba(10,20,50,.88); border-color: #7c9bff; color: #e8eeff; box-shadow: 0 0 16px rgba(124,155,255,.35); }
        @keyframes __in { from { transform: translateX(40px); opacity: 0; } }
        @keyframes __out { to { transform: translateX(40px); opacity: 0; } }
        #__ai-overlay .keys { position: absolute; left: 14px; bottom: 14px; display: flex; gap: 6px; }
        #__ai-overlay .key { min-width: 34px; padding: 6px 10px; border-radius: 7px; text-align: center; font-size: 13px; font-weight: 700;
          color: #0a0a14; background: #ffcf40; box-shadow: 0 3px 0 #b8860b, 0 0 18px rgba(255,207,64,.6); animation: __in .12s ease-out; }
        #__ai-overlay .cursor { position: absolute; left: 0; top: 0; width: 22px; height: 22px; transition: transform .08s linear; filter: drop-shadow(0 0 6px #00e5ff); }
        #__ai-overlay .ripple { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%;
          border: 3px solid #00e5ff; animation: __ripple .6s ease-out forwards; }
        @keyframes __ripple { to { transform: scale(4); opacity: 0; } }
      </style>
      <div class="frame"></div>
      <div class="banner"><span class="dot"></span><span class="who">CLAUDE IS TESTING</span><span class="num"></span><span class="step">warming up…</span></div>
      <div class="toasts"></div>
      <div class="keys"></div>
      <svg class="cursor" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#00e5ff" stroke="#fff" stroke-width="1.5"/></svg>`;
    document.documentElement.appendChild(root);
    const $ = (s) => root.querySelector(s);

    api.step = (text, n) => { $('.step').textContent = text; $('.num').textContent = n ? `#${n}` : ''; };
    api.toast = (text, kind = 'pass') => {
      const t = document.createElement('div');
      t.className = `toast ${kind}`;
      t.textContent = (kind === 'pass' ? '✓ ' : kind === 'fail' ? '✗ ' : '› ') + text;
      $('.toasts').appendChild(t);
      setTimeout(() => t.remove(), 3700);
    };

    const held = new Map();
    const label = (k) => ({ ' ': 'SPACE', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '⏎', Shift: '⇧' }[k] || k.toUpperCase());
    addEventListener('keydown', (e) => {
      if (held.has(e.key)) return;
      const k = document.createElement('div');
      k.className = 'key';
      k.textContent = label(e.key);
      $('.keys').appendChild(k);
      held.set(e.key, k);
    }, true);
    addEventListener('keyup', (e) => { held.get(e.key)?.remove(); held.delete(e.key); }, true);

    const cur = $('.cursor');
    addEventListener('mousemove', (e) => { cur.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.className = 'ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      root.appendChild(r);
      setTimeout(() => r.remove(), 650);
    }, true);

    api.queue.forEach(([fn, args]) => api[fn](...args));
    api.queue = [];
  };

  // Calls made before the DOM exists are queued and replayed.
  api.step = (...a) => api.queue.push(['step', a]);
  api.toast = (...a) => api.queue.push(['toast', a]);
  if (document.documentElement) boot();
  else document.addEventListener('DOMContentLoaded', boot);
}
