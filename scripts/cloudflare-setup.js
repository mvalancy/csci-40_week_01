#!/usr/bin/env node
// One-shot, idempotent Cloudflare Pages setup for both games.
//
//   npm run setup:cloudflare             apply the settings below
//   npm run setup:cloudflare -- --dry-run   only show what would change
//
// Each game is its own Git-connected Pages project serving the game at the
// site root. Re-run this after changing anything in GAMES; there's no dashboard
// clicking to remember.
//
// Auth: uses CLOUDFLARE_API_TOKEN if set, otherwise your `wrangler login` session.
// Account: CLOUDFLARE_ACCOUNT_ID if set, otherwise the first account on the token.
import { execSync } from 'node:child_process';

const REPO = { owner: 'mvalancy', repo_name: 'csci-40_f26_demos' };
const SHARED_ENV = { NODE_VERSION: '22', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' };

const GAMES = [
  {
    project: 'csci-40-week-01-redline-mx',
    domain: 'redlinemx.mattvalancy.com',
    build_command: 'npm ci && npx vite build --config apps/redline-mx/standalone.vite.config.js',
    destination_dir: 'apps/redline-mx/dist',
    path_includes: ['apps/redline-mx/*', 'shared/lib/*', 'package.json', 'package-lock.json'],
  },
  {
    project: 'csci-40-week-01-ashdrive',
    domain: 'ashdrive.mattvalancy.com',
    build_command: 'npm ci && npx vite build --config apps/ashdrive/standalone.vite.config.js',
    destination_dir: 'apps/ashdrive/dist',
    path_includes: ['apps/ashdrive/*', 'shared/lib/*', 'package.json', 'package-lock.json'],
  },
];

const DRY = process.argv.includes('--dry-run');

function apiToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  try {
    return JSON.parse(execSync('npx --yes wrangler@4 auth token --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).token;
  } catch {
    console.error('No Cloudflare credentials. Run `npx wrangler login` or set CLOUDFLARE_API_TOKEN.');
    process.exit(1);
  }
}

const token = apiToken();
async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) {
    const err = new Error(`${method} ${path}: ${JSON.stringify(json.errors)}`);
    err.status = res.status;
    throw err;
  }
  return json.result;
}

const account = process.env.CLOUDFLARE_ACCOUNT_ID || (await cf('GET', '/accounts'))[0].id;
const base = `/accounts/${account}/pages/projects`;
const envVars = Object.fromEntries(Object.entries(SHARED_ENV).map(([k, v]) => [k, { type: 'plain_text', value: v }]));

for (const g of GAMES) {
  console.log(`\n▶ ${g.project}  →  https://${g.domain}`);
  const build_config = { build_command: g.build_command, destination_dir: g.destination_dir, root_dir: '' };

  let project = await cf('GET', `${base}/${g.project}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  if (!project) {
    console.log('  project missing → creating (needs the Cloudflare Pages GitHub app on the repo)');
    if (!DRY) {
      project = await cf('POST', base, {
        name: g.project,
        production_branch: 'main',
        build_config,
        source: { type: 'github', config: { ...REPO, production_branch: 'main', deployments_enabled: true, production_deployments_enabled: true, preview_deployment_setting: 'none', path_includes: g.path_includes } },
        deployment_configs: { production: { env_vars: envVars }, preview: { env_vars: envVars } },
      });
    }
  } else {
    const cur = project.build_config;
    const changes = [];
    if (cur.build_command !== g.build_command) changes.push(`build command: ${cur.build_command} → ${g.build_command}`);
    if (cur.destination_dir !== g.destination_dir) changes.push(`output dir: ${cur.destination_dir} → ${g.destination_dir}`);
    const curPaths = project.source?.config?.path_includes ?? [];
    if (JSON.stringify(curPaths) !== JSON.stringify(g.path_includes)) changes.push(`watch paths: ${curPaths.join(', ')} → ${g.path_includes.join(', ')}`);
    const curRepo = project.source?.config?.repo_name;
    // Cloudflare follows the GitHub repo by id, so a rename keeps working; the stored name refreshes on its own.
    if (curRepo && curRepo !== REPO.repo_name) console.log(`  note: Cloudflare still shows the repo as ${curRepo} (renamed repos keep deploying)`);
    const curEnv = project.deployment_configs?.production?.env_vars ?? {};
    const missingEnv = Object.keys(SHARED_ENV).filter((k) => curEnv[k]?.value !== SHARED_ENV[k]);
    if (missingEnv.length) changes.push(`env vars: ${missingEnv.join(', ')}`);

    if (!changes.length) console.log('  build settings ✓ up to date');
    for (const c of changes) console.log(`  ${DRY ? 'would change' : 'changing'} ${c}`);
    if (changes.length && !DRY) {
      await cf('PATCH', `${base}/${g.project}`, {
        build_config,
        source: project.source && { type: project.source.type, config: { ...project.source.config, path_includes: g.path_includes } },
        deployment_configs: { production: { env_vars: envVars } },
      });
    }
  }

  const domains = project ? await cf('GET', `${base}/${g.project}/domains`) : [];
  const existing = domains.find((d) => d.name === g.domain);
  if (existing) console.log(`  domain ✓ ${g.domain} (${existing.status})`);
  else {
    console.log(`  ${DRY ? 'would add' : 'adding'} custom domain ${g.domain}`);
    if (!DRY) await cf('POST', `${base}/${g.project}/domains`, { name: g.domain });
  }
}

console.log(DRY ? '\nDry run: nothing changed.' : '\nDone. The next push to main rebuilds both sites with these settings.');
