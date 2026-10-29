export interface HealthDataProviderPolicyExtension {
  priority(provider: string): number | undefined;
}

const corePriority: Readonly<Record<string, number>> = {
  MANUAL: 100,
  INTERVALS_ICU: 60,
  HEALTH_CONNECT: 30,
};

const extensions: HealthDataProviderPolicyExtension[] = [];

export function registerHealthDataProviderPolicyExtension(
  extension: HealthDataProviderPolicyExtension,
) {
  extensions.push(extension);
  return () => {
    const index = extensions.indexOf(extension);
    if (index >= 0) extensions.splice(index, 1);
  };
}

export function healthDataProviderPriority(provider?: string | null): number {
  const normalized = String(provider ?? '');
  const core = corePriority[normalized];
  if (core !== undefined) return core;
  for (const extension of extensions) {
    const priority = extension.priority(normalized);
    if (priority !== undefined) return priority;
  }
  return 0;
}
