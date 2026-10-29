import { Injectable } from '@nestjs/common';

import type {
  ThirdPartyScheduleContext,
  ThirdPartyScheduledTask,
  ThirdPartyScheduledTaskResult,
} from './third-party-scheduled-task';

/** 单个注册表，用于定期第三方集成任务。 */
@Injectable()
export class ThirdPartyScheduledTaskRegistry {
  private readonly tasks: ThirdPartyScheduledTask[];

  constructor(tasks: readonly ThirdPartyScheduledTask[]) {
    this.tasks = [...tasks];
  }

  // 获取所有任务名称
  taskNames() {
    return this.tasks.map((task) => task.name);
  }

  /** 并发调度所有任务；一个提供者失败不会阻塞其他提供者。 */
  runAll(
    context: ThirdPartyScheduleContext,
  ): Promise<ThirdPartyScheduledTaskResult[]> {
    return Promise.all(
      this.tasks.map(async (task) => {
        try {
          await task.run(context);
          return {
            name: task.name,
            status: 'SUCCEEDED' as const,
          };
        } catch (error) {
          return {
            name: task.name,
            status: 'FAILED' as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }
}
