import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const coreSchemaPath = resolve(repositoryRoot, 'packages/prisma/core/schema.prisma');
const ownershipPath = resolve(repositoryRoot, 'packages/managed-server/prisma/schema-ownership.json');
const managedExtensionPath = resolve(
  repositoryRoot,
  'packages/managed-server/prisma/extensions.prisma',
);

function topLevelNames(source) {
  return new Set(
    [...source.matchAll(/^(?:model|enum|type|view)\s+(\w+)\s+\{/gm)].map(
      (match) => match[1],
    ),
  );
}

async function main() {
  const [core, ownershipSource, managedExtension] = await Promise.all([
    readFile(coreSchemaPath, 'utf8'),
    readFile(ownershipPath, 'utf8').catch(() => null),
    readFile(managedExtensionPath, 'utf8').catch(() => null),
  ]);
  const ownership = ownershipSource ? JSON.parse(ownershipSource) : null;
  const names = topLevelNames(core);
  const problems = [];

  if (core.startsWith('// GENERATED FILE. DO NOT EDIT.')) {
    problems.push('Core schema must be authoritative, not generated');
  }
  const managedNames = managedExtension
    ? topLevelNames(managedExtension)
    : new Set([
        ...(ownership?.managedModels ?? []),
        ...(ownership?.managedEnums ?? []),
      ]);
  for (const name of managedNames) {
    if (names.has(name)) problems.push(`Core schema contains Managed block ${name}`);
  }
  for (const [model, fields] of Object.entries(
    ownership?.coreRelationFields ?? {},
  )) {
    const block = new RegExp(`model\\s+${model}\\s+\\{([\\s\\S]*?)\\n\\}`, 'm').exec(
      core,
    )?.[1];
    if (!block) {
      problems.push(`Core schema is missing model ${model}`);
      continue;
    }
    for (const field of fields) {
      if (new RegExp(`^\\s*${field}\\s+`, 'm').test(block)) {
        problems.push(`Core model ${model} contains Managed relation ${field}`);
      }
    }
  }

  if (problems.length) throw new Error(problems.join('\n'));
  process.stdout.write('Core Prisma schema: authoritative boundary valid\n');
}

await main();
