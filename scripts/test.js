// npm run test [app] [-- extra playwright args]      headless
// npm run show [app] [-- extra playwright args]      visible browser, slowed down
// npm run show [app] --right                        use the right half of the screen
// npm run report [app]                               open the HTML report
// With an app slug, only apps/<slug>/ is tested and results go to
// test-results/<slug>/ + playwright-report/<slug>/ (safe to run in parallel).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const [mode, ...rest] = process.argv.slice(2);
const env = { ...process.env };
if (mode === 'show') env.SHOW = '1';
if (rest.includes('--right')) { env.SIDE = 'right'; rest.splice(rest.indexOf('--right'), 1); }
if (rest[0] && !rest[0].startsWith('-')) {
  const app = rest.shift();
  if (!existsSync(`apps/${app}`)) {
    console.error(`No such app: apps/${app}`);
    process.exit(1);
  }
  env.APP = app;
}
const args = mode === 'report'
  ? ['show-report', `playwright-report/${env.APP || '_all'}`]
  : ['test', ...rest];
const r = spawnSync('npx', ['playwright', ...args], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
