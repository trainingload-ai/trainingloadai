import { existsSync } from "node:fs";

const repositoryRoot = new URL("../", import.meta.url);

if (
  process.env.CI ||
  process.env.NODE_ENV === "production" ||
  !existsSync(new URL(".git", repositoryRoot))
) {
  process.exit(0);
}

const husky = (await import("husky")).default;
const message = husky();

if (message) {
  console.log(message);
}
