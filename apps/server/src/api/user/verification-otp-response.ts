type TextResponseLike = {
  ok?: boolean;
  status?: number;
  text: () => Promise<string>;
};

/**
 * Better Auth may expose an endpoint result as a native value or as a
 * Response. OTPs must be read as text: a leading-zero value such as 012345 is
 * not a valid JSON number and would make Response.json() throw.
 */
export async function readVerificationOtpResult(
  result: unknown,
): Promise<string> {
  let raw: string;

  if (typeof result === 'string' || typeof result === 'number') {
    raw = String(result);
  } else if (
    result &&
    typeof result === 'object' &&
    typeof (result as TextResponseLike).text === 'function'
  ) {
    const response = result as TextResponseLike;
    if (response.ok === false) {
      throw new Error(
        `Failed to create verification OTP${
          typeof response.status === 'number' ? `: ${response.status}` : ''
        }`,
      );
    }
    raw = await response.text();
  } else {
    throw new Error('Failed to create verification OTP: empty response');
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Failed to create verification OTP: empty value');
  }

  let otp = trimmed;

  // Also tolerate a future adapter returning a JSON-quoted string.
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string' && parsed.trim()) {
        otp = parsed.trim();
      }
    } catch {
      throw new Error('Failed to create verification OTP: malformed value');
    }
  }

  if (!/^\d+$/.test(otp)) {
    throw new Error('Failed to create verification OTP: malformed value');
  }

  return otp;
}
