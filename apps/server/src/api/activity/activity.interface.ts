export interface SwimReviewResult {
  // swim pool length
  poolLength: number | undefined;
  poolLengthUnit: string | undefined;

  lengths: {
    timestamp: Date;
    index: number;
    /**
     * current duration
     */
    duration: number;
    /**
     * current elapsed time
     */
    elapsedTime: number;
    /**
     * current distance
     */
    distance: number;
    /**
     * total strokes
     */
    totalStrokes: number;
    /**
     * current speed
     */
    speed: number;
    /**
     * current swim stroke
     */
    swimStroke: string;
    /**
     * current avg swimming cadence
     */
    avgSwimmingCadence: number;
    /**
     * current stroke count
     */
    strokeCount: number;
    /**
     * current start time
     */
    startTime: Date | null;
    /**
     * current message index
     */
    messageIndex: number | null;
  }[];
}
