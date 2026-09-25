// The garage screen between races: pick a world, buy/select a bike,
// spend coins on upgrades. Pure DOM; every button has a data-* hook
// so tests (and players) can click it.
import { BIOMES } from './biomes.js';
import { BIKES, UPGRADES, MAX_LEVEL, CUP, newCup, upgradePrice, upgradeLevels, statsFor, writeSave } from './progression.js';

const bar = (v, max) => `<span class="sbar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></span>`;

export function createGarage(el, save, { onRace, onCup }) {
  const buy = (cost) => {
    if (save.coins < cost) return false;
    save.coins -= cost;
    return true;
  };

  function render() {
    const bike = BIKES.find((b) => b.id === save.bike);
    const s = statsFor(save, save.bike);
    const lv = upgradeLevels(save, save.bike);
    el.innerHTML = `
      <div class="g-head">
        <h2>GARAGE</h2>
        <div class="coins" id="coins">◉ ${save.coins.toLocaleString()}</div>
      </div>
      <section class="cup">
        <div>
          <h3>🏆 CHAMPIONSHIP CUP ${save.trophies ? `<span class="troph">${'🏆'.repeat(Math.min(save.trophies, 5))}</span>` : ''}</h3>
          <p>All five worlds back to back. ${CUP.points.join(' / ')} points per place, ◉ ${CUP.prize[0]} for the champion.</p>
        </div>
        ${save.cup
          ? `<div class="cup-live">Round ${save.cup.round + 1}/5 · you ${save.cup.points.YOU} pts
               <button id="cup-continue">CONTINUE CUP ▶</button><button id="cup-quit" class="ghost">quit</button></div>`
          : `<button id="cup-start">START CUP ▶</button>`}
      </section>
      <section>
        <h3>WORLD</h3>
        <div class="g-row worlds">
          ${BIOMES.map((b) => `
            <button class="g-card world ${b.id === save.biome ? 'sel' : ''}" data-biome="${b.id}"
              style="background:linear-gradient(160deg, ${b.sky[0]}, ${b.sky[1]} 60%, ${b.sky[2]})">
              <b>${b.name}</b><small>${b.tagline}</small>
              ${save.best[b.id] ? `<em>best ${save.best[b.id].toFixed(2)}s</em>` : ''}
            </button>`).join('')}
        </div>
      </section>
      <section>
        <h3>BIKE</h3>
        <div class="g-row bikes">
          ${BIKES.map((b) => {
            const owned = save.owned.includes(b.id);
            return `<button class="g-card bike ${b.id === save.bike ? 'sel' : ''} ${owned ? '' : 'locked'}" data-bike="${b.id}">
              <b>${b.name}</b><small>${b.blurb}</small>
              <span class="ability">⚡ ${b.ability.name}</span>
              ${owned ? (b.id === save.bike ? '<em>RIDING</em>' : '<em>OWNED</em>') : `<em class="price">◉ ${b.price}</em>`}
            </button>`;
          }).join('')}
        </div>
      </section>
      <section class="g-split">
        <div>
          <h3>${bike.name.toUpperCase()} · STATS</h3>
          <div class="stats-grid">
            <span>Top speed</span>${bar(s.maxSpeed - 25, 20)}
            <span>Turbo</span>${bar(s.turboSpeed - 35, 25)}
            <span>Accel</span>${bar(s.accel - 12, 25)}
            <span>Cooling</span>${bar(s.cooling / s.heatRate, 1.4)}
            <span>Landing</span>${bar(s.crashAngle - 0.6, 0.9)}
            <span>Air spin</span>${bar(s.spin, 1.5)}
            <span>Patch grip</span>${bar(1.3 - s.grip, 1.2)}
          </div>
          <p class="ab"><b>⚡ ${bike.ability.name}</b> — ${bike.ability.blurb}. Charge it with tricks, perfect landings, coins & stars, fire with <kbd>C</kbd>.</p>
        </div>
        <div>
          <h3>UPGRADES</h3>
          ${UPGRADES.map((u) => {
            const l = lv[u.id] || 0;
            const maxed = l >= MAX_LEVEL;
            return `<div class="upg">
              <span class="uname">${u.name}<small>${u.blurb}</small></span>
              <span class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span>
              <button data-upgrade="${u.id}" ${maxed || save.coins < upgradePrice(l) ? 'disabled' : ''}>${maxed ? 'MAX' : `◉ ${upgradePrice(l)}`}</button>
            </div>`;
          }).join('')}
        </div>
      </section>
      <button id="race-btn" class="race-btn">RACE ▶ <small>ENTER</small></button>`;
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.biome) save.biome = t.dataset.biome;
    else if (t.dataset.bike) {
      const b = BIKES.find((x) => x.id === t.dataset.bike);
      if (save.owned.includes(b.id)) save.bike = b.id;
      else if (buy(b.price)) {
        save.owned.push(b.id);
        save.bike = b.id;
      } else {
        t.classList.add('nope');
        setTimeout(() => t.classList.remove('nope'), 400);
        return;
      }
    } else if (t.dataset.upgrade) {
      const lv = (save.upgrades[save.bike] ||= {});
      const l = lv[t.dataset.upgrade] || 0;
      if (l < MAX_LEVEL && buy(upgradePrice(l))) lv[t.dataset.upgrade] = l + 1;
    } else if (t.id === 'race-btn') {
      onRace();
      return;
    } else if (t.id === 'cup-start') {
      save.cup = newCup();
      save.biome = CUP.worlds[0];
      writeSave(save);
      onCup();
      return;
    } else if (t.id === 'cup-continue') {
      save.biome = CUP.worlds[save.cup.round];
      writeSave(save);
      onCup();
      return;
    } else if (t.id === 'cup-quit') {
      save.cup = null;
    }
    writeSave(save);
    render();
  });

  return {
    show() { render(); el.hidden = false; },
    hide() { el.hidden = true; },
    render,
  };
}
