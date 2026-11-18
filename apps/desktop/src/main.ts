import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  safeStorage,
  session,
  shell,
  systemPreferences,
} from "electron";
import electronUpdater from "electron-updater";
import { DesktopUpdater } from "./runtime/desktop-updater.js";
import { NativeI18n, LOCALE_COOKIE_NAME } from "./runtime/native-i18n.js";
import {
  APPEARANCE_COOKIE,
  renderStartupPage,
  startupBackground,
  type Appearance,
} from "./runtime/startup-page.js";

import { ChildSupervisor } from "./runtime/child-supervisor.js";
import { DesktopCredentialVault } from "./runtime/credential-vault.js";
import { resolveInstanceCredentials } from "./runtime/instance-credentials.js";
import { readLegacyCredentials } from "./runtime/legacy-credential-migration.js";
import { desktopLaunchProfile } from "./runtime/launch-profile.js";
import { checkDesktopCredentials } from "./runtime/credential-check.js";
import { assertMacReleaseIdentity } from "./runtime/mac-release-identity.js";
import {
  initializeDataRoot,
  resolveDefaultDataRoot,
} from "./runtime/data-root.js";
import {
  createDesktopBackupBundle,
  restoreDesktopBackupBundle,
} from "./runtime/desktop-backup.js";
import { DesktopPgliteService } from "./runtime/pglite-service.js";
import { restorePgliteBackup } from "./runtime/pglite-service.js";
import { getAvailableLoopbackPort } from "./runtime/port.js";
import { resolveDesktopRuntimeEntries } from "./runtime/runtime-entry.js";
import {
  isAllowedExternalUrl,
  isExternalWebUrl,
  isLocalNavigation,
  normalizedAllowedOrigins,
} from "./runtime/desktop-security.js";

type DesktopPreferences = { schemaVersion: 1; dataRoot: string };
const i18n = new NativeI18n();
const t = i18n.t;
const appValues = { app: "Trainingload.ai" };
let preferredAppearance: Appearance = "system";
const usesDarkAppearance = () =>
  preferredAppearance === "dark" ||
  (preferredAppearance === "system" && nativeTheme.shouldUseDarkColors);

const appDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(appDirectory, "..");
const desktopVersion = app.isPackaged
  ? app.getVersion()
  : (
      JSON.parse(
        readFileSync(resolve(appDirectory, "../package.json"), "utf8"),
      ) as { version: string }
    ).version;
const applicationIcon = resolve(
  appDirectory,
  process.platform === "darwin"
    ? "../assets/macos/icon.png"
    : "../assets/icon.png",
);
const customUserDataPath = app.commandLine.getSwitchValue("user-data-dir");
const credentialCheck = app.commandLine.getSwitchValue("credential-check");
const launchProfile = desktopLaunchProfile({
  packaged: app.isPackaged,
  appData: app.getPath("appData"),
  userData: app.getPath("userData"),
  customUserData: customUserDataPath,
});
const applicationUserDataPath = launchProfile.userData;
mkdirSync(applicationUserDataPath, { recursive: true });
app.setPath("userData", applicationUserDataPath);
const pglite = new DesktopPgliteService();
const supervisors: ChildSupervisor[] = [];
let shuttingDown = false;
let mainWindow: BrowserWindow | null = null;
let applicationUrl: string | null = null;
let activeDataRoot: Awaited<ReturnType<typeof initializeDataRoot>> | null =
  null;
const updates = new DesktopUpdater({
  packaged: app.isPackaged,
  configured: existsSync(join(process.resourcesPath, "app-update.yml")),
  currentVersion: desktopVersion,
  translate: t,
  updater: electronUpdater.autoUpdater,
  prompt: async (options) =>
    (
      await dialog.showMessageBox({
        ...options,
        icon: nativeImage.createFromPath(applicationIcon),
      })
    ).response,
  beforeInstall: async () => {
    await stopDesktop();
    shuttingDown = true;
  },
  setProgress: (progress) => mainWindow?.setProgressBar(progress),
});

const defaultExternalOrigins = [
  "https://intervals.icu",
  "https://platform.openai.com",
  "https://api-docs.deepseek.com",
];

