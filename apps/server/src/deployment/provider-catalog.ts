import type { ThirdPartyCapabilities } from '@shared/third-party-integration';
import {
  NO_THIRD_PARTY_DIRECTION,
  thirdPartyDirections,
} from '@shared/third-party-integration';

/** Public-candidate provider catalog. Managed providers are composed elsewhere. */
export const THIRD_PARTY_PROVIDER_IDS = ['intervals_icu'] as const;

export const THIRD_PARTY_CAPABILITIES: Record<string, ThirdPartyCapabilities> = {
  intervals_icu: {
    completedActivities: thirdPartyDirections('AUTOMATIC', 'AUTOMATIC'),
    plannedWorkouts: thirdPartyDirections('AUTOMATIC', 'AUTOMATIC'),
    wellness: thirdPartyDirections('AUTOMATIC', 'UNSUPPORTED'),
    athleteProfile: thirdPartyDirections('AUTOMATIC', 'UNSUPPORTED'),
  },
};

export const UNSUPPORTED_THIRD_PARTY_CAPABILITIES: ThirdPartyCapabilities = {
  completedActivities: NO_THIRD_PARTY_DIRECTION,
  plannedWorkouts: NO_THIRD_PARTY_DIRECTION,
  wellness: NO_THIRD_PARTY_DIRECTION,
  athleteProfile: NO_THIRD_PARTY_DIRECTION,
};
