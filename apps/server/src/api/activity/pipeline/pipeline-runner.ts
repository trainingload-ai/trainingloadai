import { Logger } from '@nestjs/common';

export interface PipelineStage<TCtx> {
  name: string;
  before?: (ctx: TCtx) => Promise<void> | void;
  run: (ctx: TCtx) => Promise<void> | void;
  after?: (ctx: TCtx) => Promise<void> | void;
}

/**
 * 顺序执行管道阶段；任一阶段抛错则中断并向上抛出（由调用方处理状态回滚等）。
 */
export async function runPipeline<TCtx>(
  ctx: TCtx,
  stages: PipelineStage<TCtx>[],
  logger?: Logger,
): Promise<void> {
  for (const stage of stages) {
    const label = `[pipeline:${stage.name}]`;
    try {
      if (stage.before) {
        await stage.before(ctx);
      }
      await stage.run(ctx);
      if (stage.after) {
        await stage.after(ctx);
      }
    } catch (e) {
      if (logger) {
        logger.error(
          `${label} 执行失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
      throw e;
    }
  }
}
