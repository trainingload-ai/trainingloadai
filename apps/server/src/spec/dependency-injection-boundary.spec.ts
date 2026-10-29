import { readdirSync, readFileSync } from 'fs';
import { describe, expect, it } from '@jest/globals';
import { relative, resolve, sep } from 'path';
import ts = require('typescript');

function listProductionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'spec' || entry.name === '__tests__') return [];
      return listProductionFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

function sourceFile(path: string) {
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

function callName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function decoratorName(decorator: ts.Decorator): string | null {
  const expression = decorator.expression;
  return ts.isCallExpression(expression)
    ? callName(expression.expression)
    : callName(expression);
}

function lineOf(source: ts.SourceFile, node: ts.Node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function isNestModuleUseFactory(node: ts.Node, file: string) {
  if (!file.endsWith('.module.ts')) return false;
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isPropertyAssignment(current) &&
      callName(current.name as ts.Expression) === 'useFactory'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

describe('NestJS dependency injection boundaries', () => {
  const sourceRoot = resolve(__dirname, '..');
  const files = listProductionFiles(sourceRoot);

  it('does not reintroduce forwardRef into production modules', () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = sourceFile(file);
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          callName(node.expression) === 'forwardRef'
        ) {
          violations.push(relative(sourceRoot, file));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it('keeps UserQueryService creation owned by the Nest container', () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = sourceFile(file);
      const visit = (node: ts.Node) => {
        if (
          ts.isNewExpression(node) &&
          callName(node.expression) === 'UserQueryService'
        ) {
          violations.push(relative(sourceRoot, file));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it('keeps every Injectable class container-managed in production code', () => {
    const injectableNames = new Set<string>();
    for (const file of files) {
      const source = sourceFile(file);
      const visit = (node: ts.Node) => {
        if (
          ts.isClassDeclaration(node) &&
          node.name &&
          (ts.getDecorators(node) ?? []).some(
            (decorator) => decoratorName(decorator) === 'Injectable',
          )
        ) {
          injectableNames.add(node.name.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    const violations: string[] = [];
    for (const file of files) {
      const source = sourceFile(file);
      const visit = (node: ts.Node) => {
        if (ts.isNewExpression(node)) {
          const name = callName(node.expression);
          if (
            name &&
            injectableNames.has(name) &&
            !isNestModuleUseFactory(node, file)
          ) {
            violations.push(
              `${relative(sourceRoot, file)}:${lineOf(source, node)} new ${name}`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(violations).toEqual([]);
  });

  it('does not combine Optional dependencies with manual constructor fallbacks', () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = sourceFile(file);
      const visit = (node: ts.Node) => {
        if (!ts.isConstructorDeclaration(node)) {
          ts.forEachChild(node, visit);
          return;
        }
        const optionalNames = new Set(
          node.parameters
            .filter((parameter) =>
              (ts.getDecorators(parameter) ?? []).some(
                (decorator) => decoratorName(decorator) === 'Optional',
              ),
            )
            .map((parameter) =>
              ts.isIdentifier(parameter.name) ? parameter.name.text : '',
            )
            .filter(Boolean),
        );
        if (optionalNames.size === 0 || !node.body) return;

        const inspectFallback = (child: ts.Node) => {
          if (
            ts.isBinaryExpression(child) &&
            (child.operatorToken.kind ===
              ts.SyntaxKind.QuestionQuestionToken ||
              child.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
            ts.isIdentifier(child.left) &&
            optionalNames.has(child.left.text)
          ) {
            let containsNew = false;
            const inspectRight = (right: ts.Node) => {
              if (ts.isNewExpression(right)) containsNew = true;
              ts.forEachChild(right, inspectRight);
            };
            inspectRight(child.right);
            if (containsNew) {
              violations.push(
                `${relative(sourceRoot, file)}:${lineOf(source, child)} ${child.left.text} fallback`,
              );
            }
          }
          ts.forEachChild(child, inspectFallback);
        };
        inspectFallback(node.body);
      };
      visit(source);
    }

    expect(violations).toEqual([]);
  });

  it('keeps core feature constructors explicit and container-managed', () => {
    const corePrefixes = [
      `api${sep}activity${sep}`,
      `api${sep}user${sep}`,
      `analyze${sep}`,
    ];
    const violations: string[] = [];

    for (const file of files) {
      const relativePath = relative(sourceRoot, file);
      if (!corePrefixes.some((prefix) => relativePath.startsWith(prefix))) {
        continue;
      }
      const source = sourceFile(file);
      const visit = (node: ts.Node) => {
        if (ts.isConstructorDeclaration(node)) {
          for (const parameter of node.parameters) {
            for (const decorator of ts.getDecorators(parameter) ?? []) {
              const expression = decorator.expression;
              const name = ts.isCallExpression(expression)
                ? callName(expression.expression)
                : callName(expression);
              if (name === 'Optional' || name === 'NestOptional') {
                violations.push(
                  `${relativePath}: optional constructor dependency`,
                );
              }
            }
          }
        }
        if (ts.isNewExpression(node)) {
          const name = callName(node.expression);
          if (name?.endsWith('Service')) {
            violations.push(`${relativePath}: new ${name}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(violations).toEqual([]);
  });
});
