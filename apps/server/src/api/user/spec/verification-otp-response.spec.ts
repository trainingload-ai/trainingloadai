import { describe, expect, it } from '@jest/globals';
import { readVerificationOtpResult } from '../verification-otp-response';

describe('readVerificationOtpResult', () => {
  it('preserves a leading-zero OTP returned as response text', async () => {
    const result = await readVerificationOtpResult({
      ok: true,
      status: 200,
      text: async () => '012345',
    });

    expect(result).toBe('012345');
  });

  it('accepts a direct OTP string', async () => {
    await expect(readVerificationOtpResult('654321')).resolves.toBe('654321');
  });

  it('accepts a JSON-quoted OTP string', async () => {
    await expect(readVerificationOtpResult('"001234"')).resolves.toBe(
      '001234',
    );
  });

  it('rejects a malformed response instead of emailing it as an OTP', async () => {
    await expect(readVerificationOtpResult('<html>error</html>')).rejects.toThrow(
      'malformed value',
    );
  });
});
