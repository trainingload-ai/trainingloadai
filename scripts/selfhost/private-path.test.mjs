import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectPrivateHandleCloseErrors,
  hardenPrivatePath,
  inspectPrivatePath,
  rethrowAfterPrivateHandleCleanup,
  rethrowAfterPrivateTemporaryCleanup,
  posixModeIsPrivate,
} from "./private-path.mjs";

test("private handle cleanup attempts every close and preserves every failure", async () => {
  const primary = Object.assign(new Error("read failed"), {
    code: "EINVAL",
  });
  const firstFailure = Object.assign(new Error("input close failed"), {
    code: "EACCES",
  });
  const secondFailure = Object.assign(new Error("output close failed"), {
    code: "EIO",
  });
  const handles = [{ id: "input" }, null, { id: "output" }];
  const calls = [];
  const closeHandle = async (handle) => {
    calls.push(handle.id);
    throw handle.id === "input" ? firstFailure : secondFailure;
  };

  assert.deepEqual(
    await collectPrivateHandleCloseErrors(handles, { closeHandle }),
    [firstFailure, secondFailure],
  );
  await assert.rejects(
    rethrowAfterPrivateHandleCleanup(primary, handles, { closeHandle }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.equal(error.code, "EACCES");
      assert.deepEqual(error.errors, [primary, firstFailure, secondFailure]);
      return true;
    },
  );
  assert.deepEqual(calls, ["input", "output", "input", "output"]);

  await assert.rejects(
    rethrowAfterPrivateHandleCleanup(primary, [{}], {
      closeHandle: async () => undefined,
    }),
    (error) => error === primary,
  );
});

test("private temporary cleanup preserves the primary error and exposes cleanup failure", async () => {
  const primary = Object.assign(new Error("publish failed"), {
    code: "EEXIST",
  });
  await assert.rejects(
    rethrowAfterPrivateTemporaryCleanup(primary, null, "/private/test.tmp", {
      unlinkTemporary: async () => {
        const error = new Error("already absent");
        error.code = "ENOENT";
        throw error;
      },
    }),
    (error) => error === primary,
  );

  const closeFailure = Object.assign(new Error("close failed"), {
    code: "ERR_CLOSE_FAILED",
  });
  const unlinkFailure = Object.assign(new Error("unlink failed"), {
    code: "EACCES",
  });
  await assert.rejects(
    rethrowAfterPrivateTemporaryCleanup(primary, {}, "/private/test.tmp", {
      closeHandle: async () => {
        throw closeFailure;
      },
      unlinkTemporary: async () => {
        throw unlinkFailure;
      },
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.equal(error.code, "EACCES");
      assert.deepEqual(error.errors, [primary, closeFailure, unlinkFailure]);
      return true;
    },
  );
});

test("POSIX private path policy rejects every group or other permission", async () => {
  assert.equal(posixModeIsPrivate(0o100600), true);
  assert.equal(posixModeIsPrivate(0o040700), true);
  assert.equal(posixModeIsPrivate(0o100640), false);
  assert.equal(posixModeIsPrivate(0o040701), false);

  const report = await inspectPrivatePath("/private/config", {
    platform: "linux",
    lstat: async () => ({ mode: 0o100640 }),
  });
  assert.deepEqual(report, {
    secure: false,
    mechanism: "posix-mode",
    details: { mode: 0o640 },
  });
});

test("POSIX hardening uses the requested exact mode", async () => {
  const calls = [];
  const report = await hardenPrivatePath("/private/data", {
    kind: "directory",
    platform: "darwin",
    chmod: async (...args) => calls.push(args),
  });
  assert.deepEqual(calls, [["/private/data", 0o700]]);
  assert.equal(report.secure, true);
});

test("Windows ACL inspection passes the literal path as a separate argument", async () => {
  const calls = [];
  const path = "C:\\Users\\Athlete & Coach\\.env.selfhost";
  const report = await inspectPrivatePath(path, {
    platform: "win32",
    windowsRunner: (command, args) => {
      calls.push({ command, args });
      return {
        status: 4,
        stdout: JSON.stringify({
          secure: false,
          violations: ["inheritance-enabled"],
        }),
        stderr: "",
      };
    },
  });
  assert.equal(report.secure, false);
  assert.equal(calls[0].command, "powershell.exe");
  assert.equal(
    calls[0].args.at(calls[0].args.indexOf("-LiteralPath") + 1),
    path,
  );
  assert.equal(calls[0].args.includes(path), true);
  assert.equal(
    calls[0].args.find((argument) => argument.includes("$LiteralPath")),
    undefined,
  );
});

test("Windows ACL hardening requires a secure postcondition", async () => {
  const calls = [];
  const report = await hardenPrivatePath("C:\\selfhost\\data", {
    kind: "directory",
    platform: "win32",
    windowsRunner: (command, args) => {
      calls.push({ command, args });
      return {
        status: 0,
        stdout: JSON.stringify({ secure: true, violations: [] }),
        stderr: "",
      };
    },
  });
  assert.equal(report.mechanism, "windows-acl");
  assert.equal(
    calls[0].args.at(calls[0].args.indexOf("-Action") + 1),
    "harden",
  );

  await assert.rejects(
    hardenPrivatePath("C:\\selfhost\\data", {
      kind: "directory",
      platform: "win32",
      windowsRunner: () => ({
        status: 4,
        stdout: JSON.stringify({ secure: false, violations: ["broad"] }),
        stderr: "",
      }),
    }),
    /ACL helper failed/,
  );
});
