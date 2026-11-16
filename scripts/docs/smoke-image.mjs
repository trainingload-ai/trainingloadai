import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
    "--publish",
    "127.0.0.1::3000",
    "--env",
    `DOCS_INTERNAL_API_URL=http://${api}:3011`,
    image,
  );
  const binding = await docker("port", site, "3000/tcp");
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const origin = `http://${binding}`;
  const request = (path, options = {}) =>
    fetch(`${origin}${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await request("/", {
        signal: AbortSignal.timeout(1000),
      });
      await response.body?.cancel();
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* The server may still be opening its listener. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Docs image must become ready");

  let homepage;
  for (const path of [
    "/",
    "/zh",
    "/docs",
    "/zh/docs",
    "/pricing",
    "/zh/pricing",
  ]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.ok(response.headers.get("content-security-policy"));
    assert.equal(response.headers.get("x-powered-by"), null);
    const html = await response.text();
    assert.match(
      html,
      path.startsWith("/zh") ? /<html[^>]+lang="zh/ : /<html[^>]+lang="en/,
    );
    assert.ok(
      html.includes(configuration.environment.NEXT_PUBLIC_BASE_URL),
      path,
    );
    if (path === "/") homepage = html;
  }
  const assets = [
    ...homepage.matchAll(
      /(?:src|href)="([^" ]*\/_next\/static\/[^" ]+\.(?:js|css))"/g,
    ),
  ].map((match) => match[1]);
  for (const extension of [".js", ".css"]) {
    const asset = assets.find((path) => path.endsWith(extension));
    assert.ok(asset, `homepage must link a ${extension} asset`);
    const response = await request(asset.replaceAll("&amp;", "&"));
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type"),
      extension === ".js" ? /javascript/ : /text\/css/,
    );
    assert.match(response.headers.get("cache-control"), /immutable/);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  for (const path of ["/LOGO.png", "/_next/image?url=%2FLOGO.png&w=64&q=75"]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /^image\//);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  for (const language of ["en", "zh"]) {
    const response = await request(`/api/docs-markdown/${language}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Trainingload/i);
  }
  for (const method of ["GET", "POST"]) {
    const response = await request("/api/proxy/public/image-smoke?fixture=1", {
      method,
      headers: {
        "content-type": "application/json",
        authorization: "fixture-only",
        cookie: "fixture=private",
        "x-client-trace-id": "docs-image-smoke",
      },
      ...(method === "POST" ? { body: '{"fixture":true}' } : {}),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    const data = await response.json();
    assert.deepEqual(data, {
      method,
      path: "/public/image-smoke?fixture=1",
      body: method === "POST" ? '{"fixture":true}' : "",
      authorization: null,
      cookie: null,
      trace: "docs-image-smoke",
    });
  }
  assert.equal((await request("/api/proxy/private/image-smoke")).status, 404);

  // The upstream cannot finish until the consumer sees its first chunk. A
  // buffering regression fails by timeout instead of a fragile timing threshold.
  const streamed = await request("/api/proxy/public/image-stream", {
    headers: { "accept-encoding": "identity" },
  });
  assert.equal(streamed.status, 200);
  assert.match(streamed.headers.get("content-type"), /application\/x-ndjson/);
  const reader = streamed.body.getReader();
  let text = "";
  while (!text.includes("\n")) {
    const first = await reader.read();
    assert.equal(first.done, false);
    text += new TextDecoder().decode(first.value);
  }
  assert.ok(text.includes('"first"'));
  assert.ok(!text.includes('"last"'));
  await docker(
    "exec",
    api,
    "node",
    "-e",
    "fetch('http://127.0.0.1:3011/release').then(r=>r.text())",
  );
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += new TextDecoder().decode(chunk.value);
  }
  assert.ok(text.includes('"last"'));
  console.log(
    "Docs image smoke: PASS (pages, static assets, sharp, Markdown, proxy and streaming)",
  );
} catch (error) {
  primaryError = error;
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
