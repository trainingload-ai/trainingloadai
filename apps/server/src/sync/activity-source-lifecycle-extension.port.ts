import type { Prisma, ThirdPartyProvider } from '@prisma/client';

export type ActivitySourceIdentity = {
  provider: ThirdPartyProvider | null;
  externalId: string | null;
  sourceUid: string;
  metadata: unknown;
};

export interface ActivitySourceLifecycleExtension {
  additionalExternalIdFilters(args: {
    provider: ThirdPartyProvider;
    externalId: string;
  }): Prisma.ActivitySourceWhereInput[];
  externalIdForSource(source: ActivitySourceIdentity): string | null;
}

const deploymentExtensions: ActivitySourceLifecycleExtension[] = [];

export function registerActivitySourceLifecycleExtension(
  extension: ActivitySourceLifecycleExtension,
): () => void {
  if (deploymentExtensions.includes(extension)) {
    throw new Error('Activity source lifecycle extension already registered');
  }
  deploymentExtensions.push(extension);
  return () => {
    const index = deploymentExtensions.indexOf(extension);
    if (index >= 0) deploymentExtensions.splice(index, 1);
  };
}

export function additionalActivitySourceExternalIdFilters(args: {
  provider: ThirdPartyProvider;
  externalId: string;
}): Prisma.ActivitySourceWhereInput[] {
  return deploymentExtensions.flatMap((extension) =>
    extension.additionalExternalIdFilters(args),
  );
}

export function externalIdForActivitySource(
  source: ActivitySourceIdentity,
): string | null {
  if (!source.externalId) return null;
  for (const extension of deploymentExtensions) {
    const value = extension.externalIdForSource(source);
    if (value != null) return value;
  }
  return source.externalId;
}
