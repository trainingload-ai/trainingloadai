import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const WINDOWS_ACL_HELPER = fileURLToPath(
  new URL("./private-path-acl.ps1", import.meta.url),
);
const FILESYSTEM_ERROR_CODES = new Set([
  "EACCES",
  "EDQUOT",
  "EIO",
  "EISDIR",
  "ELOOP",
  "ENAMETOOLONG",
  "ENOSPC",
  "ENOTDIR",
  "EPERM",
  "EROFS",
]);

export function isFilesystemErrorCode(code) {
  return FILESYSTEM_ERROR_CODES.has(code);
}

export async function collectPrivateHandleCloseErrors(
  handles,
  dependencies = {},
) {
  const closeHandle =
    dependencies.closeHandle ?? ((candidate) => candidate.close());
  const errors = [];
  for (const handle of handles) {
    if (!handle) continue;
    try {
      await closeHandle(handle);
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

export async function rethrowAfterPrivateHandleCleanup(
  originalError,
  handles,
  dependencies = {},
) {
  const cleanupErrors = await collectPrivateHandleCloseErrors(
    handles,
    dependencies,
  );
  if (cleanupErrors.length) {
    const failure = new AggregateError(
      [...(originalError ? [originalError] : []), ...cleanupErrors],
      originalError
        ? "private file operation failed and handle cleanup was incomplete"
        : "private file handle cleanup was incomplete",
    );
    failure.code =
      cleanupErrors.find((error) => isFilesystemErrorCode(error?.code))?.code ??
      "EIO";
    throw failure;
  }
  if (originalError) throw originalError;
}

export async function rethrowAfterPrivateTemporaryCleanup(
  originalError,
  handle,
  temporaryPath,
  dependencies = {},
) {
  const cleanupErrors = await collectPrivateHandleCloseErrors(
    [handle],
    dependencies,
  );
  try {
    if (dependencies.unlinkTemporary) {
      await dependencies.unlinkTemporary(temporaryPath);
    } else {
      await fs.unlink(temporaryPath);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") cleanupErrors.push(error);
  }
  if (!cleanupErrors.length) throw originalError;
  const failure = new AggregateError(
    [originalError, ...cleanupErrors],
    "private file publication failed and temporary cleanup was incomplete",
  );
  failure.code =
    cleanupErrors.find((error) => isFilesystemErrorCode(error?.code))?.code ??
    "EIO";
  throw failure;
}

function assertKind(kind) {
  if (kind !== "file" && kind !== "directory") {
    throw new TypeError(`unsupported private path kind: ${kind}`);
  }
}

function defaultWindowsRunner(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
  });
}

function parseWindowsAclResult(result, action, path) {
  if (result.error) {
    throw new Error(`Windows ACL helper could not start for ${path}`, {
      cause: result.error,
    });
  }
  const output = String(result.stdout ?? "").trim();
  let report;
  try {
    report = JSON.parse(output);
  } catch (error) {
    throw new Error(`Windows ACL helper returned invalid output for ${path}`, {
      cause: error,
    });
  }
  if (
    typeof report !== "object" ||
    report === null ||
    typeof report.secure !== "boolean" ||
    !Array.isArray(report.violations)
  ) {
    throw new Error(
      `Windows ACL helper returned an invalid report for ${path}`,
    );
  }
  if (result.status !== 0 && !(action === "inspect" && result.status === 4)) {
    throw new Error(
      `Windows ACL helper failed for ${path} (exit ${String(result.status)})`,
    );
  }
  if (action === "harden" && !report.secure) {
    throw new Error(`Windows ACL hardening did not make ${path} private`);
  }
  return {
    secure: report.secure,
    mechanism: "windows-acl",
    details: report,
  };
}

function runWindowsAcl(action, path, kind, runner) {
  const result = runner("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    WINDOWS_ACL_HELPER,
    "-Action",
    action,
    "-LiteralPath",
    path,
    "-Kind",
    kind,
  ]);
  return parseWindowsAclResult(result, action, path);
}

export function posixModeIsPrivate(mode) {
  return (mode & 0o077) === 0;
}

export async function inspectPrivatePath(
  path,
  {
    kind = "file",
    platform = process.platform,
    lstat = fs.lstat,
    windowsRunner = defaultWindowsRunner,
  } = {},
) {
  assertKind(kind);
  if (platform === "win32") {
    return runWindowsAcl("inspect", path, kind, windowsRunner);
  }
  const stat = await lstat(path);
  return {
    secure: posixModeIsPrivate(stat.mode),
    mechanism: "posix-mode",
    details: { mode: stat.mode & 0o777 },
  };
}

export async function hardenPrivatePath(
  path,
  {
    kind = "file",
    mode = kind === "directory" ? 0o700 : 0o600,
    platform = process.platform,
    chmod = fs.chmod,
    windowsRunner = defaultWindowsRunner,
  } = {},
) {
  assertKind(kind);
  if (platform === "win32") {
    return runWindowsAcl("harden", path, kind, windowsRunner);
  }
  await chmod(path, mode);
  return {
    secure: true,
    mechanism: "posix-mode",
    details: { mode },
  };
}
