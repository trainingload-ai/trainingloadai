import { existsSync, readdirSync, readFileSync } from 'fs';
import { describe, expect, it } from '@jest/globals';
import { dirname, join, relative, resolve } from 'path';
import ts = require('typescript');

function listModuleFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listModuleFiles(path);
    return path.endsWith('.module.ts') ? [path] : [];
  });
}

function resolveModuleImport(
  sourceRoot: string,
  sourceFile: string,
  specifier: string,
): string | null {
  const base = specifier.startsWith('@/')
    ? join(sourceRoot, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(sourceFile), specifier)
      : null;
  if (!base) return null;

  for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && candidate.endsWith('.module.ts')) {
      return candidate;
    }
  }
  return null;
}

function moduleGraph(sourceRoot: string): Map<string, string[]> {
  const files = listModuleFiles(sourceRoot);
  const graph = new Map(files.map((file) => [file, [] as string[]]));

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const dependencies = graph.get(file)!;
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const dependency = resolveModuleImport(
        sourceRoot,
        file,
        statement.moduleSpecifier.text,
      );
      if (dependency && graph.has(dependency)) dependencies.push(dependency);
    }
  }
  return graph;
}

function stronglyConnectedComponents(graph: Map<string, string[]>): string[][] {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];

  const visit = (node: string) => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const dependency of graph.get(node) ?? []) {
      if (!indices.has(dependency)) {
        visit(dependency);
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node)!, lowLinks.get(dependency)!),
        );
      } else if (onStack.has(dependency)) {
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node)!, indices.get(dependency)!),
        );
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    if (component.length > 1 || (graph.get(node) ?? []).includes(node)) {
      cycles.push(component);
    }
  };

  for (const node of graph.keys()) {
    if (!indices.has(node)) visit(node);
  }
  return cycles;
}

describe('NestJS module graph', () => {
  it('keeps feature module imports acyclic', () => {
    const sourceRoot = resolve(__dirname, '..');
    const cycles = stronglyConnectedComponents(moduleGraph(sourceRoot))
      .map((component) =>
        component.map((file) => relative(sourceRoot, file)).sort(),
      )
      .sort((left, right) => left.join().localeCompare(right.join()));

    expect(cycles).toEqual([]);
  });
});
