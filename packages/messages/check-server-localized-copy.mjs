import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLocalizedCopy } from './check-localized-copy.mjs';

const root = dirname(fileURLToPath(import.meta.url));
function leaves(value, prefix = '') {
  if (typeof value === 'string') return [[prefix, value]];
  return Object.entries(value).flatMap(([key, text]) =>
    leaves(text, prefix ? `${prefix}.${key}` : key),
  );
}
const load = async (locale) => new Map(leaves(JSON.parse(await readFile(
  resolve(root, 'server', locale, 'publicRuntime.json'), 'utf8',
))));
const parameters = (value) => (value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) ?? []).sort().join(',');
const en = await load('en');
const locales = (await readdir(resolve(root, 'client-core')))
  .filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5));
for (const locale of locales) {
  const copy = await load(locale);
  assert.deepEqual([...copy.keys()].sort(), [...en.keys()].sort(), `Public runtime keys for ${locale}`);
  for (const [key, value] of copy) {
    assert.ok(value.trim(), `Missing copy for ${locale} ${key}`);
    assert.equal(parameters(value), parameters(en.get(key)), `Public runtime placeholders for ${locale} ${key}`);
  }
}

await checkLocalizedCopy(resolve(root, '../..'), [
  'apps/server/src/api/activity/activity-ai-review.service.ts',
  'apps/server/src/api/ai/athlete-state/coach-assessment-case.service.ts',
  'apps/server/src/api/ai/coach-branching.service.ts',
  'apps/server/src/api/ai/core/tools/presentTrainingVisualization.tool.ts',
  'apps/server/src/api/ai/core/training-exploration.ts',
  'apps/server/src/api/ai/today-suggestion/today-suggestion-orchestrator.service.ts',
  'apps/server/src/review/athlete-state-decision.service.ts',
]);
console.log(`Public runtime copy: PASS (${locales.length} locales, ${en.size} keys)`);
