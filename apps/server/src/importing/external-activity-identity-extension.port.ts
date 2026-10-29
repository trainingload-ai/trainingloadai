import type { ThirdPartyProvider } from '@prisma/client';

export type ExternalActivityIdentityInput = {
  provider: ThirdPartyProvider;
  userId: string;
  sourceUid: string;
  externalId: string;
  metadata?: Record<string, unknown> | null;
};

export interface ExternalActivityIdentityExtension {
  resolveExternalId(input: ExternalActivityIdentityInput): string | undefined;
}

const extensions: ExternalActivityIdentityExtension[] = [];

export function registerExternalActivityIdentityExtension(
  extension: ExternalActivityIdentityExtension,
) {
  extensions.push(extension);
  return () => {
    const index = extensions.indexOf(extension);
    if (index >= 0) extensions.splice(index, 1);
  };
}

export function resolveExternalActivityId(
  input: ExternalActivityIdentityInput,
): string {
  for (const extension of extensions) {
    const resolved = extension.resolveExternalId(input);
    if (resolved !== undefined) return resolved;
  }
  return input.externalId || `${input.userId}:${input.sourceUid}`;
}
