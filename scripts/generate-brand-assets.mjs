import path from "node:path";
import { generateDesktopIcons, generateWebAssets, repositoryDirectory } from "./brand-assets.mjs";

await generateWebAssets();
await generateDesktopIcons(path.join(repositoryDirectory, "apps/desktop/assets"));
console.log("Generated Web, Docs and Desktop brand assets from the approved glass TL master.");
