import type { ThirdPartyCapabilities } from '@shared/third-party-integration';
import { thirdPartyDirections } from '@shared/third-party-integration';

export const THIRD_PARTY_PROVIDER_IDS = ['intervals_icu'] as const;

export const THIRD_PARTY_CAPABILITIES: Record<string, ThirdPartyCapabilities> = {
  intervals_icu: {
    completedActivities: thirdPartyDirections('AUTOMATIC', 'AUTOMATIC'),
    plannedWorkouts: thirdPartyDirections('AUTOMATIC', 'AUTOMATIC'),
    wellness: thirdPartyDirections('AUTOMATIC', 'UNSUPPORTED'),
    athleteProfile: thirdPartyDirections('AUTOMATIC', 'UNSUPPORTED'),
  },
};
