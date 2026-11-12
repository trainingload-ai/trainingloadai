import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { DesktopUpdater, type DesktopUpdateEngine } from "./desktop-updater.js";

class Engine extends EventEmitter implements DesktopUpdateEngine {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  allowDowngrade = true;
  checks = 0;
  downloads = 0;
  installed = false;
  failDownload = false;
  result = { isUpdateAvailable: true, updateInfo: { version: "1.1.0" } };
  async checkForUpdates() {
    this.checks++;
    return this.result;
  }
  async downloadUpdate() {
    this.downloads++;
    if (this.failDownload) throw new Error("download failed");
    return [];
  }
  quitAndInstall() {
    this.installed = true;
  }
}
function setup({
  packaged = true,
  configured = true,
  choices = [0],
  beforeInstall = async () => {},
} = {}) {
  const engine = new Engine();
  const prompts: string[] = [];
  const updater = new DesktopUpdater({
    packaged,
    configured,
    currentVersion: "1.0.0",
    updater: engine,
    prompt: async ({ message }) => {
      prompts.push(message);
      return choices.shift() ?? 0;
    },
    beforeInstall,
    setProgress: () => {},
  });
  return { updater, engine, prompts };
}
test("development previews and unconfigured builds never contact an update source", async () => {
  for (const options of [{ packaged: false }, { configured: false }]) {
    const { updater, engine, prompts } = setup(options);
    updater.start();
    await updater.check(false);
    assert.equal(prompts.length, 0);
    await updater.check(true);
    updater.stop();
    assert.equal(engine.checks, 0);
    assert.match(prompts[0], /not available/);
    assert.equal(engine.autoDownload, false);
    assert.equal(engine.autoInstallOnAppQuit, false);
  }
});
test("deferring an available update neither downloads nor installs it or repeats automatic prompts", async () => {
  const { updater, engine, prompts } = setup();
  await updater.check(false);
  await updater.check(false);
  assert.equal(prompts.length, 1);
  assert.equal(engine.downloads, 0);
  assert.equal(engine.installed, false);
});
test("a downloaded update stays pending until the user chooses to install", async () => {
  const { updater, engine } = setup({ choices: [1, 0, 1] });
  await updater.check(true);
  assert.equal(engine.downloads, 1);
  assert.equal(engine.installed, false);
  await updater.check(true);
  assert.equal(engine.downloads, 1);
  assert.equal(engine.installed, true);
});
test("installation waits for the local database and services to stop, and concurrent checks share one operation", async () => {
  let release!: () => void;
  let stopping = false;
  const stopped = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { updater, engine } = setup({
    choices: [1, 1],
    beforeInstall: async () => {
      stopping = true;
      await stopped;
    },
  });
  const check = updater.check(true);
  assert.equal(updater.check(true), check);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopping, true);
  assert.equal(engine.installed, false);
  release();
  await check;
  assert.equal(engine.installed, true);
  assert.equal(engine.checks, 1);
});
test("an interrupted download never installs or reports completion", async () => {
  const { updater, engine, prompts } = setup({ choices: [1] });
  engine.failDownload = true;
  await updater.check(false);
  assert.equal(engine.installed, false);
  assert.match(prompts.at(-1)!, /Not Completed/);
});
