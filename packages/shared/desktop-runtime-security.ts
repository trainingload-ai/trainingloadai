/**
 * 仅供 Desktop 内部的 Next BFF -> Nest 调用使用。
 * 浏览器提供的同名 Header 必须由 BFF 丢弃，不能直接透传。
 */
export const DESKTOP_INTERNAL_CREDENTIAL_HEADER =
  'x-trainingload-desktop-credential';
