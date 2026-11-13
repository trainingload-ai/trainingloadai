import { fileURLToPath } from "node:url";
import { checkDocsScreenshots } from "./docs-screenshots.mjs";

const result = await checkDocsScreenshots(
  fileURLToPath(new URL("..", import.meta.url)),
);
if (result.errors.length) {
  console.error(
    `Docs screenshot check failed:\n${result.errors.map((error) => `- ${error}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Docs screenshots: ${result.captures} captures, ${result.images} images, ${result.references} published references verified in light and dark.`,
  );
}
