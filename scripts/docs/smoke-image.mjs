import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { validateImage } from "./image-artifact.mjs";

const exec = promisify(execFile);
const image = process.argv[2];
if (!image) throw new Error("DOCS_SMOKE_IMAGE_REQUIRED");
const configuration = JSON.parse(
  await readFile("dist/docs-image/configuration.json", "utf8"),
);
const suffix = randomBytes(8).toString("hex");
const network = `docs-smoke-${suffix}`;
const site = `${network}-site`;
const api = `${network}-api`;
const docker = async (...args) =>
  (await exec("docker", args, { maxBuffer: 2 * 1024 * 1024 })).stdout.trim();
const fixture = `
  const http = require('node:http');
  let release;
  http.createServer(async (request, response) => {
    if (request.url === '/release') { release?.(); response.end('ok'); return; }
    if (request.url === '/public/image-stream') {
      response.writeHead(200, { 'content-type': 'application/x-ndjson' });
      response.write(JSON.stringify({ part: 'first' }) + '\\n');
      await new Promise(resolve => { release = resolve; });
      response.end(JSON.stringify({ part: 'last' }) + '\\n');
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'fixture=blocked' });
    response.end(JSON.stringify({ method: request.method, path: request.url, body,
      authorization: request.headers.authorization || null, cookie: request.headers.cookie || null,
      trace: request.headers['x-client-trace-id'] || null }));
  }).listen(3011, '0.0.0.0');
`;

let primaryError;
try {
  const inspect = JSON.parse(await docker("image", "inspect", image))[0];
  validateImage(inspect, configuration);
  await docker("network", "create", "--internal", network);
  await docker(
    "run",
    "--detach",
    "--name",
    api,
    "--network",
    network,
    "--entrypoint",
    "node",
    image,
    "-e",
    fixture,
  );
  await docker(
    "run",
    "--detach",
    "--name",
    site,
    "--network",
    network,
    "--env",
    `DOCS_INTERNAL_API_URL=http://${api}:3011`,
    image,
  );
  // Internal bridge networks do not publish host ports. Run the HTTP client
  // inside the site container so the fixture stays isolated without NAT.
  const client = await readFile(new URL("./smoke-client.mjs", import.meta.url));
  await new Promise((accept, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        "--env",
        `DOCS_SMOKE_PUBLIC_ORIGIN=${configuration.environment.NEXT_PUBLIC_BASE_URL}`,
        "--env",
        `DOCS_SMOKE_API_ORIGIN=http://${api}:3011`,
        site,
        "node",
        "--input-type=module",
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? accept() : reject(new Error("DOCS_HTTP_SMOKE_FAILED")),
    );
    child.stdin.on("error", reject);
    child.stdin.end(client);
  });
} catch (error) {
  primaryError = error;
  for (const [label, name] of [
    ["site", site],
    ["fixture", api],
  ]) {
    try {
      const logs = await exec("docker", ["logs", "--tail", "40", name]);
      process.stderr.write(
        `Docs smoke ${label} logs:\n${logs.stdout}${logs.stderr}`,
      );
    } catch {
      /* Preserve the original failure if creation did not finish. */
    }
  }
  throw error;
} finally {
  const results = await Promise.allSettled([
    docker("rm", "--force", "--volumes", site),
    docker("rm", "--force", "--volumes", api),
  ]);
  const removed = await Promise.allSettled([docker("network", "rm", network)]);
  if (
    !primaryError &&
    [...results, ...removed].some((result) => result.status === "rejected")
  ) {
    throw new Error("DOCS_SMOKE_CLEANUP_FAILED");
  }
}
