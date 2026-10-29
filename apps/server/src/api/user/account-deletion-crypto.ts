import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';

const FORMAT_VERSION = 'v1';
const SELF_HOST_KEY_PURPOSE = 'trainingload:self-host:account-deletion:v1';

function selfHostDeletionSecret() {
  if (!process.env.SELF_HOST_MODE?.trim()) return null;
  const instanceSecret =
    process.env.SELF_HOST_AUTH_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!instanceSecret) {
    throw new Error(
      'SELF_HOST_AUTH_SECRET (or BETTER_AUTH_SECRET / AUTH_SECRET) is required for account deletion',
    );
  }
  return createHmac('sha256', instanceSecret)
    .update(SELF_HOST_KEY_PURPOSE)
    .digest('hex');
}

function deletionSecret() {
  const configured = process.env.ACCOUNT_DELETION_SECRET?.trim();
  if (configured) return configured;
  const selfHostSecret = selfHostDeletionSecret();
  if (selfHostSecret) return selfHostSecret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ACCOUNT_DELETION_SECRET is required in production');
  }
  const value =
    process.env.EXTERNAL_PROVIDER_CREDENTIAL_SECRET?.trim() ||
    process.env.INTERNAL_API_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!value) {
    throw new Error(
      'ACCOUNT_DELETION_SECRET (or EXTERNAL_PROVIDER_CREDENTIAL_SECRET / INTERNAL_API_SECRET / AUTH_SECRET) is required',
    );
  }
  return value;
}

function encryptionKey() {
  return createHash('sha256').update(deletionSecret()).digest();
}

export function accountDeletionSubjectHash(userId: string) {
  return createHmac('sha256', deletionSecret())
    .update(`account-deletion:${userId}`)
    .digest('hex');
}

export function encryptAccountDeletionValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptAccountDeletionValue(value: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (version !== FORMAT_VERSION || !ivRaw || !tagRaw || encryptedRaw == null) {
    throw new Error('Invalid account deletion ciphertext');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