function externalOrigins() {
  return normalizedAllowedOrigins([
    ...defaultExternalOrigins,
    ...(process.env.TRAININGLOAD_DESKTOP_EXTERNAL_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
}

async function writeDataRootPreference(dataRoot: string) {
  const preferencesPath = join(
    app.getPath("userData"),
    "desktop-preferences.json",
  );
  const preferences: DesktopPreferences = {
    schemaVersion: 1,
    dataRoot: resolve(dataRoot),
  };
  await mkdir(dirname(preferencesPath), { recursive: true });
  await writeFile(
    preferencesPath,
    `${JSON.stringify(preferences, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
}

async function resolveDataRoot(): Promise<string> {
  const preferencesPath = join(
    app.getPath("userData"),
    "desktop-preferences.json",
  );
  try {
    const preferences = JSON.parse(
      await readFile(preferencesPath, "utf8"),
    ) as DesktopPreferences;
    if (preferences.schemaVersion === 1 && preferences.dataRoot) {
      return preferences.dataRoot;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (launchProfile.isolated) return join(applicationUserDataPath, "data");
  return resolveDefaultDataRoot(
    join(app.getPath("appData"), "Trainingload.ai"),
  );
}

async function chooseDataRoot() {
  const selection = await dialog.showOpenDialog({
    title: t("chooseLocation", appValues),
    message: t("chooseLocationDetail"),
    defaultPath: activeDataRoot?.root,
    buttonLabel: t("useNextLaunch"),
    properties: ["openDirectory", "createDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
  const target = await initializeDataRoot(selection.filePaths[0]);
  await writeDataRootPreference(target.root);
  return { canceled: false, dataRoot: target.root, requiresRestart: true };
}

async function showDataLocation() {
  if (!activeDataRoot) return;
  const { response } = await dialog.showMessageBox({
    icon: nativeImage.createFromPath(applicationIcon),
    type: "info",
    title: t("settingsTitle", appValues),
    message: t("dataTitle"),
    detail: t("dataDetail", { path: activeDataRoot.root }),
    buttons: [t("done"), t("changeLocation"), t("openFolder")],
    defaultId: 0,
    cancelId: 0,
  });
  if (response === 2) {
    await shell.openPath(activeDataRoot.root);
  } else if (response === 1) {
    const result = await chooseDataRoot();
    if (!result.canceled) {
      await dialog.showMessageBox({
        icon: nativeImage.createFromPath(applicationIcon),
        type: "info",
        title: t("settingsTitle", appValues),
        message: t("dataChanged"),
        detail: t("dataChangedDetail", { path: result.dataRoot! }),
      });
    }
  }
}

function registerDesktopMenu() {
  const settings = {
    id: "application-settings",
    label: t("settings"),
    accelerator: "CmdOrCtrl+,",
    enabled: applicationUrl !== null,
    click: () => {
      if (!mainWindow || !applicationUrl) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      // The public app's unprefixed route resolves the user's locale. Keep an
      // already-open Settings page intact, including any unsaved form state.
      if (
        /\/settings\/?$/.test(new URL(mainWindow.webContents.getURL()).pathname)
      )
        return;
      void mainWindow
        .loadURL(new URL(`/${i18n.locale}/settings`, applicationUrl).href)
        .catch((error) => {
          dialog.showErrorBox(
            t("settingsError"),
            error instanceof Error ? error.message : String(error),
          );
        });
    },
  };
  const dataLocation = {
    label: t("dataLocation"),
    click: () => {
      void showDataLocation().catch((error) => {
        dialog.showErrorBox(
          t("dataError"),
          error instanceof Error ? error.message : String(error),
        );
      });
    },
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Trainingload.ai",
        submenu: [
          { role: "about", label: t("about", appValues) },
          { label: t("checkUpdates"), click: () => void updates.check(true) },
          { type: "separator" },
          settings,
          dataLocation,
          { type: "separator" },
          { role: "hide", label: t("hide", appValues) },
          { type: "separator" },
          { role: "quit", label: t("quit", appValues) },
        ],
      },
      { label: t("file"), submenu: [{ role: "close", label: t("close") }] },
      {
        label: t("edit"),
        submenu: [
          ...nativeRoles(["undo", "redo"]),
          { type: "separator" },
          ...nativeRoles([
            "cut",
            "copy",
            "paste",
            "pasteAndMatchStyle",
            "delete",
            "selectAll",
          ]),
        ],
      },
      {
        label: t("navigation"),
        submenu: [
          {
            label: t("back"),
            accelerator: "CmdOrCtrl+[",
            click: () => navigateWindow("back"),
          },
          {
            label: t("forward"),
            accelerator: "CmdOrCtrl+]",
            click: () => navigateWindow("forward"),
          },
        ],
      },
      {
        label: t("view"),
        submenu: [
          ...nativeRoles(["reload", "forceReload", "toggleDevTools"]),
          { type: "separator" },
          ...nativeRoles(["resetZoom", "zoomIn", "zoomOut"]),
          { type: "separator" },
          ...nativeRoles(["togglefullscreen"]),
        ],
      },
      {
        role: "windowMenu",
        label: t("window"),
        submenu: nativeRoles(["minimize", "zoom", "front"]),
      },
    ]),
  );
}

function nativeRoles(
  roles: Array<NonNullable<Electron.MenuItemConstructorOptions["role"]>>,
): Electron.MenuItemConstructorOptions[] {
  return roles.map((role) => ({ role, label: t(role) }));
}

function registerDesktopIpc() {
  const assertMainFrame = (event: Electron.IpcMainInvokeEvent) => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    )
      throw new Error("Invalid desktop window sender");
  };
  ipcMain.handle("desktop:appearance:sync", async (event, theme: unknown) => {
    assertMainFrame(event);
    if (
      !applicationUrl ||
      !isLocalNavigation(
        event.senderFrame?.url ?? "",
        new URL(applicationUrl).origin,
      )
    )
      return;
    if (theme !== "light" && theme !== "dark" && theme !== "system") return;
    preferredAppearance = theme;
    mainWindow?.setBackgroundColor(startupBackground(usesDarkAppearance()));
    await session.defaultSession.cookies.set({
      url: applicationUrl,
      name: APPEARANCE_COOKIE,
      value: theme,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      expirationDate: Date.now() / 1000 + 365 * 24 * 60 * 60,
    });
  });
  ipcMain.handle("desktop:window:state", (event) => {
    assertMainFrame(event);
    return windowState();
  });
  ipcMain.handle("desktop:external-link:open", async (event, url: unknown) => {
    assertMainFrame(event);
    if (typeof url !== "string" || !isExternalWebUrl(url)) {
      throw new Error("DESKTOP_EXTERNAL_LINK_INVALID");
    }
    // The renderer calls this only from the explicit link confirmation action.
    await shell.openExternal(url);
  });
  ipcMain.handle("desktop:window:navigate", (event, direction: unknown) => {
    assertMainFrame(event);
    if (direction !== "back" && direction !== "forward")
      throw new Error("Invalid navigation direction");
    navigateWindow(direction);
  });
  ipcMain.handle("desktop:window:zoom", (event) => {
    assertMainFrame(event);
    const action =
      process.platform === "darwin"
        ? systemPreferences.getUserDefault("AppleActionOnDoubleClick", "string")
        : "Maximize";
    if (action === "None") return;
    if (action === "Minimize") mainWindow?.minimize();
    else if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle("desktop:configuration:get", () => ({
    schemaVersion: 1,
    platform: process.platform,
    dataRoot: activeDataRoot?.root ?? null,
    externalOrigins: [...externalOrigins()],
  }));

  ipcMain.handle("desktop:data-root:choose", chooseDataRoot);

  ipcMain.handle("desktop:backup:create", async () => {
    if (!activeDataRoot) throw new Error("Desktop data root is unavailable");
    const suggested = join(
      activeDataRoot.backups,
      `trainingload-${new Date().toISOString().replaceAll(":", "-")}.trainingload-backup`,
    );
    const selection = await dialog.showSaveDialog({
      title: t("backup"),
      defaultPath: suggested,
      filters: [
        { name: "Trainingload backup", extensions: ["trainingload-backup"] },
      ],
    });
    if (selection.canceled || !selection.filePath) return { canceled: true };
    await createDesktopBackupBundle({
      source: activeDataRoot,
      destination: selection.filePath,
      backupDatabase: (destination) => pglite.backup(destination),
    });
    return { canceled: false, path: selection.filePath };
  });

  ipcMain.handle("desktop:backup:restore", async () => {
    const backup = await dialog.showOpenDialog({
      title: t("chooseBackup"),
      properties: ["openDirectory"],
    });
    if (backup.canceled || !backup.filePaths[0]) return { canceled: true };
    const targetSelection = await dialog.showOpenDialog({
      title: t("restoreTarget"),
      buttonLabel: t("restoreHere"),
      properties: ["openDirectory", "createDirectory"],
    });
    if (targetSelection.canceled || !targetSelection.filePaths[0]) {
      return { canceled: true };
    }
    const target = await initializeDataRoot(targetSelection.filePaths[0]);
    await restoreDesktopBackupBundle({
      source: backup.filePaths[0],
      target,
      restoreDatabase: restorePgliteBackup,
    });
    await writeDataRootPreference(target.root);
    return {
      canceled: false,
      dataRoot: target.root,
      requiresRestart: true,
      credentialsRequireReview: true,
    };
  });
}

async function waitForHttp(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 60_000,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers,
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok || [301, 302, 303, 307, 308].includes(response.status))
        return;
    } catch {
      // Child is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const error = new Error(`Desktop HTTP service did not become ready: ${url}`);
  Object.assign(error, { code: "DESKTOP_HTTP_START_TIMEOUT" });
  throw error;
}

function createMainWindow() {
  const window = new BrowserWindow({
    title: "Trainingload.ai",
    icon: applicationIcon,
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: startupBackground(usesDarkAppearance()),
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 16, y: 13 },
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--trainingload-theme=${preferredAppearance}`],
      preload: resolve(appDirectory, "preload.cjs"),
    },
  });
  mainWindow = window;
  window.on("close", (event) => {
    if (process.platform === "darwin" && !shuttingDown) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
}

async function initializeNativeLocale() {
  const cookies = await session.defaultSession.cookies.get({
    name: LOCALE_COOKIE_NAME,
    domain: "localhost",
  });
  const preference = cookies.find((cookie) => cookie.path === "/")?.value;
  i18n.setLocale(
    i18n.resolve(preference, app.getPreferredSystemLanguages().join(",")),
  );
  const appearance = (
    await session.defaultSession.cookies.get({
      name: APPEARANCE_COOKIE,
      domain: "localhost",
    })
  )[0]?.value;
  if (
    appearance === "light" ||
    appearance === "dark" ||
    appearance === "system"
  )
    preferredAppearance = appearance;
  registerDesktopMenu();
}

function syncNativeLocale(url: string, origin: string) {
  const locale = i18n.fromUrl(url, origin);
  if (locale && i18n.setLocale(locale)) registerDesktopMenu();
}

async function startDesktop() {
  app.dock?.setIcon(applicationIcon);
  await initializeNativeLocale();
  const window = createMainWindow();
  await window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      renderStartupPage({
        dark: usesDarkAppearance(),
        locale: i18n.locale,
        macOS: process.platform === "darwin",
        title: t("starting", appValues),
        detail: t("startingDetail"),
        appName: appValues.app,
        navigation: t("navigation"),
        back: t("back"),
        forward: t("forward"),
      }),
    )}`,
  );
  app.setAboutPanelOptions({
    applicationName: "Trainingload.ai",
    applicationVersion: app.isPackaged
      ? desktopVersion
      : t("development", { version: desktopVersion }),
    iconPath: applicationIcon,
  });
  const entries = await resolveDesktopRuntimeEntries(
    desktopDirectory,
    app.isPackaged ? app.getAppPath() : undefined,
  );
  const dataRoot = await initializeDataRoot(await resolveDataRoot());
  activeDataRoot = dataRoot;
  const internalCredential = randomBytes(32).toString("base64url");
  const databaseUrl = await pglite.start(
    dataRoot.database,
    entries.databaseRunner,
  );
  const [serverPort, clientPort] = await Promise.all([
    getAvailableLoopbackPort(),
    getAvailableLoopbackPort(),
  ]);
  if (serverPort === clientPort) {
    throw Object.assign(new Error("Loopback port collision"), {
      code: "DESKTOP_LOOPBACK_PORT_COLLISION",
    });
  }

  const credentialState = await pglite.credentialState();
  const probe = credentialState.encryptedAuthKey;
  const vault = new DesktopCredentialVault(
    join(dataRoot.root, "credential-vault.json"),
    safeStorage,
  );
  const legacyExecutable = app.commandLine.getSwitchValue("legacy-electron");
  const authCrypto =
    probe === null
      ? null
      : await import(
          pathToFileURL(
            createRequire(entries.server).resolve("better-auth/crypto"),
          ).href
        );
  const encryptedAuthKey = probe === null ? null : JSON.parse(probe);
  const authKeyVersion =
    authCrypto?.parseEnvelope(encryptedAuthKey)?.version ?? 0;
  const { authSecret, integrationSecret } = await resolveInstanceCredentials({
    vault,
    legacyVaults: async () => {
      const candidates: Array<Pick<DesktopCredentialVault, "get">> = [];
      // A foreign profile needs a DB probe. Without one, only the vault
      // already bound to this data root can be recovered by the old runtime.
      if (probe !== null)
        candidates.push(
          // Old releases stored their vault in their own application profile.
          // Never try the generic Electron profile with the release's Keychain key.
          new DesktopCredentialVault(
            join(applicationUserDataPath, "credential-vault.json"),
            safeStorage,
          ),
        );
      if (legacyExecutable) {
        for (const path of new Set([
          join(dataRoot.root, "credential-vault.json"),
          ...(probe !== null
            ? [
                join(
                  app.getPath("appData"),
                  "Electron",
                  "credential-vault.json",
                ),
              ]
            : []),
        ])) {
          let pending: ReturnType<typeof readLegacyCredentials> | undefined;
          candidates.push({
            get: async (name) => {
              // Run the original, explicitly selected runtime only if this
              // candidate is needed. Keys never go to stdout or plaintext files.
              const legacy = await (pending ??= readLegacyCredentials(
                legacyExecutable,
                join(appDirectory, "runtime/legacy-credential-reader.cjs"),
                path,
              ));
              return name === "instance-auth-secret"
                ? legacy.authSecret
                : name === "integration-credential-secret"
                  ? legacy.integrationSecret
                  : null;
            },
          });
        }
      }
      return candidates;
    },
    initialized: credentialState.initialized,
    validateAuthSecret: async (secret) => {
      if (authCrypto === null) return true;
      try {
        await authCrypto.symmetricDecrypt({
          key: {
            keys: new Map([[authKeyVersion, secret]]),
            legacySecret: secret,
          },
          data: encryptedAuthKey,
        });
        return true;
      } catch {
        return false;
      }
    },
  });
  const bootstrap = resolve(appDirectory, "runtime/child-bootstrap.js");
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const clientUrl = `http://localhost:${clientPort}`;
  const common = {
    DESKTOP_INTERNAL_CREDENTIAL: internalCredential,
    DEPLOYMENT_MODE: "self-host",
    NEXT_PUBLIC_SELF_HOST_MODE: "core-local",
    SELF_HOST_MODE: "core-local",
    NEXT_PUBLIC_APP_URL: clientUrl,
    NEXT_PUBLIC_API_URL: clientUrl,
    NEXT_PUBLIC_BASE_URL: clientUrl,
    BETTER_AUTH_URL: clientUrl,
  };
  const server = new ChildSupervisor({
    name: "server",
    bootstrap,
    entry: entries.server,
    env: {
      ...common,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(serverPort),
      DATABASE_URL: databaseUrl,
      ...(app.isPackaged
        ? {
            SERVER_MESSAGE_CATALOG_PATH: join(
              app.getAppPath(),
              "runtime/server/messages",
            ),
          }
        : {}),
      CORE_MIGRATION_DIALECT: "pglite",
      BETTER_AUTH_SECRET: authSecret,
      EXTERNAL_PROVIDER_CREDENTIAL_SECRET: integrationSecret,
      LOCAL_STORAGE_PATH: dataRoot.uploads,
      LOCAL_STORAGE_CACHE_PATH: join(dataRoot.cache, "storage"),
      ELEVATION_DATA_PATH: join(dataRoot.cache, "elevation"),
      SELF_HOST_OPERATIONS_PATH: join(dataRoot.root, "operations"),
      STORAGE_STRATEGY: "LOCAL",
      AI_PROVIDER: "none",
      MAP_PROVIDER: "none",
      ACTIVITY_MAP_THUMB_PROVIDER: "local",
      SOCIAL_AUTH_ENABLED: "false",
      THIRD_PARTY_SYNC_ENABLED: "false",
      TELEMETRY_ENABLED: "false",
      TRUSTED_ORIGINS: clientUrl,
    },
  });
  const client = new ChildSupervisor({
    name: "client",
    bootstrap,
    entry: entries.client,
    env: {
      ...common,
      NODE_ENV: "production",
      HOSTNAME: "localhost",
      PORT: String(clientPort),
      CLIENT_INTERNAL_API_URL: `${serverUrl}/api`,
    },
  });
  supervisors.push(server, client);
  let rejectStartup: (error: Error) => void;
  const startupFailure = new Promise<never>((_resolve, reject) => {
    rejectStartup = reject;
  });
  let starting = true;
  for (const supervisor of supervisors) {
    supervisor.on(
      "child-error",
      (details: { code?: string; message?: string }) => {
        const error = Object.assign(
          new Error(details.message ?? "DESKTOP_CHILD_START_FAILED"),
          { code: details.code ?? "DESKTOP_CHILD_LOAD_FAILED" },
        );
        if (starting) rejectStartup(error);
        else void reportDesktopFailure(error);
      },
    );
    supervisor.once("failed", (details) => {
      const error = Object.assign(
        new Error(t("serviceExited", { name: details.name })),
        { code: "DESKTOP_CHILD_EXITED" },
      );
      if (starting) rejectStartup(error);
      else void reportDesktopFailure(error);
    });
  }
  server.start();
  client.start();
  const startup = new AbortController();
  try {
    await Promise.race([
      startupFailure,
      Promise.all([
        waitForHttp(
          `${serverUrl}/api/health/ready`,
          { "x-trainingload-desktop-credential": internalCredential },
          60_000,
          startup.signal,
        ),
        waitForHttp(clientUrl, {}, 60_000, startup.signal),
      ]),
    ]);
    starting = false;
  } finally {
    startup.abort();
  }
  const applicationOrigin = new URL(clientUrl).origin;
  const publishWindowState = () => {
    syncNativeLocale(window.webContents.getURL(), applicationOrigin);
    if (!window.webContents.isDestroyed())
      window.webContents.send("desktop:window:changed", windowState());
  };
  window.webContents.on("did-navigate", publishWindowState);
  window.webContents.on("did-navigate-in-page", publishWindowState);
  window.webContents.on("page-title-updated", () =>
    setImmediate(publishWindowState),
  );
  window.on("enter-full-screen", publishWindowState);
  window.on("leave-full-screen", publishWindowState);
  window.webContents.on("will-navigate", (event, url) => {
    if (!isLocalNavigation(url, applicationOrigin)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url, externalOrigins())) {
      void shell.openExternal(url).catch(() => {
        console.error(
          JSON.stringify({
            ok: false,
            error: { code: "DESKTOP_EXTERNAL_LINK_FAILED" },
          }),
        );
      });
    }
    return { action: "deny" };
  });
  window.webContents.session.webRequest.onHeadersReceived(
    { urls: ["<all_urls>"] },
    (details, callback) => {
      if (!isLocalNavigation(details.url, applicationOrigin)) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${applicationOrigin} ws://127.0.0.1:${clientPort}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
          ],
        },
      });
    },
  );
  await window.loadURL(new URL(`/${i18n.locale}`, clientUrl).href);
  // The temporary startup document must not become a navigable product page.
  window.webContents.navigationHistory.clear();
  publishWindowState();
  applicationUrl = clientUrl;
  window.webContents.send("desktop:appearance:request");
  const settingsMenu = Menu.getApplicationMenu()?.getMenuItemById(
    "application-settings",
  );
  if (settingsMenu) settingsMenu.enabled = true;
  updates.start();
}

