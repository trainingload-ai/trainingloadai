import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(await readFile(resolve(root, 'client-baseline.json'), 'utf8'));
function leaves(value, path = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [path];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
}
const english = new Set(leaves(JSON.parse(await readFile(resolve(root, 'client-core/en.json'), 'utf8'))));
const errors = [];
let count = 0;
for (const file of (await readdir(resolve(root, 'client-core'))).filter(file => file.endsWith('.json'))) {
  const locale = file.slice(0, -5);
  const value = JSON.parse(await readFile(resolve(root, 'client-core', file), 'utf8'));
  const present = new Set(leaves(value));
  const allowed = new Set(baseline.allowedMissing[locale] ?? []);
  for (const key of english) if (!present.has(key) && !allowed.has(key)) errors.push(`${locale}: new missing key ${key}`);
  count++;
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Public messages: PASS (${count} locales, English fallback, no new missing keys)`);
