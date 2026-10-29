import { Injectable, OnModuleInit } from '@nestjs/common';
import { CoachActionService } from './core/coach-action.service';
import { COACH_MUTATION_UNDO_BUNDLES } from './core/coach-mutation-undo-bundles';

/**
 * 将 `COACH_MUTATION_UNDO_BUNDLES` 中的撤销处理器注册到 CoachActionService（内存反查表）。
 */
@Injectable()
export class AiCoachMutationBootstrap implements OnModuleInit {
  constructor(private readonly coachActions: CoachActionService) {}

  onModuleInit(): void {
    for (const bundle of COACH_MUTATION_UNDO_BUNDLES) {
      this.coachActions.registerUndoHandler(bundle.type, bundle.undoHandler);
    }
  }
}
