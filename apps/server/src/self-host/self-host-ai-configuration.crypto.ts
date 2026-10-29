import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

const ENVELOPE_VERSION = 'v1';
const KEY_SALT = 'trainingload.ai/self-host/ai-configuration';
const KEY_INFO = 'provider-api-key';

function encryptionKey(authSecret: string): Buffer {
  if (authSecret.trim().length < 32) {
    throw new Error(
      'SELF_HOST_AUTH_SECRET must contain at least 32 characters',
    );
  }
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(authSecret, 'utf8'),
      Buffer.from(KEY_SALT, 'utf8'),
      Buffer.from(KEY_INFO, 'utf8'),
      32,
    ),
  );
}

export function encryptSelfHostAiApiKey(
  plaintext: string,
  authSecret: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(authSecret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSelfHostAiApiKey(
  envelope: string,
  authSecret: string,
): string {
  const [version, iv, tag, ciphertext, ...extra] = envelope.split('.');
  if (
    version !== ENVELOPE_VERSION ||
    !iv ||
    !tag ||
    ciphertext === undefined ||
    extra.length > 0
  ) {
    throw new Error('Unsupported self-host AI credential envelope');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(authSecret),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
