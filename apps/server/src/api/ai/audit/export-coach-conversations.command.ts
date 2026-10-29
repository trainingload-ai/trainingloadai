import { PrismaClient } from '@prisma/client';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  AuditRedactor,
  auditConversation,
  auditMarkdown,
} from './coach-conversation-audit';

export function parseAuditExportOptions(argv: string[]) {
  const values = new Map<string, string>();
  for (const arg of argv) {
    const match = /^(--out|--limit|--messages-per-session)=(.+)$/.exec(arg);
    if (!match || values.has(match[1]))
      throw new Error('Invalid or duplicate option');
    values.set(match[1], match[2]);
  }
  if (!values.get('--out')) throw new Error('--out is required');
  const bounded = (key: string, fallback: number, max: number) => {
    const raw = values.get(key);
    if (raw !== undefined && !/^\d+$/.test(raw))
      throw new Error(`Invalid ${key}`);
    const n = raw === undefined ? fallback : Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > max)
      throw new Error(`Invalid ${key}`);
    return n;
  };
  return {
    out: resolve(values.get('--out')!),
    limit: bounded('--limit', 100, 1000),
    messagesPerSession: bounded('--messages-per-session', 2000, 10000),
  };
}

/** Read-only snapshot; no application boot, queue, provider sync or mutation. */
export async function readAuditExport(
  prisma: PrismaClient,
  options: ReturnType<typeof parseAuditExportOptions>,
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const sessions = await tx.aiCoachSession.findMany({
        where: { messages: { some: { role: 'USER' } } },
        orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }, { id: 'asc' }],
        take: options.limit + 1,
        select: {
          userId: true,
          id: true,
          user: { select: { name: true, email: true } },
        },
      });
      const selected = sessions.slice(0, options.limit);
      const identities = selected.flatMap((s) => [
        s.userId,
        s.id,
        s.user.name,
        s.user.email,
      ]);
      const users = new Map<string, string>();
      const exported = [];
      // Sequential bounded reads avoid loading all raw structured payloads at once.
      for (const session of selected) {
        if (!users.has(session.userId))
          users.set(session.userId, `匿名用户-${users.size + 1}`);
        const messages = await tx.aiCoachMessage.findMany({
          where: { userId: session.userId, sessionId: session.id },
          orderBy: { sequence: 'asc' },
          take: options.messagesPerSession + 1,
          select: { role: true, sequence: true, content: true, message: true },
        });
        exported.push({
          userAlias: users.get(session.userId)!,
          messages: auditConversation(
            messages.slice(0, options.messagesPerSession),
            new AuditRedactor(identities),
          ),
          truncated: messages.length > options.messagesPerSession,
        });
      }
      return auditMarkdown({
        sessions: exported,
        truncated: sessions.length > options.limit,
      });
    },
    { isolationLevel: 'RepeatableRead', timeout: 120_000, maxWait: 5000 },
  );
}

export async function writeAuditExport(out: string, markdown: string) {
  // Exclusive creation also refuses existing files and symlinks; no accidental overwrite.
  const file = await open(out, 'wx', 0o600);
  try {
    await file.writeFile(markdown, 'utf8');
  } finally {
    await file.close();
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(
      'Export locally on the authorized database host. DATABASE_URL must be explicitly set. Options: --out=<new.md> [--limit=100] [--messages-per-session=2000]. Limits are explicit in the report. Internal use only; never commit output.',
    );
    return;
  }
  const options = parseAuditExportOptions(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({ log: [] });
  try {
    const markdown = await readAuditExport(prisma, options);
    await writeAuditExport(options.out, markdown);
    console.log(
      'Audit export created (0600). Inspect truncation and privacy before use.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch(() => {
    // Database/FS exceptions can contain credentials, identifiers, paths or payloads.
    console.error(
      'Audit export failed. Check options, database authorization, limits and an unused output path. No raw error is printed.',
    );
    process.exitCode = 1;
  });
}
