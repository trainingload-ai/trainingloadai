/** 所有第三方 task 共用的单一调度策略。 */
export type ThirdPartyScheduleContext = {
  startHourLocal: number;
  staleStartedMinutes: number;
  batchSize: number;
};

export interface ThirdPartyScheduledTask {
  readonly name: string;
  run(context: ThirdPartyScheduleContext): Promise<void>;
}

export type ThirdPartyScheduledTaskResult = {
  name: string;
  status: 'SUCCEEDED' | 'FAILED';
  error?: string;
};
