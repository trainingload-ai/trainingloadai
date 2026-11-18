import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// A separate Node runtime loads the real ESM SDK without Jest's codec mocks.
it('preserves ordinary and structured FIT semantics and rejects CRC corruption', () => {
  const server = resolve(__dirname, '../../../..');
  const run = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      'test/intervals-ordinary-workout.runtime.test.mjs',
    ],
    {
      cwd: server,
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: resolve(server, 'tsconfig.json'),
      },
      encoding: 'utf8',
      timeout: 15000,
    },
  );
  if (run.status !== 0)
    throw new Error(`${run.error ?? ''}\n${run.stdout}\n${run.stderr}`);
  expect(run.status).toBe(0);
});
