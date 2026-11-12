import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { SHARED_CLIENT_MESSAGE_PATHS } from "./client-messages";

const src = fileURLToPath(new URL("../", import.meta.url));
const app = path.join(src, "app/[lang]");
const analysis = new Map<
  string,
  {
    imports: string[];
    required: string[];
    provided: string[];
  }
>();

function inspect(file: string) {
  const cached = analysis.get(file);
  if (cached) return cached;
  const result = {
    imports: [] as string[],
    required: [] as string[],
    provided: [] as string[],
  };
  analysis.set(file, result);
  const tree = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function provideArray(value: ts.Node) {
    if (ts.isArrayLiteralExpression(value)) {
      for (const element of value.elements) {
        if (ts.isStringLiteral(element)) result.provided.push(element.text);
      }
    }
  }
  function walk(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      const base = specifier.startsWith("@/")
        ? path.join(src, specifier.slice(2))
        : specifier.startsWith(".")
          ? path.resolve(path.dirname(file), specifier)
          : null;
      if (base) {
        const dependency = [
          base,
          `${base}.tsx`,
          `${base}.ts`,
          path.join(base, "index.tsx"),
          path.join(base, "index.ts"),
        ].find(
          (candidate) =>
            /\.[cm]?[jt]sx?$/.test(candidate) && existsSync(candidate),
        );
        if (dependency) result.imports.push(dependency);
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (
        node.expression.text === "useTranslations" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        result.required.push(node.arguments[0].text);
      }
      if (
        node.expression.text === "createClientMessagesLayout" &&
        node.arguments[0]
      )
        provideArray(node.arguments[0]);
    }
    if (ts.isJsxAttribute(node) && node.initializer) {
      if (
        node.name.getText(tree) === "namespace" &&
        ts.isStringLiteral(node.initializer)
      )
        result.required.push(node.initializer.text);
      if (
        node.name.getText(tree) === "namespaces" &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression
      )
        provideArray(node.initializer.expression);
      if (
        node.name.getText(tree) === "kind" &&
        ts.isStringLiteral(node.initializer) &&
        ["load", "files", "plans"].includes(node.initializer.text)
      )
        result.required.push(`toolExperience.${node.initializer.text}.hero`);
    }
    ts.forEachChild(node, walk);
  }
  walk(tree);
  return result;
}

function pages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? pages(file)
      : entry.name === "page.tsx"
        ? [file]
        : [];
  });
}

describe("route client translation coverage", () => {
  for (const page of pages(app)) {
    it(`provides client namespaces used by ${path.relative(app, page)}`, () => {
      const seen = new Set<string>();
      const required = new Set<string>();
      const provided = new Set<string>(SHARED_CLIENT_MESSAGE_PATHS);
      function collect(file: string) {
        if (seen.has(file)) return;
        seen.add(file);
        const result = inspect(file);
        result.required.forEach((value) => required.add(value));
        result.provided.forEach((value) => provided.add(value));
        result.imports.forEach(collect);
      }
      collect(page);
      for (
        let directory = path.dirname(page);
        directory.startsWith(app);
        directory = path.dirname(directory)
      ) {
        const layout = path.join(directory, "layout.tsx");
        if (existsSync(layout)) collect(layout);
      }
      const missing = [...required].filter(
        (namespace) =>
          ![...provided].some(
            (scope) => namespace === scope || namespace.startsWith(`${scope}.`),
          ),
      );
      expect(
        missing,
        `Missing client copy in ${path.relative(app, page)}`,
      ).toEqual([]);
    });
  }
});
