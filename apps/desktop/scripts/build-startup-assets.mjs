import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { core, desktop, validateCoreSource } from "./core-path.mjs";
import { desktopStartupPalettes } from "./startup-palette.mjs";
validateCoreSource();

// Keep the pre-server window aligned with the exact Core release being bundled.
const coreRequire = createRequire(join(core, "apps/client/package.json"));
const css = [
  readFileSync(coreRequire.resolve("@trainingloadai/design-tokens/desktop.css"), "utf8"),
  readFileSync(join(core, "apps/client/src/app/globals.css"), "utf8"),
].join("\n");
const { light, dark } = desktopStartupPalettes(css);
const spinner = readFileSync(
  join(core, "apps/client/src/components/icons/spinner.tsx"),
  "utf8",
).match(/<path d="([^"]+)"/)?.[1];
if (!spinner) throw new Error("Missing Core loading spinner");
const output = join(desktop, "dist/assets");
mkdirSync(output, { recursive: true });
writeFileSync(
  join(output, "startup.json"),
  JSON.stringify({ light, dark, spinner }) + "\n",
);
