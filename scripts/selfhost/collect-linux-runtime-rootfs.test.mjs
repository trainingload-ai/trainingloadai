import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLddOutput,
  selectDpkgStatus,
} from "./collect-linux-runtime-rootfs.mjs";

test("parses mapped and direct ldd dependencies", () => {
  assert.deepEqual(
    parseLddOutput(`
      linux-vdso.so.1 (0x0000ffff)
      libssl.so.3 => /lib/aarch64-linux-gnu/libssl.so.3 (0x0000ffff)
      /lib/ld-linux-aarch64.so.1 (0x0000ffff)
    `).sort(),
    ["/lib/aarch64-linux-gnu/libssl.so.3", "/lib/ld-linux-aarch64.so.1"],
  );
});

test("rejects unresolved libraries", () => {
  assert.throws(
    () => parseLddOutput("libmissing.so.1 => not found"),
    /unresolved dynamic library/,
  );
});

test("keeps only runtime packages in the dpkg inventory", () => {
  const status = `Package: libc6
Version: 1

Package: binutils
Version: 2

Package: ca-certificates
Version: 3
`;
  const selected = selectDpkgStatus(status, ["libc6", "ca-certificates"]);
  assert.match(selected, /Package: libc6/);
  assert.match(selected, /Package: ca-certificates/);
  assert.doesNotMatch(selected, /Package: binutils/);
});
