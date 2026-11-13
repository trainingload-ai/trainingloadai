import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Unsigned/ad-hoc packaged copies must not open the release database or
 * request its Keychain key. Source development retains Electron's namespace.
 */
export async function assertMacReleaseIdentity(executable: string) {
  try {
    await promisify(execFile)(
      "/usr/bin/codesign",
      [
        "--verify",
        "--strict",
        "--test-requirement",
        '=identifier "ai.trainingload.personal" and anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists',
        executable,
      ],
      { timeout: 15_000, killSignal: "SIGKILL" },
    );
  } catch {
    throw Object.assign(
      new Error(
        "Packaged macOS apps require a valid Developer ID Application signature",
      ),
      { code: "DESKTOP_MAC_SIGNATURE_REQUIRED" },
    );
  }
}
