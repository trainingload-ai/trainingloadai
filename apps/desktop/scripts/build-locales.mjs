import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { core, desktop, validateCoreSource } from "./core-path.mjs";
validateCoreSource();

// Consume the existing locale list and resolver; the native app must not grow
// an independent list, cookie name, language matching or fallback policy.
const source = readFileSync(
  join(core, "apps/client/src/i18n/locales.ts"),
  "utf8",
);
const ast = ts.createSourceFile(
  "locales.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
let locales;
function visit(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(ast) === "SUPPORTED_LOCALES"
  ) {
    const value = ts.isAsExpression(node.initializer)
      ? node.initializer.expression
      : node.initializer;
    if (
      !ts.isArrayLiteralExpression(value) ||
      !value.elements.every(ts.isStringLiteral)
    )
      throw new Error("Unsupported Core locale declaration");
    locales = value.elements.map((item) => item.text);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (!locales?.includes("en")) throw new Error("Missing Core English locale");
const output = join(desktop, "dist/i18n");
mkdirSync(output, { recursive: true });
writeFileSync(
  join(output, "locales.js"),
  `export const SUPPORTED_LOCALES = ${JSON.stringify(locales)};\n`,
);
const resolver = readFileSync(
  join(core, "apps/client/src/lib/locale-preference.ts"),
  "utf8",
).replace('"@/i18n/locales"', '"./locales.js"');
writeFileSync(
  join(output, "core-locale.js"),
  ts.transpileModule(resolver, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const nativeBase = read(join(desktop, "messages/en.json"));
const base = read(join(core, "packages/messages/client-core/en.json"));
const catalogs = {};
for (const locale of locales) {
  const native = read(join(desktop, `messages/${locale}.json`));
  const shared = read(
    join(core, `packages/messages/client-core/${locale}.json`),
  );
  const extra = Object.keys(native).filter((key) => !(key in nativeBase));
  const missing = Object.keys(nativeBase).filter((key) => !(key in native));
  if (extra.length || missing.length)
    throw new Error(
      `Native catalog ${locale}: extra=${extra}, missing=${missing}`,
    );
  for (const [key, value] of Object.entries(native)) {
    if (typeof value !== "string" || !value.trim())
      throw new Error(`Invalid translation ${locale}.${key}`);
    const params = (text) =>
      [...text.matchAll(/\{(\w+)\}/g)]
        .map((match) => match[1])
        .sort()
        .join(",");
    if (params(value) !== params(nativeBase[key]))
      throw new Error(`Translation parameters differ: ${locale}.${key}`);
  }
  catalogs[locale] = {
    ...nativeBase,
    ...native,
    settings: `${shared.settings?.settings ?? base.settings.settings}…`,
    back: shared.desktopChrome?.back ?? base.desktopChrome.back,
    forward: shared.desktopChrome?.forward ?? base.desktopChrome.forward,
    navigation:
      shared.desktopChrome?.navigation ?? base.desktopChrome.navigation,
  };
}
writeFileSync(join(output, "messages.json"), JSON.stringify(catalogs) + "\n");
