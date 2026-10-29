import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCatalogs } from './catalog.mjs';

test('merges disjoint leaves while preserving Core input', () => {
  const core = { account: { name: 'Name' } };
  assert.deepEqual(mergeCatalogs(core, { account: { billing: 'Billing' } }), {
    account: { name: 'Name', billing: 'Billing' },
  });
  assert.deepEqual(core, { account: { name: 'Name' } });
});
test('rejects duplicate leaves and object/leaf conflicts', () => {
  assert.throws(() => mergeCatalogs({ a: { b: 'Core' } }, { a: { b: 'Managed' } }), /a.b/);
  assert.throws(() => mergeCatalogs({ a: 'Core' }, { a: { b: 'Managed' } }), /Duplicate message leaf: a/);
});
test('rejects prototype pollution keys', () => {
  assert.throws(() => mergeCatalogs({}, JSON.parse('{"__proto__":{"x":1}}')), /Unsafe catalog key/);
});
