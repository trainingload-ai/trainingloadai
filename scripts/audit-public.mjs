import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const forbiddenPackages = ['@starshards/managed-', '@managed-commercial/', '@managed-server/', '@managed-shared/', '@managed-client/', '@aws-sdk/', '@creem_io/', '@waffo/', 'mapbox-gl', 'nodemailer'];
const privateRoots = ['ai_docs', 'apps/desktop', 'apps/mobile', 'apps/operations', 'packages/managed-', 'packages/messages/client-managed', 'packages/messages/server-managed', 'packages/prisma/managed', 'packages/prisma/migrations', 'cloud-docs', 'operations', 'electron-client', 'trainingload_mobile_app', 'docsv2', 'exampleFile', 'uploads', 'backups'];

export async function auditPublicRepository(directory) {
  const root = resolve(directory);
  const findings = [];
  let files;
  if (await fs.lstat(resolve(root, '.git')).catch(() => null)) {
    files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  } else {
    files = [];
    async function walk(path = '') {
      for (const entry of await fs.readdir(resolve(root, path), { withFileTypes: true })) {
        if (['node_modules', '.next', '.next-dev', 'dist', 'dist-selfhost', '.git', 'generated', '.generated'].includes(entry.name)) continue;
        const file = path ? `${path}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(file); else files.push(file);
      }
    }
    await walk();
  }
  for (const file of files) {
    if (privateRoots.some(prefix => file === prefix || file.startsWith(prefix.endsWith('-') ? prefix : `${prefix}/`))) findings.push(`Private path: ${file}`);
    const stat = await fs.lstat(resolve(root, file)).catch(error => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    // `git ls-files --cached` contains staged deletions until the commit is
    // created. They are absent from the candidate tree and therefore are not
    // public release inputs.
    if (!stat) continue;
    if (!stat.isFile() || stat.isSymbolicLink()) { findings.push(`Not a regular file: ${file}`); continue; }
    if (/(?:^|\/)\.env(?:\.|$)/.test(file) && file !== '.env.example') findings.push(`Local configuration: ${file}`);
    if (file === 'packages/prisma/core/schema.prisma') {
      const schema = await fs.readFile(resolve(root, file), 'utf8');
      for (const match of schema.matchAll(/^(?:model|enum)\s+((?:Billing|Membership|AiCredit|NewUserGift|PublicDemo)\w*|AiUsagePayer|AiPlanTier)\s*\{/gm)) findings.push(`Private Prisma definition: ${match[1]}`);
      for (const field of ['subscriptionSnapshot', 'billingActionId']) if (new RegExp(`^\\s*${field}\\s+`, 'm').test(schema)) findings.push(`Private Prisma field: ${field}`);
    }
    if (/^packages\/messages\/client-core\/[^/]+\.json$/.test(file)) {
      const catalog = JSON.parse(await fs.readFile(resolve(root, file), 'utf8'));
      for (const key of ['VipGate','MembershipGiftRedeem','CreditPacks','AiCreditErrors','pricingPage','PublicDemo','forgotPassword','OAuthConsent','SelfHostOperationAnalytics']) {
        if (key in catalog) findings.push(`Private message namespace: ${file}: ${key}`);
      }
      for (const key of ['email','password','otp','testGrant']) if (catalog.AccountInner?.[key]) findings.push(`Private account messages: ${file}: ${key}`);
    }
    if (/\.(?:[cm]?js|ts|tsx|json|md|ya?ml|env)$/.test(file) && !file.endsWith('audit-public.mjs')) {
      let text = await fs.readFile(resolve(root, file), 'utf8');
      // Exact synthetic canaries exercise the release secret scanner itself.
      if (file === 'scripts/selfhost/release-attestation.test.mjs') text = text.replaceAll('ghp_abcdefghijklmnopqrstuvwxyz1234567890', '<synthetic-test-canary>');
      if (file === 'scripts/selfhost/scan-image-layers.test.mjs') text = text.replaceAll('AKIAABCDEFGHIJKLMNOP', '<synthetic-test-canary>');
      if (/(?:sk-(?:proj|ant)-[A-Za-z0-9_-]{32,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,})/.test(text)) findings.push(`Possible credential: ${file}`);
    }
    if (/\.([cm]?js|ts|tsx)$/.test(file) && !file.endsWith('audit-public.mjs')) {
      const source = await fs.readFile(resolve(root, file), 'utf8');
      const imports = [...source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
      for (const dependency of imports) if (forbiddenPackages.some(prefix => dependency === prefix || dependency.startsWith(prefix))) findings.push(`Private import: ${file}: ${dependency}`);
    }
    if (/^(apps\/client|apps\/server|apps\/docs|packages\/[^/]+)\/package.json$/.test(file)) {
      const manifest = JSON.parse(await fs.readFile(resolve(root, file), 'utf8'));
      if (manifest.license !== 'AGPL-3.0-only') findings.push(`Incorrect license: ${file}`);
      for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
        if (forbiddenPackages.some(prefix => name.startsWith(prefix))) findings.push(`Private dependency: ${file}: ${name}`);
      }
    }
  }
  if (await fs.lstat(resolve(root, '.git')).catch(() => null)) {
    const history = execFileSync('git', ['log', '--all', '--format=', '--name-only'], {cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
    for (const file of new Set(history.split('\n').filter(Boolean))) {
      if (privateRoots.some(prefix => file === prefix || file.startsWith(prefix.endsWith('-') ? prefix : `${prefix}/`))) findings.push(`Private path in Git history: ${file}`);
    }
  }
  return { files: files.length, findings };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await auditPublicRepository(process.argv[2] || process.cwd());
  if (result.findings.length) { console.error(result.findings.join('\n')); process.exitCode = 1; }
  else console.log(`Public boundary: PASS (${result.files} files)`);
}
