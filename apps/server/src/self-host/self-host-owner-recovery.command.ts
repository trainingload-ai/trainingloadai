import * as dotenv from 'dotenv';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { resolve } from 'node:path';
import { PASSWORD_POLICY_MESSAGE } from '@/auth/password-policy';
import {
  OwnerRecoveryError,
  recoverSelfHostOwnerPassword,
} from './self-host-owner-recovery';
import { UserQueryService } from '@/api/user/user-query.service';
import { UserQueryModule } from '@/api/user/user-query.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { PrismaService } from '@/prisma/prisma.service';

@Module({ imports: [PrismaModule, UserQueryModule] })
class OwnerRecoveryCommandModule {}

const MAX_STDIN_BYTES = 1024;

function readEmail(argv: string[]): string {
  const index = argv.indexOf('--email');
  const value = index >= 0 ? argv[index + 1]?.trim() : '';
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('SELF_HOST_RECOVERY_EMAIL_REQUIRED');
  }
  return value;
}

async function readPasswordFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('SELF_HOST_RECOVERY_PASSWORD_STDIN_REQUIRED');
  }
  process.stdin.setEncoding('utf8');
  let value = '';
  for await (const chunk of process.stdin) {
    value += chunk;
    if (Buffer.byteLength(value, 'utf8') > MAX_STDIN_BYTES) {
      throw new Error('SELF_HOST_RECOVERY_PASSWORD_TOO_LARGE');
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
  const email = readEmail(process.argv.slice(2));
  const password = await readPasswordFromStdin();
  const app = await NestFactory.createApplicationContext(
    OwnerRecoveryCommandModule,
    { logger: false },
  );
  const prisma = app.get(PrismaService);
  const users = app.get(UserQueryService);
  try {
    const result = await recoverSelfHostOwnerPassword({
      prisma,
      users,
      email,
      password,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  const code =
    error instanceof OwnerRecoveryError
      ? error.code
      : error instanceof Error
        ? error.message
        : 'SELF_HOST_RECOVERY_FAILED';
  process.stderr.write(
    `${JSON.stringify({
      schemaVersion: 1,
      operation: 'self-host-owner-password-recovery',
      status: 'failed',
      code,
      ...(code === 'SELF_HOST_RECOVERY_PASSWORD_INVALID'
        ? { passwordPolicy: PASSWORD_POLICY_MESSAGE }
        : {}),
    })}\n`,
  );
  process.exitCode = 1;
});
