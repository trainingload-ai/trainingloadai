import { pathToFileURL } from "node:url";

type StartMessage = {
  type: "start";
  entry: string;
  env: Record<string, string>;
};

process.send?.({ type: "ready" });

process.once("message", async (message: StartMessage) => {
  if (message?.type !== "start") {
    process.send?.({ type: "error", code: "DESKTOP_CHILD_INVALID_START" });
    process.exitCode = 1;
    return;
  }

  Object.assign(process.env, message.env);
  try {
    await import(pathToFileURL(message.entry).href);
    process.send?.({ type: "loaded" });
  } catch (error) {
    process.send?.({
      type: "error",
      code: "DESKTOP_CHILD_LOAD_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
});

process.on("disconnect", () => {
  process.kill(process.pid, "SIGTERM");
});
