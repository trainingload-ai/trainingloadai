import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedExternalUrl,
  isLocalNavigation,
  isExternalWebUrl,
  normalizedAllowedOrigins,
} from "./desktop-security.js";

test("desktop navigation remains on the random loopback origin", () => {
  const origin = "http://127.0.0.1:43123";
  assert.equal(isLocalNavigation(`${origin}/zh/settings`, origin), true);
  assert.equal(isLocalNavigation("http://127.0.0.1:43124/zh", origin), false);
  assert.equal(isLocalNavigation("https://example.com", origin), false);
});

test("external links require an exact HTTPS origin allowlist match", () => {
  const origins = normalizedAllowedOrigins([
    "https://intervals.icu/settings",
    "http://insecure.example.com",
    "not-a-url",
  ]);
  assert.equal(
    isAllowedExternalUrl("https://intervals.icu/settings", origins),
    true,
  );
  assert.equal(
    isAllowedExternalUrl("https://evil.intervals.icu/", origins),
    false,
  );
  assert.equal(isAllowedExternalUrl("http://intervals.icu/", origins), false);
  assert.equal(
    isAllowedExternalUrl("https://user:password@intervals.icu/", origins),
    false,
  );
});

test("confirmed web links can open public sites outside the automatic popup allowlist", () => {
  const url = "https://m.bilibili.com/space/2266021";
  assert.equal(isExternalWebUrl(url), true);
  assert.equal(isExternalWebUrl("http://example.com/docs"), true);
  assert.equal(
    isAllowedExternalUrl(
      url,
      normalizedAllowedOrigins(["https://intervals.icu"]),
    ),
    false,
  );
});

test("browser handoff rejects executable schemes, credentials, and malformed URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///tmp/test",
    "mailto:user@example.com",
    "ftp://example.com/file",
    "not a url",
    "https://user:password@example.com/",
    "https://example.com/\nunsafe",
  ])
    assert.equal(isExternalWebUrl(url), false, url);
});
