export class HeartRateBaseResultDto {
  /**
   * Max Heart Rate
   */
  max?: number;
  /**
   * Min Heart Rate
   */
  min?: number;
  /**
   * Average Heart Rate
   */
  avg?: number;
  /**
   * Heart Rate Reserve
   */
  reserve?: number;
  /**
   * Heart Rate Intensity Percentage
   */
  intensity?: number;

  /**
   * User Max Heart Rate
   */
  userMaxHR?: number;

  /**
   * Average Heart Rate % of User Max HR
   */
  avgPctMax?: number;

  /**
   * Max Heart Rate % of User Max HR
   */
  maxPctMax?: number;

  /**
   * Calories Burned
   */
  calories?: number;

  /**
   * Training Impulse
   */
  trimp?: number;

  /**
   * Heart Rate TSS
   */
  hrTss?: number;

  /**
   * Aerobic Decoupling
   */
  paHr?: number;

  /**
   * Power-to-weight/HR
   */
  pwHr?: number;

  /**
   * Peak EPOC
   */
  peakEpoc?: number;

  /**
   * Max Heart Rate Drop (Recovery)
   */
  maxHrDrop?: number;
}
