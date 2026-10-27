// Fails when the JavaScript a player downloads before first paint exceeds the budget.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET = 1_572_864; // 1.5 MiB gzip
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));

const seen = new Set();
function collect(key) {
  const chunk = manifest[key];
  if (!chunk || seen.has(key)) return;
  seen.add(key);
  for (const dep of chunk.imports ?? []) collect(dep);
}
collect('index.html');

let total = 0;
const rows = [];
for (const key of seen) {
  const file = manifest[key].file;
  if (!file.endsWith('.js')) continue;
  const size = gzipSync(readFileSync(`dist/${file}`), { level: 9 }).length;
  total += size;
  rows.push([file, size]);
}
for (const [file, size] of rows)
  console.log(`${(size / 1024).toFixed(1).padStart(8)} KiB  ${file}`);
console.log(`${(total / 1024).toFixed(1).padStart(8)} KiB  total initial JS (budget 1536 KiB)`);
if (total > BUDGET) {
  console.error('Initial JavaScript is over budget.');
  process.exit(1);
}
