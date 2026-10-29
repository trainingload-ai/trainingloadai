import type { ImportSourceKind, ThirdPartyProvider } from '@prisma/client';

/**
 * Core 只约定来源类型与 Provider ID 的规范化规则，不枚举 Managed Provider。
 * Managed 组合生成的 Prisma Client 可以携带额外枚举值，而这里仍按同一规则工作。
 */
export function providerFromSourceKind(
  kind: ImportSourceKind | string,
): ThirdPartyProvider | null {
  if (kind === 'UNKNOWN') return null;
  if (kind === 'FILE') return 'upload';
  return kind.toLowerCase() as ThirdPartyProvider;
}
