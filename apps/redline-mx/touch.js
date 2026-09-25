// On-screen buttons for phones/tablets. They fire the same KeyboardEvents as
// a real keyboard, so the game (and the test overlay) can't tell the difference.
const BUTTONS = [
  { key: 'ArrowUp', label: '▲', cls: 'up' },
  { key: 'ArrowDown', label: '▼', cls: 'down' },
  { key: 'ArrowLeft', label: '◀', cls: 'left' },
  { key: 'ArrowRight', label: '▶', cls: 'right' },
  { key: 'x', label: 'TURBO', cls: 'b' },
  { key: 'z', label: 'GAS', cls: 'a' },
];

const send = (type, key) => dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));

export function setupTouch() {
  const touch = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
  if (!touch) return;
  const pad = document.createElement('div');
  pad.id = 'touchpad';
  for (const b of BUTTONS) {
    const el = document.createElement('button');
    el.className = `tb ${b.cls}`;
    el.textContent = b.label;
    const down = (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('on'); send('keydown', b.key); };
    const up = (e) => { e.preventDefault(); if (!el.classList.contains('on')) return; el.classList.remove('on'); send('keyup', b.key); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    pad.appendChild(el);
  }
  document.body.appendChild(pad);
  // Tap the title/results screen to start.
  for (const id of ['title', 'results']) {
    document.getElementById(id).addEventListener('pointerdown', () => { send('keydown', 'Enter'); send('keyup', 'Enter'); });
  }
  document.querySelectorAll('.blink').forEach((el) => (el.textContent = el.textContent.replace('PRESS ENTER', 'TAP')));
  document.body.classList.add('touch');
}
