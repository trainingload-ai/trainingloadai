/**
 * 从训练计划详情「询问 AI 教练」跳转时的 URL 参数 → 首条用户消息。
 * 用户气泡：短文案 + 摘要卡片（不展示 planId）。
 * 模型：同一条 coachMessage 内附 tool_result，携带 planId / 待完成节数。
 * 链式：/ai-coach?intent=plan-followup&planId=...&pending=N
 */

import type { CoachUserMessageBody } from "@/lib/ai-coach-stream";

export const PLAN_FOLLOWUP_TOOL_USE_ID = "client:plan_followup_seed";

export type PlanFollowupSeed = {
  planId: string;
  pending: number;
};

export type PlanFollowupToolResultPayload = {
  kind: "plan_followup_seed";
  version: 1;
  payload: {
    planId: string;
    pendingCount: number;
  };
};

export function parsePlanFollowupFromSearchParams(
  searchParams: URLSearchParams,
): PlanFollowupSeed | null {
  const intent = searchParams.get("intent")?.trim() ?? "";
  if (intent !== "plan-followup") return null;

  const planId = searchParams.get("planId")?.trim() ?? "";
  if (!planId) return null;

  const pendingRaw = searchParams.get("pending")?.trim();
  let pending = 0;
  if (pendingRaw != null && pendingRaw !== "") {
    const n = Number.parseInt(pendingRaw, 10);
    if (Number.isFinite(n) && n >= 0) {
      pending = Math.min(n, 9999);
    }
  }

  return { planId, pending };
}

export function planFollowupDedupeKey(seed: PlanFollowupSeed): string {
  return `pf::${seed.planId}::${seed.pending}`;
}

/** 用户可见短文案（不含 ID；节数在卡片与 payload 中展示） */
export function buildPlanFollowupUserText(locale: string): string {
  if (locale.startsWith("zh")) {
    return "我想跟进当前训练计划，请结合我的完成情况与负荷数据给建议；如需调整排期请协助。";
  }
  if (locale.startsWith("ja")) {
    return "現在のトレーニングプランのフォローアップをお願いします。進捗と負荷を踏まえてアドバイスしてください。必要ならスケジュール調整もお願いします。";
  }
  return "I'd like to follow up on my training plan. Please review my progress and load, and help adjust the schedule if needed.";
}

export function buildPlanFollowupToolResult(
  seed: PlanFollowupSeed,
): PlanFollowupToolResultPayload {
  return {
    kind: "plan_followup_seed",
    version: 1,
    payload: {
      planId: seed.planId,
      pendingCount: seed.pending,
    },
  };
}

export function buildPlanFollowupCoachUserMessage(
  locale: string,
  seed: PlanFollowupSeed,
): CoachUserMessageBody {
  return {
    content: [
      { type: "text", text: buildPlanFollowupUserText(locale) },
      {
        type: "tool_result",
        tool_use_id: PLAN_FOLLOWUP_TOOL_USE_ID,
        content: buildPlanFollowupToolResult(seed),
      },
    ],
  };
}
