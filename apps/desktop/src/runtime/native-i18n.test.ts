import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { NativeI18n, LOCALE_COOKIE_NAME } from "./native-i18n.js";

test("native locale uses the existing Core cookie and regional language policy", () => {
  const i18n = new NativeI18n();
  assert.equal(LOCALE_COOKIE_NAME, "NEXT_LOCALE");
  assert.equal(i18n.resolve("de", "zh-TW"), "de");
  assert.equal(i18n.resolve(undefined, "zh-TW"), "zh-hant");
  assert.equal(i18n.resolve(undefined, "pt-PT"), "pt-BR");
  assert.equal(i18n.resolve(undefined, "nl-NL"), "en");
});

test("all Core locales have native resources, and navigation only trusts local supported URLs", () => {
  const i18n = new NativeI18n();
  const catalogs = JSON.parse(
    readFileSync(new URL("../i18n/messages.json", import.meta.url), "utf8"),
  );
  for (const locale of Object.keys(catalogs)) {
    assert.equal(
      i18n.fromUrl(
        `http://127.0.0.1:4000/${locale}/settings`,
        "http://127.0.0.1:4000",
      ),
      locale,
    );
    i18n.setLocale(locale);
    assert.ok(i18n.t("settings"));
    assert.ok(i18n.t("checkUpdates"));
    assert.match(i18n.t("currentVersion", { version: "1.1.22" }), /1\.1\.22/);
  }
  assert.equal(
    i18n.fromUrl("https://example.com/zh/settings", "http://127.0.0.1:4000"),
    null,
  );
  assert.equal(
    i18n.fromUrl("http://127.0.0.1:4000/nl/settings", "http://127.0.0.1:4000"),
    null,
  );
  assert.equal(i18n.setLocale("constructor"), false);
  i18n.setLocale("en");
  assert.equal(i18n.t("settings"), "Settings…");
  i18n.setLocale("zh");
  assert.equal(i18n.t("settings"), "设置…");
});
