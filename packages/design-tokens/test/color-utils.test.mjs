import assert from 'node:assert/strict';
import test from 'node:test';
import { toRgb, withAlpha } from '../dist/native.js';

test('configured colors support native, map and canvas alpha without a second palette', () => {
  assert.equal(withAlpha('#123456', 0.5), 'rgba(18,52,86,0.5)');
  assert.equal(withAlpha('#fff', 0), 'rgba(255,255,255,0)');
  assert.equal(withAlpha('#12345680', 0.5), `rgba(18,52,86,${128 / 255 * 0.5})`);
  assert.equal(withAlpha('#000000', -1), 'rgba(0,0,0,0)');
  assert.equal(withAlpha('#000000', 2), 'rgba(0,0,0,1)');
  assert.deepEqual(toRgb('#abc'), { r: 170, g: 187, b: 204, a: 1 });
  assert.throws(() => toRgb('not a configured color'), TypeError);
});
