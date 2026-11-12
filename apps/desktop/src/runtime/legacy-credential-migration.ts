import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

/** Explicit, one-time development-profile migration. The supplied executable
 * must be the original trusted Electron runtime, never an auto-downloaded app.
 */
export async function readLegacyCredentials(
  executable: string,
  reader: string,
) {
  if (!isAbsolute(executable))
    throw new Error("Legacy Electron path must be absolute");
  return new Promise<{ authSecret: string; integrationSecret: string }>(
    (resolve, reject) => {
      const child = spawn(executable, [reader], {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          USERPROFILE: process.env.USERPROFILE,
          APPDATA: process.env.APPDATA,
          LOCALAPPDATA: process.env.LOCALAPPDATA,
          SYSTEMROOT: process.env.SYSTEMROOT,
          TMPDIR: process.env.TMPDIR,
          TEMP: process.env.TEMP,
        },
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Legacy credential migration timed out"));
      }, 60_000);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(
          new Error("Legacy credential migration did not return credentials"),
        );
      });
      child.on(
        "message",
        (message: {
          type?: string;
          authSecret?: string;
          integrationSecret?: string;
        }) => {
          clearTimeout(timeout);
          if (
            message.type !== "credentials" ||
            !message.authSecret ||
            !message.integrationSecret
          ) {
            reject(
              new Error(
                "Legacy credentials could not be read with the original runtime",
              ),
            );
            return;
          }
          resolve({
            authSecret: message.authSecret,
            integrationSecret: message.integrationSecret,
          });
        },
      );
    },
  );
}
