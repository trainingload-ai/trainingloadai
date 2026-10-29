export type ActivitySportVisual =
  | 'run'
  | 'cycling'
  | 'swim'
  | 'walking'
  | 'hiking'
  | 'strength'
  | 'stretching'
  | 'hiit'
  | 'yoga'
  | 'rowing'
  | 'elliptical'
  | 'unknown';

export function getActivitySportVisual(
  sportType: string | null | undefined,
  sportDefinitionCode?: string | null,
): ActivitySportVisual {
  if (sportType === 'RUN') return 'run';
  if (sportType === 'CYCLING') return 'cycling';
  if (sportType === 'SWIM') return 'swim';

  switch (String(sportDefinitionCode ?? '').trim().toUpperCase()) {
    case 'WALKING':
      return 'walking';
    case 'HIKING':
      return 'hiking';
    case 'STRENGTH_TRAINING':
      return 'strength';
    case 'STRETCHING':
      return 'stretching';
    case 'HIIT':
      return 'hiit';
    case 'YOGA':
      return 'yoga';
    case 'ROWING':
      return 'rowing';
    case 'ELLIPTICAL':
      return 'elliptical';
    default:
      return 'unknown';
  }
}
