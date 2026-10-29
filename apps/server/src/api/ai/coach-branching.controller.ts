import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { CoachBranchingService } from './coach-branching.service';
import { CoachAssessmentCaseService } from './athlete-state/coach-assessment-case.service';
import { RequiresRuntimeCapability } from '@/runtime-capabilities/requires-runtime-capability.decorator';

type OpenBranchBody = {
  planId?: string;
  anchor?: { baseEventSeq?: number; baseCommitId?: string | null };
  openReason?: string;
  sourceNode?: unknown;
};

type CloseBranchBody = {
  mode?: string;
  reason?: string;
};

type AppendBranchMessageBody = {
  role?: string;
  message?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  parentMsgId?: string | null;
  tokenIn?: number | null;
  tokenOut?: number | null;
};

type CompactBranchBody = {
  fromSeq?: number;
  toSeq?: number;
  summaryText?: string;
  summaryJson?: unknown;
  model?: string;
};

type SquashBranchBody = {
  mode?: 'AUTO' | 'MANUAL';
  riskTier?: 'LOW' | 'HIGH';
  decisionType?: string;
  payload?: unknown;
  rationale?: string;
  confidence?: number;
  options?: Array<{
    optionKey: string;
    title?: string;
    pros?: unknown;
    cons?: unknown;
    impact?: unknown;
    isSelected?: boolean;
  }>;
};

type ApproveDecisionBody = {
  selectedOptionKey?: string;
  comment?: string;
};

type RejectDecisionBody = {
  reason?: string;
};

type ApplyDecisionBody = {
  expectedBaseEventSeq?: number;
};

type RebaseDecisionBody = {
  strategy?: string;
};

@Controller('ai/coach')
@RequiresRuntimeCapability('ai')
export class CoachBranchingController {
  constructor(
    private readonly branching: CoachBranchingService,
    private readonly assessmentCases: CoachAssessmentCaseService,
  ) {}

  @Post('assessment-cases/:caseId/open')
  openAssessmentCase(
    @Param('caseId') caseId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.assessmentCases.open(userId, caseId);
  }

  @Post('assessment-cases/:caseId/dismiss')
  dismissAssessmentCase(
    @Param('caseId') caseId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.assessmentCases.dismiss(userId, caseId);
  }

  @Post('contexts/:contextId/branches')
  async openBranch(
    @Param('contextId') contextId: string,
    @CurrentUserId() userId: string,
    @Body() body?: OpenBranchBody,
  ) {
    return this.branching.openBranch({
      userId,
      contextId,
      planId: body?.planId,
      anchor: body?.anchor,
      openReason: body?.openReason,
      sourceNode: body?.sourceNode,
    });
  }

  @Post('branches/:branchId/close')
  async closeBranch(
    @Param('branchId') branchId: string,
    @CurrentUserId() userId: string,
    @Body() body?: CloseBranchBody,
  ) {
    return this.branching.closeBranch({
      userId,
      branchId,
      mode: body?.mode === 'ABANDONED' ? 'ABANDONED' : 'CLOSED',
      reason: body?.reason,
    });
  }

  @Post('branches/:branchId/messages')
  async appendBranchMessage(
    @Param('branchId') branchId: string,
    @CurrentUserId() userId: string,
    @Body() body?: AppendBranchMessageBody,
  ) {
    return this.branching.appendBranchMessage({
      userId,
      branchId,
      role: body?.role,
      message: body?.message,
      toolCalls: body?.toolCalls,
      toolResults: body?.toolResults,
      parentMsgId: body?.parentMsgId,
      tokenIn: body?.tokenIn,
      tokenOut: body?.tokenOut,
    });
  }

  @Post('branches/:branchId/compact')
  async compactBranch(
    @Param('branchId') branchId: string,
    @CurrentUserId() userId: string,
    @Body() body?: CompactBranchBody,
  ) {
    return this.branching.compactBranch({
      userId,
      branchId,
      fromSeq: Number(body?.fromSeq),
      toSeq: Number(body?.toSeq),
      summaryText: body?.summaryText,
      summaryJson: body?.summaryJson,
      model: body?.model,
    });
  }

  @Post('branches/:branchId/squash')
  async squashBranch(
    @Param('branchId') branchId: string,
    @CurrentUserId() userId: string,
    @Body() body?: SquashBranchBody,
  ) {
    return this.branching.squashBranch({
      userId,
      branchId,
      mode: body?.mode,
      riskTier: body?.riskTier,
      decisionType: body?.decisionType,
      payload: body?.payload,
      rationale: body?.rationale,
      confidence: body?.confidence,
      options: body?.options,
    });
  }

  @Post('decisions/:decisionId/approve')
  async approveDecision(
    @Param('decisionId') decisionId: string,
    @CurrentUserId() userId: string,
    @Body() body?: ApproveDecisionBody,
  ) {
    return this.branching.approveDecision({
      userId,
      decisionId,
      selectedOptionKey: body?.selectedOptionKey,
      comment: body?.comment,
    });
  }

  @Post('decisions/:decisionId/reject')
  async rejectDecision(
    @Param('decisionId') decisionId: string,
    @CurrentUserId() userId: string,
    @Body() body?: RejectDecisionBody,
  ) {
    const result = await this.branching.rejectDecision({
      userId,
      decisionId,
      reason: body?.reason,
    });
    await this.assessmentCases.decisionChanged(userId, decisionId, 'REJECTED');
    return result;
  }

  @Post('decisions/:decisionId/apply')
  async applyDecision(
    @Param('decisionId') decisionId: string,
    @CurrentUserId() userId: string,
    @Body() body?: ApplyDecisionBody,
  ) {
    const result = await this.branching.applyDecision({
      userId,
      decisionId,
      expectedBaseEventSeq:
        typeof body?.expectedBaseEventSeq === 'number'
          ? body.expectedBaseEventSeq
          : undefined,
    });
    await this.assessmentCases.decisionChanged(
      userId,
      decisionId,
      result.result === 'APPLIED'
        ? 'APPLIED'
        : result.result === 'REBASE_REQUIRED'
          ? 'REBASE_REQUIRED'
          : 'SKIPPED',
    );
    return result;
  }

  @Post('decisions/:decisionId/rebase')
  async rebaseDecision(
    @Param('decisionId') decisionId: string,
    @CurrentUserId() userId: string,
    @Body() body?: RebaseDecisionBody,
  ) {
    return this.branching.rebaseDecision({
      userId,
      decisionId,
      strategy: body?.strategy,
    });
  }

  @Get('contexts/:contextId/branches')
  async listContextBranches(
    @Param('contextId') contextId: string,
    @CurrentUserId() userId: string,
    @Query('status') status?: string,
  ) {
    return this.branching.listContextBranches({
      userId,
      contextId,
      status,
    });
  }

  @Get('branches/:branchId/timeline')
  async getBranchTimeline(
    @Param('branchId') branchId: string,
    @CurrentUserId() userId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    return this.branching.getBranchTimeline({
      userId,
      branchId,
      limit: Number.isFinite(parsed) ? parsed : undefined,
    });
  }

  @Get('contexts/:contextId/commits')
  async listContextCommits(
    @Param('contextId') contextId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.branching.listContextCommits({
      userId,
      contextId,
    });
  }

  @Get('pending-decisions')
  async listPendingDecisions(@CurrentUserId() userId: string) {
    return this.branching.listPendingDecisions({ userId });
  }
}
