import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

const envPaths = [
  join(process.cwd(), '.env'),
  join(process.cwd(), '../../.env'),
  join(__dirname, '../../../.env'),
  join(__dirname, '../../../../../../.env'),
];
for (const envPath of envPaths) {
  if (existsSync(envPath)) dotenv.config({ path: envPath });
}

import { startApplication } from './bootstrap/bootstrap-application';
import { assertDeploymentEdition } from './bootstrap/deployment-edition';

void (async () => {
  assertDeploymentEdition('self-host');
  const { SelfHostAppModule } = await import('./self-host-app.module');
  await startApplication(SelfHostAppModule);
})().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
