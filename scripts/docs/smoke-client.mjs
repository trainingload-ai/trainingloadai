import assert from "node:assert/strict";

// Execute inside the isolated site container; no host port mapping is needed.
const origin = "http://127.0.0.1:3000";
assert.ok(process.env.DOCS_SMOKE_PUBLIC_ORIGIN);
assert.ok(process.env.DOCS_SMOKE_API_ORIGIN);
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
  assert.ok(html.includes(process.env.DOCS_SMOKE_PUBLIC_ORIGIN), path);
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
const released = await fetch(`${process.env.DOCS_SMOKE_API_ORIGIN}/release`, {
  signal: AbortSignal.timeout(5000),
});
assert.equal(released.status, 200);
await released.text();
for (;;) {
  const chunk = await reader.read();
  if (chunk.done) break;
  text += new TextDecoder().decode(chunk.value);
}
assert.ok(text.includes('"last"'));
console.log(
  "Docs image smoke: PASS (pages, static assets, sharp, Markdown, proxy and streaming)",
);
