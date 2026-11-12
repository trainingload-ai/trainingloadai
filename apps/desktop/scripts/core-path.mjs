import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readCoreSource,
  selectCoreSource,
} from "../src/runtime/core-source.mjs";

export const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const selected = selectCoreSource(desktop);
export const coreRelease = selected.release;
export const core = selected.directory;
export const validateCoreSource = (requireBuild = false) =>
  readCoreSource(desktop, { requireBuild });
