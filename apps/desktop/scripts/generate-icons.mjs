import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDesktopIcons } from "../../../scripts/brand-assets.mjs";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await generateDesktopIcons(path.join(directory, "assets"));
console.log("Generated Desktop icons from the shared glass TL master.");
