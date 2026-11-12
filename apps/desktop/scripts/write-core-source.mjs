import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { desktop, validateCoreSource } from "./core-path.mjs";

const source = validateCoreSource();
mkdirSync(join(desktop, "dist"), { recursive: true });
writeFileSync(
  join(desktop, "dist/core-source.json"),
  JSON.stringify(source, null, 2) + "\n",
);
