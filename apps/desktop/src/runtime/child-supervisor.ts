import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname } from "node:path";

export interface SupervisedChildOptions {
  name: string;
  bootstrap: string;
  entry: string;
  env: Record<string, string>;
  maximumRestarts?: number;
}

export class ChildSupervisor extends EventEmitter {
  private child?: ChildProcess;
  private stopping = false;
  private restartCount = 0;

  constructor(private readonly options: SupervisedChildOptions) {
    super();
  }

  start(): void {
    this.stopping = false;
    this.spawn();
  }

  private spawn(): void {
    const child = fork(this.options.bootstrap, [], {
      cwd: dirname(this.options.entry),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        APPDATA: process.env.APPDATA,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TMPDIR: process.env.TMPDIR,
        TEMP: process.env.TEMP,
        LANG: process.env.LANG,
        NODE_ENV: "production",
      },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    this.child = child;

    child.on("message", (message: { type?: string }) => {
      if (message?.type === "ready") {
        child.send({
          type: "start",
          entry: this.options.entry,
          env: this.options.env,
        });
      } else if (message?.type === "loaded") {
        this.emit("loaded");
      } else if (message?.type === "error") {
        this.emit("child-error", message);
      }
    });

    child.once("exit", (code, signal) => {
      this.child = undefined;
      if (this.stopping) return;
      const maximumRestarts = this.options.maximumRestarts ?? 2;
      if (this.restartCount >= maximumRestarts) {
        this.emit("failed", { code, signal, name: this.options.name });
        return;
      }
      this.restartCount += 1;
      setTimeout(() => this.spawn(), 250 * this.restartCount).unref();
    });
  }

  async stop(timeoutMs = 5_000): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child || child.exitCode !== null) return;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, timeoutMs);
      timeout.unref();
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }
}
