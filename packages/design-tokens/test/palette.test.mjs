import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { palette, paletteHsl } from "../src/palette.mjs";
import { palette as nativePalette } from "../dist/native.js";
import { colors } from "../src/tokens.mjs";

test("Client primitive colors retain the deployed HSL scales", () => {
  assert.equal(paletteHsl["violet-500"], "258.3 89.5% 66.3%");
  assert.equal(palette["violet-500"], "#8B5CF6");
  assert.equal(palette["sky-500"], "#0EA5E9");
  assert.equal(palette["emerald-500"], "#10B981");
  assert.equal(palette["neutral-200"], "#E5E5E5");
  assert.equal(colors.light.surface, palette["neutral-100"]);
});

test("Web, NativeWind and native drawing expose the same primitive palette", () => {
  const web = readFileSync(new URL("../dist/web.css", import.meta.url), "utf8");
  const nativewind = readFileSync(new URL("../dist/palette.css", import.meta.url), "utf8");
  assert.deepEqual(nativePalette, palette);
  for (const [name, hsl] of Object.entries(paletteHsl)) {
    assert.ok(web.includes(`--${name}: ${hsl};`), `${name}: legacy Client HSL variable`);
    assert.ok(nativewind.includes(`--color-${name}: ${palette[name]};`), `${name}: NativeWind override`);
  }
  const globals = readFileSync(new URL("../../../apps/client/src/app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(globals, /--(?:slate|neutral|sky|emerald|violet)-\d+:/, "Client must not fork its primitive scales from the shared source");
});
