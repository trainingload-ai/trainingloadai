import * as dotenv from 'dotenv';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { resolve } from 'node:path';
import { PASSWORD_POLICY_MESSAGE } from '@/auth/password-policy';
import { PrismaModule } from '@/prisma/prisma.module';
import { RuntimeCapabilityModule } from '@/runtime-capabilities/runtime-capability.module';
import { SelfHostBootstrapService } from './self-host-bootstrap.service';
import { SelfHostBootstrapError } from './self-host-bootstrap.types';
import { readBootstrapTokenFile } from './self-host-token-file';

const MAX_STDIN_BYTES = 1024;

@Module({
  imports: [PrismaModule, RuntimeCapabilityModule],
  providers: [SelfHostBootstrapService],
})
class SelfHostOwnerBootstrapCommandModule {}

function readOption(argv: string[], name: string): string {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1]?.trim() : '';
  if (!value)
    throw new Error(
      `SELF_HOST_BOOTSTRAP_${name.slice(2).toUpperCase()}_REQUIRED`,
    );
  return value;
}

async function readPasswordFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('SELF_HOST_BOOTSTRAP_PASSWORD_STDIN_REQUIRED');
  }
  process.stdin.setEncoding('utf8');
  let value = '';
  for await (const chunk of process.stdin) {
    value += chunk;
    if (Buffer.byteLength(value, 'utf8') > MAX_STDIN_BYTES) {
      throw new Error('SELF_HOST_BOOTSTRAP_PASSWORD_TOO_LARGE');
    }
  }
  return value.replace(/[\r\n]+$/, '');
}

async function run(): Promise<void> {
  dotenv.config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
  dotenv.config({ path: resolve(process.cwd(), '.env'), quiet: true });
  if (!process.env.SELF_HOST_MODE?.trim()) {
    throw new Error('SELF_HOST_ONLY');
  }
  const argv = process.argv.slice(2);
  const email = readOption(argv, '--email');
  const name = readOption(argv, '--name');
  const password = await readPasswordFromStdin();
  const app = await NestFactory.createApplicationContext(
    SelfHostOwnerBootstrapCommandModule,
    { logger: false },
  );
  try {
    const bootstrap = app.get(SelfHostBootstrapService);
    const status = await bootstrap.ensureBootstrapToken();
    if (status.state === 'READY') {
      throw new SelfHostBootstrapError('SELF_HOST_ALREADY_INITIALIZED');
    }
    const token = await readBootstrapTokenFile();
    if (!token) throw new Error('SELF_HOST_BOOTSTRAP_TOKEN_FILE_MISSING');
    const result = await bootstrap.bootstrapOwner({
      token,
      email,
      password,
      name,
    });
    process.stdout.write(
      `${JSON.stringify({
        ...result,
        operation: 'self-host-owner-bootstrap',
        status: 'completed',
      })}\n`,
    );
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  const code =
    error instanceof SelfHostBootstrapError
      ? error.code
      : error instanceof Error
        ? error.message
        : 'SELF_HOST_BOOTSTRAP_FAILED';
  process.stderr.write(
    `${JSON.stringify({
      schemaVersion: 1,
      operation: 'self-host-owner-bootstrap',
      status: 'failed',
      code,
      ...(code === 'SELF_HOST_BOOTSTRAP_INPUT_INVALID'
        ? { passwordPolicy: PASSWORD_POLICY_MESSAGE }
        : {}),
    })}\n`,
  );
  process.exitCode = 1;
});
