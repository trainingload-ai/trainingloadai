const SELF_HOST_MAIL_REQUIRED_AUTH_PATHS = new Set([
  '/request-password-reset',
  '/send-verification-email',
  '/email-otp/send-verification-otp',
  '/email-otp/request-password-reset',
]);

export function isSelfHostMailAuthPathAllowed(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!env.SELF_HOST_MODE?.trim()) return true;
  return !SELF_HOST_MAIL_REQUIRED_AUTH_PATHS.has(path);
}
