export type ActivityMapThumbProvider = 'local' | 'mapbox';

export function resolveActivityMapThumbProvider(
  env: NodeJS.ProcessEnv = process.env,
  explicit?: unknown,
): ActivityMapThumbProvider | 'invalid' {
  const raw = String(explicit ?? env.ACTIVITY_MAP_THUMB_PROVIDER ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return env.SELF_HOST_MODE?.trim() ? 'local' : 'mapbox';
  if (raw === 'local' || raw === 'mapbox') return raw;
  return 'invalid';
}
