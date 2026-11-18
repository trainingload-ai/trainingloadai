import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function assertMacCloudContext(environment = process.env, event) {
  const payload =
    event ?? JSON.parse(readFileSync(environment.GITHUB_EVENT_PATH, "utf8"));
  if (
    environment.GITHUB_ACTIONS !== "true" ||
    environment.RUNNER_OS !== "macOS" ||
    environment.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    environment.GITHUB_REF !== "refs/heads/main" ||
    payload.repository?.private !== false ||
    payload.repository?.default_branch !== "main" ||
    payload.repository?.full_name !== environment.GITHUB_REPOSITORY
  )
    throw new Error(
      "DESKTOP_CLOUD_CONTEXT: signing requires workflow_dispatch on a public repository's main branch",
    );
  if (!environment.RUNNER_TEMP || !isAbsolute(environment.RUNNER_TEMP))
    throw new Error(
      "DESKTOP_CLOUD_TEMP: runner temporary directory is required",
    );
}

export function importMacCloudCredentials(
  environment = process.env,
  execute = execFileSync,
) {
  assertMacCloudContext(environment);
  const names = [
    "DESKTOP_MAC_P12_BASE64",
    "DESKTOP_MAC_P12_PASSWORD",
    "DESKTOP_MAC_APPLE_ID",
    "DESKTOP_MAC_APP_PASSWORD",
    "DESKTOP_MAC_TEAM_ID",
  ];
  if (
    names.some((name) => !environment[name]) ||
    !/^[A-Z0-9]{10}$/.test(environment.DESKTOP_MAC_TEAM_ID) ||
    !environment.GITHUB_ENV
  )
    throw new Error(
      "DESKTOP_CLOUD_SECRETS: configure all five macOS environment secrets",
    );
  const encoded = environment.DESKTOP_MAC_P12_BASE64.replace(/\s/g, "");
  if (encoded.length > 48 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error("DESKTOP_CLOUD_CERTIFICATE: invalid certificate encoding");
  const temporary = join(
    environment.RUNNER_TEMP,
    "trainingload-desktop-signing",
  );
  mkdirSync(temporary, { mode: 0o700 });
  const keychain = join(temporary, "signing.keychain-db");
  const certificate = join(temporary, "identity.p12");
  writeFileSync(certificate, Buffer.from(encoded, "base64"), { mode: 0o600 });
  const run = (command, args, input) => {
    try {
      return execute(command, args, {
        encoding: "utf8",
        stdio: "pipe",
        input,
        env: environment,
      });
    } catch {
      throw new Error(
        `DESKTOP_CLOUD_CREDENTIAL_IMPORT: ${command} failed; secret-bearing output is suppressed`,
      );
    }
  };
  const originalKeychains = [
    ...run("security", ["list-keychains", "-d", "user"]).matchAll(
      /"([^"\n]+)"/g,
    ),
  ].map((match) => match[1]);
  writeFileSync(
    join(temporary, "original-keychains.json"),
    JSON.stringify(originalKeychains),
  );
  const originalDefault = run("security", ["default-keychain", "-d", "user"])
    .trim()
    .replace(/^"|"$/g, "");
  if (!isAbsolute(originalDefault))
    throw new Error(
      "DESKTOP_CLOUD_KEYCHAIN_DEFAULT: an original default keychain is required",
    );
  writeFileSync(
    join(temporary, "original-default-keychain.json"),
    JSON.stringify(originalDefault),
  );
  const password = randomBytes(32).toString("hex");
  run("security", ["create-keychain", "-p", password, keychain]);
  run("security", ["set-keychain-settings", "-lut", "21600", keychain]);
  run("security", ["unlock-keychain", "-p", password, keychain]);
  run("security", [
    "import",
    certificate,
    "-k",
    keychain,
    "-P",
    environment.DESKTOP_MAC_P12_PASSWORD,
    "-T",
    "/usr/bin/codesign",
  ]);
  run("security", [
    "set-key-partition-list",
    "-S",
    "apple-tool:,apple:,codesign:",
    "-s",
    "-k",
    password,
    keychain,
  ]);
  run("security", [
    "list-keychains",
    "-d",
    "user",
    "-s",
    keychain,
    ...originalKeychains,
  ]);
  // The native credential check must use a fresh, unlocked OS store, not
  // depend on the hosted runner's login Keychain state. CI context is required.
  run("security", ["default-keychain", "-d", "user", "-s", keychain]);
  // notarytool accepts its secure interactive password prompt through stdin.
  // Keep the app password out of argv and all command output.
  run(
    "xcrun",
    [
      "notarytool",
      "store-credentials",
      "trainingload-desktop-ci",
      "--apple-id",
      environment.DESKTOP_MAC_APPLE_ID,
      "--team-id",
      environment.DESKTOP_MAC_TEAM_ID,
      "--keychain",
      keychain,
    ],
    `${environment.DESKTOP_MAC_APP_PASSWORD}\n`,
  );
  appendFileSync(
    environment.GITHUB_ENV,
    `APPLE_KEYCHAIN=${keychain}\nAPPLE_TEAM_ID=${environment.DESKTOP_MAC_TEAM_ID}\nAPPLE_KEYCHAIN_PROFILE=trainingload-desktop-ci\n`,
  );
  rmSync(certificate);
}

export function cleanupMacCloudCredentials(
  environment = process.env,
  execute = execFileSync,
) {
  assertMacCloudContext(environment);
  const temporary = join(
    environment.RUNNER_TEMP,
    "trainingload-desktop-signing",
  );
  if (!existsSync(temporary)) return;
  const originalDefault = join(temporary, "original-default-keychain.json");
  if (existsSync(originalDefault))
    execute(
      "security",
      [
        "default-keychain",
        "-d",
        "user",
        "-s",
        JSON.parse(readFileSync(originalDefault, "utf8")),
      ],
      { stdio: "pipe" },
    );
  const original = join(temporary, "original-keychains.json");
  if (existsSync(original))
    execute(
      "security",
      [
        "list-keychains",
        "-d",
        "user",
        "-s",
        ...JSON.parse(readFileSync(original, "utf8")),
      ],
      { stdio: "pipe" },
    );
  const keychain = join(temporary, "signing.keychain-db");
  if (existsSync(keychain))
    execute("security", ["delete-keychain", keychain], { stdio: "pipe" });
  rmSync(temporary, { recursive: true, force: true });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.platform !== "darwin" || process.arch !== "arm64")
      throw new Error(
        "DESKTOP_CLOUD_RUNNER: standard macOS arm64 runner required",
      );
    const command = process.argv[2];
    if (command === "check-context") assertMacCloudContext();
    else if (command === "import") importMacCloudCredentials();
    else if (command === "cleanup") cleanupMacCloudCredentials();
    else throw new Error("Unknown credential setup command");
    console.log(JSON.stringify({ ok: true, command }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
