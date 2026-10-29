import { Activity, $Enums } from '@prisma/client';

/**
 * TriScore combined stress metric based on Dr. Skiba stress metrics, defined as BikeScore for cycling, GOVSS for running and SwimScore for swimming. On zero fallback to TRIMP Zonal Points for HR based score.
 * @param activity
 */
export const computeTriScore = (activity: Activity) => {
  const score = 0;
  // if (activity.sportType === $Enums.SportType.SWIM) {
  //   score = activity?.swimscore;
  // } else if (activity.sportType === $Enums.SportType.RUN) {
  //   score = activity?.govss;
  // } else if (activity.sportType === $Enums.SportType.CYCLING) {
  //   score = activity?.bikescore;
  // }

  // if (score === 0) {
  //   score = activity?.trimpZonalPoints;
  // }

  return score;
};
