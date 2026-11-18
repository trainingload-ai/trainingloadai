import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('application color guard rejects literal styles and accepts configured colors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tl-color-usage-'));
  const checker = fileURLToPath(new URL('../scripts/check-color-usage.mjs', import.meta.url));
  const check = () => spawnSync(process.execPath, [checker, directory], { encoding: 'utf8' });
  try {
    await writeFile(join(directory, 'view.tsx'), '<View style={{ color: "#123456" }} />');
    assert.equal(check().status, 1);
    await writeFile(join(directory, 'view.tsx'), '<View className="bg-[#123456]" />');
    assert.equal(check().status, 1);
    await writeFile(join(directory, 'view.tsx'), '<View style={{ color: `rgba(22, 101, 52, ${alpha})` }} />');
    assert.equal(check().status, 1);
    await writeFile(join(directory, 'view.tsx'), '<View className={`bg-[${tokenAlpha(tokenPalette["blue-500"], 0.2)}]`} />');
    assert.equal(check().status, 1);
    await writeFile(join(directory, 'view.tsx'), '<View style={{ color: theme.text, borderColor: userZone.color }} className="bg-card" />');
    await writeFile(join(directory, 'view.css'), '.view { color: var(--foreground); background: hsl(var(--black) / 0.5); }');
    await writeFile(join(directory, 'view.test.ts'), 'const userInput = "#123456";');
    await writeFile(join(directory, 'view.swift'), 'Text("Status").foregroundStyle(.orange)');
    assert.equal(check().status, 1);
    await writeFile(join(directory, 'view.swift'), 'Text("Status").foregroundStyle(RecordingDesignTokens.system.orange)');
    assert.equal(check().status, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
