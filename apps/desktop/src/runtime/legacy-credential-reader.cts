import { app, safeStorage } from "electron";
import { isAbsolute } from "node:path";

// Run only with the original development Electron runtime. Its OS keystore
// namespace can differ from the packaged app's namespace. Never print keys or
// persist a plaintext export; the parent receives them over its private IPC.
app.setName("Electron");
void app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    if (!process.send)
      throw new Error("A private migration IPC channel is required");
    const path = app.commandLine.getSwitchValue("trainingload-legacy-vault");
    if (!isAbsolute(path))
      throw new Error("An explicit legacy vault path is required");
    const { DesktopCredentialVault } = await import("./credential-vault.js");
    const vault = new DesktopCredentialVault(path, safeStorage);
    const authSecret = await vault.get("instance-auth-secret");
    const integrationSecret = await vault.get("integration-credential-secret");
    if (!authSecret || !integrationSecret)
      throw new Error("Legacy desktop credentials are incomplete");
    process.send({ type: "credentials", authSecret, integrationSecret }, () =>
      app.quit(),
    );
  })
  .catch(() => {
    process.send?.(
      { type: "error", code: "DESKTOP_LEGACY_VAULT_UNAVAILABLE" },
      () => app.quit(),
    );
    if (!process.send) app.quit();
  });
