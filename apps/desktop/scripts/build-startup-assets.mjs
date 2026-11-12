import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { core, desktop, validateCoreSource } from "./core-path.mjs";
validateCoreSource();

// Keep the pre-server window aligned with the exact Core release being bundled.
const css = readFileSync(join(core, "apps/client/src/app/globals.css"), "utf8");
const properties = [
  "background",
  "foreground",
  "muted-foreground",
  "border",
  "desktop-chrome",
  "desktop-workspace-radius",
  "tl-font-ui",
];
function palette(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing Core desktop palette: ${selector}`);
  const body = css.slice(start + selector.length + 2, css.indexOf("}", start));
  return Object.fromEntries(
    properties
      .map((name) => {
        const value = body
          .match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]
          ?.trim();
        // Dark mode inherits the UI font and radius from the base palette.
        if (
          !value &&
          !["tl-font-ui", "desktop-workspace-radius"].includes(name)
        )
          throw new Error(`Missing Core desktop token: ${selector} --${name}`);
        return [name, value];
      })
      .filter(([, value]) => value),
  );
}
const light = palette(':root[data-desktop-self-host="true"]');
const dark = {
  ...light,
  ...palette(':root.dark[data-desktop-self-host="true"]'),
};
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
