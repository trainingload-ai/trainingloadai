/**
 * 从裸 scheme（如 `app:`）或完整 redirect URI
 *（如 `trainingloadmobileapp://oauth`）提取自定义 URL scheme 协议。
 */
function protocolFromValue(value: string) {
  try {
    return value.endsWith(':') ? value : new URL(value).protocol;
  } catch {
    return null;
  }
}

/**
 * 仅允许同源 web 回跳 URL，或已配置的移动端 OAuth scheme。
 * 其它一律回退到 `{appUrl}/account`，防止开放重定向。
 */
export function sanitizeExternalProviderReturnUrl(
  value: string | undefined,
  appUrl: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const fallback = `${appUrl.replace(/\/$/, '')}/account`;
  if (!value) return fallback;

  try {
    const parsed = new URL(value, appUrl);
    if (parsed.origin === new URL(appUrl).origin) return parsed.toString();

    const mobileProtocols = new Set(
      [
        'trainingloadmobileapp:',
        env.OAUTH_MOBILE_REDIRECT_URI ?? '',
        ...(env.OAUTH_MOBILE_REDIRECT_URIS ?? '').split(','),
      ]
        .map((candidate) => protocolFromValue(candidate.trim()))
        .filter((protocol): protocol is string => Boolean(protocol)),
    );
    return mobileProtocols.has(parsed.protocol) ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}
