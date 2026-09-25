// npm run loop [app ...] [--right] [--owner=claude]
// Runs the headed test suite for the given apps over and over, forever,
// (--owner=<name> re-scans apps/*/meta.json every round, so new apps join automatically)
// so the room can watch the AI validate its work. Ctrl+C to stop.
// A one-line summary per round is appended to test-results/loop.log.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';

const right = process.argv.includes('--right');
const owner = process.argv.find((a) => a.startsWith('--owner='))?.split('=')[1];
const fixed = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ownedBy = (who) => readdirSync('apps').filter((slug) => {
  try { return JSON.parse(readFileSync(`apps/${slug}/meta.json`, 'utf8')).owner === who; } catch { return false; }
});
const pickApps = () => (owner ? ownedBy(owner) : fixed.length ? fixed : ['redline-mx']);
mkdirSync('test-results', { recursive: true });

for (let round = 1; ; round++) {
  for (const app of pickApps()) {
    const started = Date.now();
    const r = spawnSync('node', ['scripts/test.js', 'show', app, ...(right ? ['--right'] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    process.stdout.write(r.stdout);
    const passed = r.stdout.match(/(\d+) passed/)?.[1] ?? 0;
    const failed = r.stdout.match(/(\d+) failed/)?.[1] ?? 0;
    const line = `${new Date().toISOString()} round ${round} ${app}: ${passed} passed, ${failed} failed (${Math.round((Date.now() - started) / 1000)}s)`;
    console.log(`\n━━ ${line}\n`);
    appendFileSync('test-results/loop.log', line + '\n');
  }
}
