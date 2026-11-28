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

const project = resolve(root, '../..');
const { checkLocalizedCopy } = await import('./check-localized-copy.mjs');
await checkLocalizedCopy(project, [
  'apps/client/src/components/health/HealthMetricMiniChart.tsx',
  'apps/client/src/components/health/HealthOverviewSection.tsx',
  'apps/client/src/components/health/health-overview-model.ts',
  'apps/client/src/app/[locale]/(main)/calendar/components/CalendarGrid.tsx',
  'apps/client/src/app/[locale]/(main)/calendar/components/CalendarStage.tsx',
  'apps/client/src/i18n/request.ts',
  'apps/client/src/components/third-party/personal-connection-dialog.tsx',
]);

function stringLeaves(value, path = '') {
  if (typeof value === 'string') return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) =>
    stringLeaves(child, path ? `${path}.${key}` : key),
  );
}
const parameters = (value) => (value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) ?? []).sort().join(',');
const clientEnglish = JSON.parse(await readFile(resolve(root, 'client-core/en.json'), 'utf8'));
const healthEnglish = new Map(stringLeaves(clientEnglish.HealthOverview));
const personalEnglish = new Map(stringLeaves(JSON.parse(await readFile(resolve(root, 'personal-integrations/en.json'), 'utf8'))));
for (const file of (await readdir(resolve(root, 'client-core'))).filter((file) => file.endsWith('.json'))) {
  const client = JSON.parse(await readFile(resolve(root, 'client-core', file), 'utf8'));
  const personal = new Map(stringLeaves(JSON.parse(await readFile(resolve(root, 'personal-integrations', file), 'utf8'))));
  for (const key of ['garmin.description', 'coros.description', 'manage', 'account', 'lastSync', 'sync']) {
    if (!personal.has(key)) throw new Error(`${file}: missing personal integration message ${key}`);
  }
  for (const [localized, english] of [[stringLeaves(client.HealthOverview), healthEnglish], [personal, personalEnglish]]) {
    for (const [key, value] of localized) {
      if (!english.has(key) || parameters(english.get(key)) !== parameters(value)) {
        throw new Error(`${file}: message placeholders do not match for ${key}`);
      }
    }
  }
}
