import { NativeI18n, type Translate } from "./native-i18n.js";

type UpdatePrompt = {
  type: "info" | "error";
  title: string;
  message: string;
  detail?: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
};

export interface DesktopUpdateEngine {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  checkForUpdates(): Promise<{
    isUpdateAvailable: boolean;
    updateInfo: { version: string };
  } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(silent?: boolean, forceRunAfter?: boolean): void;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(
    event: "download-progress",
    listener: (progress: { percent: number }) => void,
  ): unknown;
}

export class DesktopUpdater {
  private busy: Promise<void> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private initialTimer?: ReturnType<typeof setTimeout>;
  private downloadedVersion: string | null = null;
  private notifiedVersion: string | null = null;

  constructor(
    private readonly options: {
      packaged: boolean;
      configured: boolean;
      currentVersion: string;
      translate?: Translate;
      updater: DesktopUpdateEngine;
      prompt: (options: UpdatePrompt) => Promise<number>;
      beforeInstall: () => Promise<void>;
      setProgress: (progress: number) => void;
    },
  ) {
    const updater = options.updater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    // Handle the library's error event as well as its rejected promises.
    updater.on("error", () =>
      console.error(
        JSON.stringify({
          ok: false,
          error: { code: "DESKTOP_UPDATE_ENGINE_ERROR" },
        }),
      ),
    );
    updater.on("download-progress", ({ percent }) =>
      options.setProgress(Math.max(0, Math.min(1, percent / 100))),
    );
  }

  private t: Translate = (key, values = {}) =>
    (this.options.translate ?? new NativeI18n().t)(key, {
      app: "Trainingload.ai",
      ...values,
    });

  start() {
    if (!this.options.packaged || !this.options.configured || this.timer)
      return;
    this.initialTimer = setTimeout(() => void this.check(false), 30_000);
    this.initialTimer.unref();
    this.timer = setInterval(() => void this.check(false), 4 * 60 * 60 * 1000);
    this.timer.unref();
  }

  stop() {
    clearTimeout(this.initialTimer);
    clearInterval(this.timer);
    this.timer = undefined;
  }

  check(manual: boolean): Promise<void> {
    if (this.busy) return this.busy;
    this.busy = this.runCheck(manual).finally(() => {
      this.busy = null;
    });
    return this.busy;
  }

  private async show(
    message: string,
    detail: string,
    type: "info" | "error" = "info",
  ) {
    await this.options.prompt({
      type,
      title: this.t("updateTitle"),
      message,
      detail,
      buttons: [this.t("ok")],
      defaultId: 0,
      cancelId: 0,
    });
  }

  private async offerInstall() {
    const response = await this.options.prompt({
      type: "info",
      title: this.t("updateTitle"),
      message: this.t("downloaded", { version: this.downloadedVersion! }),
      detail: this.t("installDetail"),
      buttons: [this.t("later"), this.t("install")],
      defaultId: 1,
      cancelId: 0,
    });
    if (response !== 1) return;
    // Flush the embedded database and stop its child services before replacement.
    await this.options.beforeInstall();
    this.options.updater.quitAndInstall(false, true);
  }

  private async runCheck(manual: boolean) {
    let userStartedDownload = false;
    try {
      if (!this.options.packaged || !this.options.configured) {
        if (manual)
          await this.show(
            this.t("updateUnsupported"),
            !this.options.packaged
              ? this.t("previewUpdateDetail", {
                  version: this.options.currentVersion,
                })
              : this.t("unconfiguredUpdate"),
          );
        return;
      }
      if (this.downloadedVersion) {
        if (manual) await this.offerInstall();
        return;
      }
      const result = await this.options.updater.checkForUpdates();
      if (!result) {
        if (manual)
          await this.show(this.t("updateUnavailable"), this.t("retryLater"));
        return;
      }
      if (!result.isUpdateAvailable) {
        if (manual)
          await this.show(
            this.t("upToDate"),
            this.t("currentVersion", { version: this.options.currentVersion }),
          );
        return;
      }
      const version = result.updateInfo.version;
      if (!manual && this.notifiedVersion === version) return;
      this.notifiedVersion = version;
      const response = await this.options.prompt({
        type: "info",
        title: this.t("updateTitle"),
        message: this.t("newVersion", { version }),
        detail: this.t("downloadDetail", {
          version: this.options.currentVersion,
        }),
        buttons: [this.t("later"), this.t("download")],
        defaultId: 1,
        cancelId: 0,
      });
      if (response !== 1) return;
      userStartedDownload = true;
      this.options.setProgress(0);
      await this.options.updater.downloadUpdate();
      this.downloadedVersion = version;
      this.options.setProgress(-1);
      await this.offerInstall();
    } catch {
      this.options.setProgress(-1);
      console.error(
        JSON.stringify({ ok: false, error: { code: "DESKTOP_UPDATE_FAILED" } }),
      );
      if (manual || userStartedDownload)
        await this.show(
          this.t("updateFailed"),
          this.t("updateFailedDetail"),
          "error",
        );
    }
  }
}
