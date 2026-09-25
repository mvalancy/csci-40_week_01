// npm run new <slug> ["Title"]  → apps/<slug>/ (page, code, meta, test)
import { cpSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

const slug = process.argv[2];
const title = process.argv[3] || slug?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('usage: npm run new <kebab-case-name> ["Pretty Title"]');
  process.exit(1);
}
const dir = `apps/${slug}`;
if (existsSync(dir)) {
  console.error(`${dir} already exists — pick another name (another agent may own it)`);
  process.exit(1);
}

cpSync('apps/_template', dir, { recursive: true });
writeFileSync(`${dir}/meta.json`, JSON.stringify({ title, description: 'Describe me!', emoji: '🚀', owner: process.env.OWNER || 'student' }, null, 2) + '\n');
writeFileSync(`${dir}/index.html`, readFileSync(`${dir}/index.html`, 'utf8').replaceAll('Starter Scene', title));
renameSync(`${dir}/_template.spec.js`, `${dir}/${slug}.spec.js`);
writeFileSync(
  `${dir}/${slug}.spec.js`,
  readFileSync(`${dir}/${slug}.spec.js`, 'utf8')
    .replace(/^\/\/ Template test.*\n/, '')
    .replaceAll('/apps/_template/', `/apps/${slug}/`)
    .replace('starter scene renders and reacts to clicks', `${title} works`)
);

console.log(`✔ created ${dir}/
  open:  npm run dev  → http://localhost:5173/apps/${slug}/
  test:  npm run test ${slug}
  watch: npm run show ${slug}`);
