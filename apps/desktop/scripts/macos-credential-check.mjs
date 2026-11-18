import { execFileSync, spawnSync } from "node:child_process";
import {
  constants,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Exercise the actual signed executable and OS Keychain, without mocks or
 * access to a user's normal profile. A password prompt blocks the child and
 * therefore fails the bounded check instead of being silently accepted.
 */
export async function checkMacCredentialAccess(app, { identity, keychain }) {
  const temporary = mkdtempSync(
    join(tmpdir(), "trainingload-signed-credentials-"),
  );
  const profile = join(temporary, "profile");
  const relocated = join(temporary, "Trainingload.ai.app");
  const run = (command, args) =>
    execFileSync(command, args, {
      stdio: "pipe",
      timeout: 30_000,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => name !== "ELECTRON_RUN_AS_NODE",
        ),
      ),
    });
  const verify = (bundle, phase) => {
    rmSync(join(profile, "credential-check-report.json"), { force: true });
    try {
      run(join(bundle, "Contents/MacOS/Trainingload.ai"), [
        `--user-data-dir=${profile}`,
        `--credential-check=${phase}`,
      ]);
    } catch (error) {
      let reason = error.code === "ETIMEDOUT" ? "TIMEOUT" : "NATIVE_EXIT";
      const report = join(profile, "credential-check-report.json");
      if (existsSync(report)) {
        try {
          const code = JSON.parse(readFileSync(report, "utf8")).error?.code;
          if (typeof code === "string" && /^[A-Z_]{1,80}$/.test(code))
            reason = code;
        } catch {
          /* Keep a non-sensitive fallback reason. */
        }
      }
      // No native logs, credentials or system dialog content in release reports.
      throw new Error(
        `DESKTOP_MAC_CREDENTIAL_CHECK_FAILED: ${phase} ${reason}`,
      );
    }
    if (!existsSync(join(profile, "credential-check-report.json")))
      throw new Error(
        `DESKTOP_MAC_CREDENTIAL_CHECK_FAILED: ${phase} MISSING_REPORT`,
      );
    const result = JSON.parse(
      readFileSync(join(profile, "credential-check-report.json"), "utf8"),
    );
    if (result.ok !== true || result.phase !== phase)
      throw new Error("DESKTOP_MAC_CREDENTIAL_CHECK_FAILED: invalid result");
  };
  const designatedRequirement = (bundle) => {
    const result = spawnSync("codesign", ["-d", "-r-", bundle], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (result.status !== 0)
      throw new Error(
        "DESKTOP_MAC_CREDENTIAL_IDENTITY_INVALID: cannot read signed application identity",
      );
    return (
      `${result.stdout}\n${result.stderr}`
        .split(/\r?\n/)
        .find((line) => line.startsWith("designated => ")) ?? ""
    );
  };
  try {
    verify(app, "create");
    verify(app, "reopen");
    cpSync(app, relocated, {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
    });
    verify(relocated, "reopen");
    const originalRequirement = designatedRequirement(app);
    run("/usr/libexec/PlistBuddy", [
      "-c",
      "Set :CFBundleVersion 2.0.0",
      join(relocated, "Contents/Info.plist"),
    ]);
    run("codesign", [
      "--force",
      "--sign",
      identity,
      "--keychain",
      keychain,
      "--options",
      "runtime",
      "--preserve-metadata=entitlements",
      "--timestamp",
      relocated,
    ]);
    run("codesign", ["--verify", "--deep", "--strict", relocated]);
    if (
      !originalRequirement ||
      designatedRequirement(relocated) !== originalRequirement
    )
      throw new Error(
        "DESKTOP_MAC_CREDENTIAL_IDENTITY_CHANGED: signed builds must share a designated requirement",
      );
    verify(relocated, "reopen");
    const vaultPath = join(profile, "credential-check/vault.json");
    const before = readFileSync(vaultPath);
    run("codesign", [
      "--force",
      "--sign",
      "-",
      "--options",
      "runtime",
      "--preserve-metadata=entitlements",
      relocated,
    ]);
    let rejected = false;
    // Exercise the exact startup admission check without executing an ad-hoc
    // Mach-O whose hardened runtime may reject its signed framework first.
    const { assertMacReleaseIdentity } =
      await import("../dist/runtime/mac-release-identity.js");
    try {
      await assertMacReleaseIdentity(
        join(relocated, "Contents/MacOS/Trainingload.ai"),
      );
    } catch (error) {
      rejected = error.code === "DESKTOP_MAC_SIGNATURE_REQUIRED";
    }
    if (!rejected || !readFileSync(vaultPath).equals(before)) {
      throw new Error(
        "DESKTOP_MAC_UNSIGNED_ACCESS: an ad-hoc build must be rejected before accessing credentials",
      );
    }
    return {
      ok: true,
      checks: [
        "create",
        "restart",
        "relocate",
        "signed-upgrade",
        "reject-ad-hoc",
      ],
    };
  } finally {
    spawnSync(
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
      ["-u", relocated],
      { stdio: "ignore", timeout: 10_000 },
    );
    rmSync(temporary, { recursive: true, force: true });
  }
}
