import { execFileSync } from "node:child_process";

/** Retry only Apple's observed connection-loss error, never an invalid ticket. */
export async function runMacStapler(
  action,
  file,
  {
    execute = execFileSync,
    wait = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    log = console.log,
  } = {},
) {
  if (!["staple", "validate"].includes(action))
    throw new Error("Only staple and validate support ticket retries");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const output = execute("xcrun", ["stapler", action, file], {
        encoding: "utf8",
        stdio: "pipe",
      });
      if (output) log(output.trimEnd());
      return output;
    } catch (error) {
      const connectionLost =
        error?.status === 68 &&
        /NSURLErrorDomain\s+Code=-1005\b/.test(
          `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
        );
      if (!connectionLost || attempt === 3) {
        for (const output of [error?.stdout, error?.stderr])
          if (output?.length) log(String(output).trimEnd());
        throw error;
      }
      const delayMs = attempt * 10_000;
      log(
        JSON.stringify({
          step: "retry Apple ticket transport",
          action,
          attempt: attempt + 1,
          delayMs,
        }),
      );
      await wait(delayMs);
    }
  }
}
