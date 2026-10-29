import assert from "node:assert/strict";
import test from "node:test";

import { chartColors } from "../src/tokens.mjs";
import { colors, motion, radii } from "../src/tokens.mjs";

function luminance(hex) {
  const channels = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("normal text color pairs satisfy WCAG AA", () => {
  assert.ok(contrast(colors.light.foreground, colors.light.background) >= 4.5);
  assert.ok(
    contrast(colors.light.mutedForeground, colors.light.background) >= 4.5,
  );
  assert.ok(contrast(colors.dark.foreground, colors.dark.background) >= 4.5);
  assert.ok(
    contrast(colors.dark.mutedForeground, colors.dark.background) >= 4.5,
  );
  assert.ok(contrast(colors.light.brandForeground, colors.light.brand) >= 4.5);
  assert.ok(contrast(colors.dark.brandForeground, colors.dark.brand) >= 4.5);
});

test("product radii stay compact while overlays remain distinct", () => {
  assert.ok(radii.compact < radii.control);
  assert.ok(radii.control <= 8);
  assert.ok(radii.control < radii.surface);
  assert.ok(radii.surface < radii.overlay);
  assert.ok(radii.overlay < radii.feature);
  assert.ok(radii.feature <= 20);
});

test("training chart colors remain separate from the brand token", () => {
  assert.notEqual(chartColors.actual, colors.light.brand);
  assert.notEqual(chartColors.planned, colors.light.brand);
  assert.notEqual(chartColors.fatigue, colors.light.brand);
  assert.notEqual(chartColors.form, colors.light.brand);
});

test("motion tokens use practical interface durations", () => {
  assert.ok(motion.fast >= 80 && motion.fast <= 160);
  assert.ok(motion.standard >= motion.fast && motion.standard <= 240);
  assert.ok(motion.page <= 300);
});
