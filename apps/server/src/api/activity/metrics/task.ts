import type { MetricsContext, MetricsTaskKey } from './context';

export interface MetricsTask {
  key: MetricsTaskKey;
  dependsOn?: MetricsTaskKey[];

  pre(ctx: MetricsContext): Promise<MetricsContext>;
  exec(ctx: MetricsContext): Promise<MetricsContext>;
  post(ctx: MetricsContext): Promise<MetricsContext>;
}
