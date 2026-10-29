type WorkerLogger = {
  log(message: string): unknown;
  warn(message: string): unknown;
};

export type WorkerQueueSnapshot = {
  remaining: number;
  waiting?: number;
  running?: number;
};

export class WorkerDrainProgress {
  private sequence = 0;

  constructor(
    private readonly logger: WorkerLogger,
    private readonly queueName: string,
    private readonly readSnapshot: () => Promise<WorkerQueueSnapshot>,
  ) {}

  private async snapshot() {
    try {
      return await this.readSnapshot();
    } catch (error) {
      this.logger.warn(
        `[${this.queueName}][编排] 读取进度失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private formatSnapshot(snapshot: WorkerQueueSnapshot | null) {
    if (!snapshot) return '队列剩余=未知';
    const breakdown =
      snapshot.waiting != null && snapshot.running != null
        ? `（等待=${snapshot.waiting}，处理中=${snapshot.running}）`
        : '';
    return `队列剩余=${snapshot.remaining}${breakdown}`;
  }

  async run<T>(args: {
    batchPosition: number;
    batchTotal: number;
    details: string;
    task: () => Promise<T>;
  }): Promise<T> {
    this.sequence += 1;
    const sequence = this.sequence;
    const progress = `本轮第=${sequence} 当前批次=${args.batchPosition}/${args.batchTotal}`;
    const before = await this.snapshot();
    const startedAt = Date.now();
    this.logger.log(
      `[${this.queueName}][编排] 开始 ${progress} ${this.formatSnapshot(before)}（含当前任务） ${args.details}`,
    );

    let returned = false;
    try {
      const result = await args.task();
      returned = true;
      return result;
    } finally {
      const elapsedMs = Date.now() - startedAt;
      const after = await this.snapshot();
      this.logger.log(
        `[${this.queueName}][编排] 结束 ${progress} ${this.formatSnapshot(after)} 执行结果=${returned ? 'RETURNED' : 'THREW'} 耗时=${elapsedMs}ms ${args.details}`,
      );
    }
  }
}
