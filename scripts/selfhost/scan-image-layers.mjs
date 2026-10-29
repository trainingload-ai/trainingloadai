import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  consumeRegularFileBounded,
  readRegularFileBounded,
  rethrowAfterPathCleanup,
} from "./backup-artifact.mjs";

const MAXIMUM_IMAGE_METADATA_BYTES = 32 * 1024 * 1024;
const MAXIMUM_IMAGE_SCAN_FILE_BYTES = 8 * 1024 * 1024 * 1024;
const MAXIMUM_IMAGE_LAYERS = 1024;

const forbiddenPathPatterns = [
  ["environment file", /(^|\/)\.env(?:\.[^/]+)?$/i],
  ["Git metadata", /(^|\/)\.git(?:\/|$)/i],
  ["SSH material", /(^|\/)\.ssh(?:\/|$)/i],
  ["cloud credentials", /(^|\/)\.aws(?:\/|$)/i],
  ["private key", /(^|\/)(?:id_rsa|id_ed25519)(?:\.[^/]*)?$/i],
  ["private key or certificate bundle", /\.(?:key|pem|p12|pfx|jks|keystore)$/i],
  ["operator upload", /^(?:(?:app\/)?data\/|app\/)?uploads\/.+[^/]$/i],
  ["operator backup", /^(?:(?:app\/)?data\/|app\/)?backups?\/.+[^/]$/i],
];

const credentialPatterns = [
  [
    "PEM private key",
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/]{40,}={0,2}\r?\n/,
  ],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{16,}\b/],
];

function normalizeLayerPath(value) {
  return value.replace(/^\.\//, "").replaceAll("\\", "/");
}

export function findForbiddenPaths(paths) {
  const findings = [];
  for (const originalPath of paths) {
    const path = normalizeLayerPath(originalPath.trim());
    if (!path || path.endsWith("/")) continue;
    for (const [kind, pattern] of forbiddenPathPatterns) {
      if (pattern.test(path)) findings.push({ kind, path });
    }
  }
  return findings;
}

function literalPattern(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

export function findCredentialMarkers(text, forbiddenValues = []) {
  const patterns = [
    ...credentialPatterns,
    ...forbiddenValues
      .filter((value) => value.length >= 12)
      .map((value) => ["explicit canary", literalPattern(value)]),
  ];
  return patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([kind]) => kind);
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture
      ? `: ${(result.stderr || result.stdout).trim()}`
      : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}${detail}`,
    );
  }
  return result.stdout ?? "";
}

async function scanFileForMarkers(path, forbiddenValues) {
  const findings = new Set();
  let overlap = "";
  await consumeRegularFileBounded(
    path,
    (chunk) => {
      const text = overlap + chunk.toString("latin1");
      for (const marker of findCredentialMarkers(text, forbiddenValues)) {
        findings.add(marker);
      }
      overlap = text.slice(-512);
    },
    {
      maximumBytes: MAXIMUM_IMAGE_SCAN_FILE_BYTES,
      label: "saved image content scan",
    },
  );
  return [...findings];
}

function parseArguments(argv) {
  const options = { forbiddenValues: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === "--forbid-value" && value !== undefined) {
      options.forbiddenValues.push(value);
      index += 1;
    } else if (name === "--image" && value !== undefined) {
      options.image = value;
      index += 1;
    } else {
      throw new Error(`invalid argument near ${name ?? "<end>"}`);
    }
  }
  if (!options.image) throw new Error("missing --image");
  return options;
}

export async function scanSavedImage(directory, forbiddenValues = []) {
  const { contents } = await readRegularFileBounded(
    join(directory, "manifest.json"),
    {
      maximumBytes: MAXIMUM_IMAGE_METADATA_BYTES,
      minimumBytes: 1,
      label: "saved image manifest",
    },
  );
  const manifest = JSON.parse(contents.toString("utf8"));
  if (!Array.isArray(manifest) || manifest.length !== 1) {
    throw new Error("saved image must contain exactly one image manifest");
  }
  const [entry] = manifest;
  if (
    !entry ||
    typeof entry !== "object" ||
    typeof entry.Config !== "string" ||
    !entry.Config ||
    !Array.isArray(entry.Layers) ||
    entry.Layers.length > MAXIMUM_IMAGE_LAYERS ||
    entry.Layers.some((layer) => typeof layer !== "string" || !layer)
  ) {
    throw new Error("saved image manifest has an invalid layer inventory");
  }
  const findings = [];
  const safePath = (relativePath) => {
    const root = `${resolve(directory)}${sep}`;
    const path = resolve(directory, relativePath);
    if (!path.startsWith(root))
      throw new Error(`archive path escapes image: ${relativePath}`);
    return path;
  };
  const configPath = safePath(entry.Config);
  for (const marker of await scanFileForMarkers(configPath, forbiddenValues)) {
    findings.push({ layer: "config", kind: marker });
  }

  for (const [index, layer] of entry.Layers.entries()) {
    const layerPath = safePath(layer);
    const paths = run("tar", ["-tf", layerPath], { capture: true }).split(
      /\r?\n/,
    );
    for (const finding of findForbiddenPaths(paths)) {
      findings.push({ layer: index, ...finding });
    }
    for (const marker of await scanFileForMarkers(layerPath, forbiddenValues)) {
      findings.push({ layer: index, kind: marker });
    }
  }
  return { layers: entry.Layers.length, findings };
}

export async function withImageScanWorkspace(operation, dependencies = {}) {
  const createWorkspace =
    dependencies.createWorkspace ??
    (() => mkdtemp(join(tmpdir(), "trainingload-image-scan-")));
  const directory = await createWorkspace();
  let result;
  let operationError = null;
  try {
    result = await operation(directory);
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPathCleanup(
    operationError,
    [
      {
        path: directory,
        options: { recursive: true, force: true },
      },
    ],
    dependencies.removePath
      ? { removePath: dependencies.removePath }
      : undefined,
  );
  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await withImageScanWorkspace(async (directory) => {
    const archive = join(directory, "image.tar");
    const extracted = join(directory, "contents");
    await mkdir(extracted);
    run("docker", ["image", "save", "--output", archive, options.image]);
    run("tar", ["-xf", archive, "-C", extracted]);
    const result = await scanSavedImage(extracted, options.forbiddenValues);
    if (result.findings.length > 0) {
      for (const finding of result.findings) {
        const path = finding.path ? ` (${finding.path})` : "";
        process.stderr.write(
          `layer ${finding.layer}: ${finding.kind}${path}\n`,
        );
      }
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `image layer scan: PASS ${options.image} (${result.layers} layers)\n`,
    );
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
