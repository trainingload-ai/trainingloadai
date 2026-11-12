import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test(
  "the installed macOS signer scans large dependency trees within 64 file descriptors",
  { skip: process.platform === "win32" },
  () => {
    const require = createRequire(import.meta.url);
    const builder = createRequire(require.resolve("electron-builder"));
    const appBuilder = createRequire(builder.resolve("app-builder-lib"));
    const signer = appBuilder.resolve("@electron/osx-sign");
    const directory = mkdtempSync(join(tmpdir(), "desktop-signing-walk-"));
    const expected = [];
    const write = (relative, contents) => {
      const file = join(directory, relative);
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, contents);
      return file;
    };
    try {
      for (let group = 0; group < 24; group++) {
        for (let file = 0; file < 64; file++)
          write(`Resources/pkg-${group}/module-${file}.js`, "export default 1;\n");
        if (group % 8 === 0)
          expected.push(
            write(`Resources/pkg-${group}/binding.node`, Buffer.from([0, 1, 2, 3])),
          );
      }
      const framework = join(directory, "Frameworks/Example.framework");
      const executable = write(
        "Frameworks/Example.framework/Versions/A/Example",
        Buffer.from([0, 1, 2, 3]),
      );
      expected.push(executable, framework);
      const temporary = write("Resources/leftover.cstemp", "temporary signature");
      const child = spawnSync(
        "/bin/sh",
        [
          "-c",
          'ulimit -n 64; exec "$@"',
          "desktop-signing-walk",
          process.execPath,
          "-e",
          "require(process.argv[1]).walkAsync(process.argv[2]).then(paths => console.log(JSON.stringify(paths))).catch(error => { console.error(error); process.exitCode = 1; });",
          signer,
          directory,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(child.status, 0, child.stderr || String(child.error));
      const paths = JSON.parse(child.stdout);
      assert.deepEqual([...paths].sort(), expected.sort());
      assert.ok(paths.indexOf(executable) < paths.indexOf(framework));
      assert.equal(existsSync(temporary), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
