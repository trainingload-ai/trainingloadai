import type { ThirdPartyCapabilities } from "@shared/third-party-integration";
import {
  thirdPartyDirections,
  NO_THIRD_PARTY_DIRECTION,
} from "@shared/third-party-integration";

export const THIRD_PARTY_PROVIDER_IDS = [
  "intervals_icu",
  "garmin",
  "coros",
] as const;

export const THIRD_PARTY_CAPABILITIES: Record<string, ThirdPartyCapabilities> =
  {
    garmin: {
      completedActivities: thirdPartyDirections("AUTOMATIC", "UNSUPPORTED"),
      plannedWorkouts: NO_THIRD_PARTY_DIRECTION,
      wellness: thirdPartyDirections("AUTOMATIC", "UNSUPPORTED"),
      athleteProfile: thirdPartyDirections("MANUAL", "UNSUPPORTED"),
    },
    coros: {
      completedActivities: thirdPartyDirections("AUTOMATIC", "UNSUPPORTED"),
      plannedWorkouts: thirdPartyDirections("MANUAL", "MANUAL"),
      wellness: thirdPartyDirections("MANUAL", "UNSUPPORTED"),
      athleteProfile: thirdPartyDirections("MANUAL", "UNSUPPORTED"),
    },
    intervals_icu: {
      completedActivities: thirdPartyDirections("AUTOMATIC", "AUTOMATIC"),
      plannedWorkouts: thirdPartyDirections("AUTOMATIC", "AUTOMATIC"),
      wellness: thirdPartyDirections("AUTOMATIC", "UNSUPPORTED"),
      athleteProfile: thirdPartyDirections("AUTOMATIC", "UNSUPPORTED"),
    },
  };