function windowState() {
  const contents = mainWindow?.webContents;
  return {
    canGoBack: contents?.navigationHistory.canGoBack() ?? false,
    canGoForward: contents?.navigationHistory.canGoForward() ?? false,
    title: contents?.getTitle() || "Trainingload.ai",
    isFullScreen: mainWindow?.isFullScreen() ?? false,
  };
}

function navigateWindow(direction: "back" | "forward") {
  const history = mainWindow?.webContents.navigationHistory;
  if (direction === "back" && history?.canGoBack()) history.goBack();
  if (direction === "forward" && history?.canGoForward()) history.goForward();
}

async function stopDesktop() {
  updates.stop();
  await Promise.allSettled(supervisors.map((supervisor) => supervisor.stop()));
  await pglite.stop();
}

let reportingFailure = false;
async function reportDesktopFailure(error: unknown) {
  if (reportingFailure || shuttingDown) return;
  reportingFailure = true;
  const code = (error as { code?: string })?.code ?? "DESKTOP_START_FAILED";
  const credentialMessages: Record<string, string> = {
    DESKTOP_SECURE_STORAGE_UNAVAILABLE: "secureStorageUnavailable",
    DESKTOP_CREDENTIALS_UNREADABLE: "credentialsUnreadable",
    DESKTOP_INSTANCE_SECRET_MISMATCH: "credentialsMismatch",
    DESKTOP_MAC_SIGNATURE_REQUIRED: "macSignatureRequired",
  };
  const message = credentialMessages[code]
    ? t(credentialMessages[code])
    : error instanceof Error
      ? error.message
      : String(error);
  console.error(JSON.stringify({ ok: false, error: { code, message } }));
  await stopDesktop().catch(() => undefined);
  await dialog.showMessageBox({
    type: "error",
    title: t("startError", appValues),
    message: t("startFailed"),
    detail: credentialMessages[code]
      ? `${code}\n\n${message}`
      : t("startFailedDetail", { code, message }),
    buttons: [t("exit")],
  });
  shuttingDown = true;
  app.quit();
}

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  void stopDesktop().finally(() => app.quit());
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("activate", () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

if (!credentialCheck) registerDesktopIpc();

void (
  hasSingleInstanceLock
    ? app.whenReady().then(async () => {
        // macOS initializes its keychain namespace before ready. Change the
        // development display name afterwards so existing encrypted credentials
        // remain readable. Packaged builds get their identity from productName.
        app.setName("Trainingload.ai");
        if (credentialCheck) {
          // Release acceptance is deliberately separate from business startup.
          // It cannot create an Owner or touch the normal data-root preference.
          try {
            if (!customUserDataPath)
              throw new Error("An explicit test profile is required");
            if (app.isPackaged && process.platform === "darwin")
              await assertMacReleaseIdentity(process.execPath);
            const result = await checkDesktopCredentials(
              applicationUserDataPath,
              credentialCheck,
              safeStorage,
            );
            await writeFile(
              join(applicationUserDataPath, "credential-check-report.json"),
              JSON.stringify(result),
              { mode: 0o600 },
            );
            app.exit(0);
          } catch (error) {
            if (customUserDataPath) {
              await writeFile(
                join(applicationUserDataPath, "credential-check-report.json"),
                JSON.stringify({
                  ok: false,
                  error: {
                    code:
                      (error as { code?: string })?.code ??
                      "DESKTOP_CREDENTIAL_CHECK_FAILED",
                  },
                }),
                { mode: 0o600 },
              ).catch(() => undefined);
            }
            app.exit(1);
          }
          return;
        }
        i18n.setLocale(
          i18n.resolve(undefined, app.getPreferredSystemLanguages().join(",")),
        );
        if (app.isPackaged && process.platform === "darwin")
          await assertMacReleaseIdentity(process.execPath);
        registerDesktopMenu();
        return startDesktop();
      })
    : Promise.resolve()
).catch(reportDesktopFailure);
