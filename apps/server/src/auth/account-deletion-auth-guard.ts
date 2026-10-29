import { APIError } from 'better-auth/api';
import {
  findAccountDeletionStateByEmail,
  type AccountDeletionLookup,
} from '@/api/user/persistence/user-auth.repository';

const GUARDED_EMAIL_AUTH_PATHS = new Set([
  '/sign-in/email',
  '/sign-up/email',
  '/request-password-reset',
  '/email-otp/send-verification-otp',
  '/email-otp/request-password-reset',
  '/email-otp/reset-password',
  '/forget-password/email-otp',
]);

function emailFromBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const email = (body as Record<string, unknown>).email;
  return typeof email === 'string' && email.trim()
    ? email.trim().toLowerCase()
    : null;
}

export async function assertEmailAuthAccountNotBeingDeleted(
  prisma: AccountDeletionLookup,
  path: string,
  body: unknown,
) {
  if (!GUARDED_EMAIL_AUTH_PATHS.has(path)) return;
  const email = emailFromBody(body);
  if (!email) return;

  const user = await findAccountDeletionStateByEmail(prisma, email);
  if (!user?.accountDeletionRequestedAt) return;

  throw new APIError('FORBIDDEN', {
    code: 'ACCOUNT_DELETION_IN_PROGRESS',
    message: 'ACCOUNT_DELETION_IN_PROGRESS',
  });
}
