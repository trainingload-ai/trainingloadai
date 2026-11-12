import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { desktop } from "./core-path.mjs";
import { resolveDesktopRuntimeEntries } from "../dist/runtime/runtime-entry.js";

const entries = await resolveDesktopRuntimeEntries(desktop);
if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ ok: true, ...entries }));
} else {
  const executable = createRequire(join(desktop, "package.json"))("electron");
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    executable,
    [
      join(desktop, "dist/main.js"),
      ...process.argv.slice(2).filter((argument) => argument !== "--"),
    ],
    {
      cwd: desktop,
      env: environment,
      stdio: "inherit",
    },
  );
  child.once("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
}
