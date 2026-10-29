import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");

function problem(code, message) {
  return { code, message };
}

function envMap(values = []) {
  return new Map(
    values.map((entry) => {
      const separator = entry.indexOf("=");
      return separator === -1
        ? [entry, ""]
        : [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
}

export function platformArchitecture(platform) {
  if (platform === "linux/amd64") return { image: "amd64", node: "x64" };
  if (platform === "linux/arm64") return { image: "arm64", node: "arm64" };
  throw new Error(`unsupported platform: ${platform}`);
}

export function validateImageInspect(inspect, expected, imageContract) {
  const errors = [];
  const definition = imageContract.images[expected.role];
  const architecture = platformArchitecture(expected.platform);
  const labels = inspect?.Config?.Labels ?? {};
  const environment = envMap(inspect?.Config?.Env);

  if (!definition)
    return [problem("ROLE", `unknown image role: ${expected.role}`)];
  if (inspect?.Os !== "linux")
    errors.push(problem("OS", "image OS must be linux"));
  if (inspect?.Architecture !== architecture.image) {
    errors.push(
      problem("ARCH", `image architecture must be ${architecture.image}`),
    );
  }
  const identity = `${imageContract.runtimeIdentity.uid}:${imageContract.runtimeIdentity.gid}`;
  if (inspect?.Config?.User !== identity) {
    errors.push(problem("USER", `runtime user must be ${identity}`));
  }
  if (inspect?.Config?.WorkingDir !== definition.workdir) {
    errors.push(
      problem("WORKDIR", `working directory must be ${definition.workdir}`),
    );
  }
  if (
    JSON.stringify(inspect?.Config?.Cmd) !==
    JSON.stringify(definition.entrypoint)
  ) {
    errors.push(
      problem(
        "CMD",
        `command must be ${JSON.stringify(definition.entrypoint)}`,
      ),
    );
  }
  if (
    definition.port !== null &&
    !inspect?.Config?.ExposedPorts?.[`${definition.port}/tcp`]
  ) {
    errors.push(problem("PORT", `image must expose ${definition.port}/tcp`));
  }
  if (environment.get("NODE_ENV") !== "production") {
    errors.push(problem("NODE_ENV", "NODE_ENV must be production"));
  }
  if (
    !Array.isArray(inspect?.RootFS?.Layers) ||
    inspect.RootFS.Layers.length === 0
  ) {
    errors.push(problem("LAYERS", "image must contain filesystem layers"));
  }

  const expectedLabels = {
    "io.trainingload.selfhost.image-role": expected.role,
    "io.trainingload.selfhost.config-schema": String(
      imageContract.configSchemaVersion,
    ),
    "org.opencontainers.image.version": expected.version,
    "org.opencontainers.image.revision": expected.revision,
    "org.opencontainers.image.source": expected.source,
    "org.opencontainers.image.licenses": imageContract.license,
    "org.opencontainers.image.base.name":
      imageContract.baseImages[definition.baseImage].reference,
  };
  if (definition.runtimeLayout === "scratch-minimal-rootfs") {
    expectedLabels["io.trainingload.selfhost.node.source"] =
      imageContract.baseImages.node.reference;
  }
  for (const [name, value] of Object.entries(expectedLabels)) {
    if (labels[name] !== value) {
      errors.push(problem("LABEL", `${name} must be ${JSON.stringify(value)}`));
    }
  }
  return errors;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture
      ? `: ${(result.stderr || result.stdout).trim()}`
      : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}${detail}`,
    );
  }
  return result.stdout?.trim() ?? "";
}

function dockerNodeArguments(options, source, extra = []) {
  return [
    "run",
    "--rm",
    "--network",
    "none",
    "--platform",
    options.platform,
    ...extra,
    "--entrypoint",
    "node",
    options.image,
    "-e",
    source,
  ];
}

async function smokeClientHttp(options, definition) {
  const container = run(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--network",
      "none",
      "--platform",
      options.platform,
      options.image,
    ],
    { capture: true },
  );
  let lastError = "client did not become ready";
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = spawnSync(
        "docker",
        [
          "exec",
          container,
          "node",
          "-e",
          [
            `fetch('http://127.0.0.1:${definition.port}/en')`,
            ".then(response => {",
            "if (response.status !== 200) throw new Error('status=' + response.status);",
            "process.stdout.write(String(response.status));",
            "})",
            ".catch(error => { console.error(error.message); process.exit(1); });",
          ].join(""),
        ],
        { encoding: "utf8" },
      );
      if (result.status === 0) return result.stdout.trim();
      lastError = (result.stderr || result.stdout || lastError).trim();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`client HTTP smoke failed: ${lastError}`);
  } finally {
    spawnSync("docker", ["stop", container], { stdio: "ignore" });
  }
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument near ${name ?? "<end>"}`);
    }
    values.set(name.slice(2), value);
  }
  for (const required of [
    "image",
    "role",
    "platform",
    "version",
    "revision",
    "source",
  ]) {
    if (!values.has(required)) throw new Error(`missing --${required}`);
  }
  return Object.fromEntries(values);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const contract = JSON.parse(
    await readFile(
      resolve(repositoryRoot, "docker/selfhost/image-contract.json"),
      "utf8",
    ),
  );
  const inspectOutput = run("docker", ["image", "inspect", options.image], {
    capture: true,
  });
  const [inspect] = JSON.parse(inspectOutput);
  const errors = validateImageInspect(inspect, options, contract);
  if (errors.length > 0) {
    for (const error of errors)
      process.stderr.write(`${error.code}: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const definition = contract.images[options.role];
  const architecture = platformArchitecture(options.platform);
  run("docker", [
    "run",
    "--rm",
    "--platform",
    options.platform,
    "--entrypoint",
    "node",
    options.image,
    "--check",
    definition.entrypoint[1],
  ]);
  const runtimeCheck = [
    `if (process.arch !== ${JSON.stringify(architecture.node)}) throw new Error('architecture=' + process.arch);`,
    `if (process.getuid?.() !== ${contract.runtimeIdentity.uid}) throw new Error('uid=' + process.getuid?.());`,
    `if (process.getgid?.() !== ${contract.runtimeIdentity.gid}) throw new Error('gid=' + process.getgid?.());`,
    `process.stdout.write(JSON.stringify({arch: process.arch, uid: process.getuid?.(), gid: process.getgid?.()}));`,
  ].join("");
  const runtime = run(
    "docker",
    [
      "run",
      "--rm",
      "--platform",
      options.platform,
      "--entrypoint",
      "node",
      options.image,
      "-e",
      runtimeCheck,
    ],
    { capture: true },
  );
  const forbiddenCommandCheck = [
    "const fs=require('node:fs');",
    `const commands=${JSON.stringify(contract.forbiddenRuntimeCommands)};`,
    "const found=commands.filter(command=>fs.existsSync('/usr/local/bin/'+command));",
    "if(found.length) throw new Error('forbidden runtime commands: '+found.join(','));",
  ].join("");
  run("docker", dockerNodeArguments(options, forbiddenCommandCheck));
  if (options.role === "server") {
    const boundaryCheck = [
      "const fs=require('node:fs');",
      "const paths=['/app/apps/server/dist/apps/server/src/managed','/app/apps/server/node_modules/@creem_io','/app/apps/server/node_modules/@waffo'];",
      "const found=paths.filter(path=>fs.existsSync(path));",
      "const pnpm='/app/apps/server/node_modules/.pnpm';",
      "if(fs.existsSync(pnpm)) found.push(...fs.readdirSync(pnpm).filter(name=>name.startsWith('@creem_io+')||name.startsWith('@waffo+')).map(name=>pnpm+'/'+name));",
      "if(found.length) throw new Error('managed runtime paths: '+found.join(','));",
    ].join("");
    run("docker", dockerNodeArguments(options, boundaryCheck));

    const nativeCheck = [
      "const sharp=require('sharp');",
      "const {DuckDBInstance}=require('@duckdb/node-api');",
      "const {PrismaClient}=require('@prisma/client');",
      "(async()=>{",
      "const png=await sharp({create:{width:1,height:1,channels:4,background:'red'}}).png().toBuffer();",
      "if(!png.length) throw new Error('sharp output is empty');",
      "const db=await DuckDBInstance.create(':memory:');",
      "const connection=await db.connect();",
      "await connection.run('SELECT 1 AS ok');",
      "connection.closeSync(); db.closeSync();",
      "const prisma=new PrismaClient(); let code='CONNECTED_UNEXPECTEDLY';",
      "try{await prisma.$connect()}catch(error){code=error.code||error.errorCode||error.name}finally{await prisma.$disconnect()}",
      "if(code!=='P1001') throw new Error('unexpected Prisma result: '+code);",
      "process.stdout.write(JSON.stringify({sharp:png.length,duckdb:'ok',prisma:code}));",
      "})().catch(error=>{console.error(error);process.exit(1)});",
    ].join("");
    run(
      "docker",
      dockerNodeArguments(options, nativeCheck, [
        "-e",
        "DATABASE_URL=postgresql://test:test@127.0.0.1:9/test?connect_timeout=1",
      ]),
    );
  } else if (options.role === "migrate") {
    run(
      "docker",
      dockerNodeArguments(
        options,
        "const pg=require('pg/package.json'); if(!pg.version) process.exit(1); process.stdout.write(pg.version);",
      ),
    );
  } else if (options.role === "client") {
    await smokeClientHttp(options, definition);
  }
  process.stdout.write(
    `image smoke: PASS ${options.role} ${options.platform} ${runtime}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
