import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { desktopStartupPalettes } from "./startup-palette.mjs";

const coreRequire = createRequire(new URL("../../client/package.json", import.meta.url));
const colors = readFileSync(coreRequire.resolve("@trainingloadai/design-tokens/desktop.css"), "utf8");
const layout = readFileSync(new URL("../../client/src/app/globals.css", import.meta.url), "utf8");
const css = `${colors}\n${layout}`;

test("startup keeps the Client desktop colors after CSS extraction", () => {
  const { light, dark } = desktopStartupPalettes(css);
  assert.equal(light.background, "#FFFFFF");
  assert.equal(dark.background, "#191919");
  assert.equal(light["desktop-chrome"], "#F0F0F0");
  assert.equal(dark["desktop-chrome"], "#292929");
  assert.equal(light["desktop-workspace-radius"], "14px");
  assert.match(light["tl-font-ui"], /-apple-system/);
  assert.equal(dark["tl-font-ui"], light["tl-font-ui"]);
  assert.equal(dark["desktop-workspace-radius"], light["desktop-workspace-radius"]);
});

test("repeated selectors and declarations follow CSS source order", () => {
  const { light } = desktopStartupPalettes(`${css}\n:root[data-desktop-self-host="true"] {
    --border: first; --border: final;
  }`);
  assert.equal(light.border, "final");
});

test("layout-only CSS cannot silently produce an incomplete startup palette", () => {
  assert.throws(() => desktopStartupPalettes(layout), /Missing Core desktop token/);
  assert.throws(() => desktopStartupPalettes(colors), /Missing Core desktop token.*desktop-workspace-radius/);
});

test("missing dark colors fail instead of inheriting the light palette", () => {
  const missing = css.replace("--background: #191919;", "");
  assert.throws(() => desktopStartupPalettes(missing), /Missing Core desktop token.*--background/);
});
