import type { MutationToolBundle } from './mutation-tool.factory';
import { activityDescriptionMutationBundle } from './tools/mutationActivityDescription.tool';
import { activitySessionRpeMutationBundle } from './tools/mutationActivitySessionRpe.tool';
import { userBodyWeightMutationBundle } from './tools/mutationUserBodyWeight.tool';

/**
 * 需在启动期注册到 `CoachActionService` 的撤销实现（仅 **LOW 风险** 且聊天内可 30s 撤销的类型）。
 * HIGH 风险动作无撤销窗口，工厂里可保留空 `undo`，但**不要**加入本表。
 *
 * 新增可撤销 mutation：在此追加 bundle，无需改 `ai-coach-mutation-bootstrap` 的循环体。
 */
export const COACH_MUTATION_UNDO_BUNDLES: ReadonlyArray<
  MutationToolBundle<object, unknown>
> = [
  activityDescriptionMutationBundle,
  activitySessionRpeMutationBundle,
  userBodyWeightMutationBundle,
];
