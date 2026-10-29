import type { QueryClient } from "@tanstack/react-query";
import { getApiBaseUrl, getRegion } from "@/lib/config";
import {
  queryKeys,
  AI_COACH_SESSIONS_QUERY_KEY,
  AI_COACH_SESSIONS_SIDEBAR_QUERY_KEY,
  AI_COACH_SESSIONS_HISTORY_QUERY_KEY,
} from "@/lib/query-keys";
import { isSupportedLocale } from "@/i18n/locales";
import { assertCoachDecisionApplied } from "@shared/coach-adjustment-decision";
import type {
  CoachAssessmentInquiry,
  OpenCoachAssessmentCaseResult,
} from "@shared/coach-assessment";

export {
  AI_COACH_SESSIONS_QUERY_KEY,
  AI_COACH_SESSIONS_SIDEBAR_QUERY_KEY,
  AI_COACH_SESSIONS_HISTORY_QUERY_KEY,
};

const getClientLang = (): string => {
  // AI Coach 接口需要知道当前路由语言，SSR 阶段没有 window 时默认英文。
  if (typeof window === "undefined") return "en";
  const pathname = window.location.pathname || "";
  const firstSeg = pathname.split("/").filter(Boolean)[0];
  return isSupportedLocale(firstSeg) ? firstSeg : "en";
};

const coachHeaders = (): Record<string, string> => ({
  // Coach 相关请求都走同一组 region/lang header，和服务端会话上下文保持一致。
  "Content-Type": "application/json",
  "X-Region": getRegion(),
  ...(getClientLang() ? { "x-lang": getClientLang() } : {}),
});

export async function cancelCoachRun(
  runId: string,
  attemptId: string,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/ai/coach/runs/${encodeURIComponent(runId)}/cancel`,
    {
      method: "POST",
      headers: coachHeaders(),
      credentials: "include",
      body: JSON.stringify({ attemptId }),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 401 ? "Unauthorized" : "Cancel request failed",
    );
}

export type CoachSessionListItem = {
  id: string;
  title: string | null;
  updatedAt: string;
  /** ISO；非空表示置顶 */
  pinnedAt: string | null;
  reviewScope?: "daily" | "weekly" | "monthly" | null;
  lastMessagePreview: string | null;
  /** 最近一条助手回复摘要（旧接口可能缺省） */
  lastReplyPreview?: string | null;
  /** `review-digest-*` 复盘会话对应的数据统计窗口（ISO） */
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type CoachSessionsPage = {
  items: CoachSessionListItem[];
  nextOffset: number | null;
};

export async function fetchCoachSessionsPage(
  offset = 0,
  take = 20,
  kind: "chat" | "review" = "chat",
  reviewScope?: "daily" | "weekly" | "monthly",
): Promise<CoachSessionsPage | undefined> {
  // 会话列表支持分页加载，侧栏和历史页共用这一个接口封装。
  const params = new URLSearchParams();
  params.set("take", String(take));
  params.set("offset", String(offset));
  params.set("kind", kind);
  if (reviewScope) params.set("reviewScope", reviewScope);

  const response = await fetch(
    `${getApiBaseUrl()}/ai/coach/sessions?${params.toString()}`,
    {
      headers: coachHeaders(),
      credentials: "include",
    },
  );

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    return undefined;
  }
  const body = (await response.json()) as { data?: CoachSessionsPage };
  return body.data;
}

/** 创建空会话，sid 由服务端生成 */
export async function createCoachSession(
  lang?: string,
  kind: "chat" | "review" = "chat",
  reviewScope?: "daily" | "weekly" | "monthly",
): Promise<CoachSessionListItem> {
  const response = await fetch(`${getApiBaseUrl()}/ai/coach/sessions`, {
    method: "POST",
    headers: coachHeaders(),
    credentials: "include",
    body: JSON.stringify({
      ...(lang?.trim() ? { lang: lang.trim() } : {}),
      kind,
      ...(reviewScope ? { reviewScope } : {}),
    }),
  });

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `POST coach session failed (${response.status})`);
  }
  const body = (await response.json()) as { data?: CoachSessionListItem };
  if (!body.data?.id) {
    throw new Error("Invalid response");
  }
  return body.data;
}

export async function patchCoachSession(
  sid: string,
  body: { title?: string | null; pinned?: boolean },
): Promise<CoachSessionListItem> {
  // 标题和置顶状态都属于会话元信息，统一 PATCH 同一个资源。
  const enc = encodeURIComponent(sid);
  const response = await fetch(`${getApiBaseUrl()}/ai/coach/sessions/${enc}`, {
    method: "PATCH",
    headers: coachHeaders(),
    credentials: "include",
    body: JSON.stringify(body),
  });

  let json: { data?: CoachSessionListItem; message?: string } | undefined;
  try {
    json = (await response.json()) as {
      data?: CoachSessionListItem;
      message?: string;
    };
  } catch {
    json = undefined;
  }

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const msg =
      typeof json?.message === "string" && json.message.trim()
        ? json.message
        : `PATCH coach session failed (${response.status})`;
    throw new Error(msg);
  }
  if (!json?.data) {
    throw new Error("Invalid response");
  }
  return json.data;
}

/** 编辑用户消息并删除该条之后的所有消息（服务端） */
export async function patchCoachUserMessage(
  sid: string,
  messageId: string,
  content: string,
): Promise<CoachMessageRow[]> {
  // 编辑历史消息后服务端会裁剪其后的上下文，返回裁剪后的消息列表供前端重建会话。
  const encSid = encodeURIComponent(sid);
  const encMid = encodeURIComponent(messageId);
  const response = await fetch(
    `${getApiBaseUrl()}/ai/coach/sessions/${encSid}/messages/${encMid}`,
    {
      method: "PATCH",
      headers: coachHeaders(),
      credentials: "include",
      body: JSON.stringify({ content }),
    },
  );

  let json: { data?: CoachMessageRow[]; message?: string } | undefined;
  try {
    json = (await response.json()) as {
      data?: CoachMessageRow[];
      message?: string;
    };
  } catch {
    json = undefined;
  }

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const msg =
      typeof json?.message === "string" && json.message.trim()
        ? json.message
        : `PATCH coach message failed (${response.status})`;
    throw new Error(msg);
  }
  return json?.data ?? [];
}

export async function deleteCoachSession(sid: string): Promise<boolean> {
  const enc = encodeURIComponent(sid);
  const response = await fetch(`${getApiBaseUrl()}/ai/coach/sessions/${enc}`, {
    method: "DELETE",
    headers: coachHeaders(),
    credentials: "include",
  });

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }
  return response.ok;
}

export type CoachMessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  message?: unknown | null;
  createdAt: string;
};

export async function fetchCoachSessionMessages(
  sid: string,
): Promise<CoachMessageRow[]> {
  // 新建会话可能先有 sid、后有消息行，404 在前端视为“空会话”。
  const enc = encodeURIComponent(sid);
  const response = await fetch(
    `${getApiBaseUrl()}/ai/coach/sessions/${enc}/messages?protocolVersion=2`,
    {
      headers: coachHeaders(),
      credentials: "include",
    },
  );

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }
  /** 新 sid 尚无会话行时 Nest 返回 404；React Query 不允许 queryFn 成功态返回 undefined */
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`GET coach session messages failed (${response.status})`);
  }
  const body = (await response.json()) as { data?: CoachMessageRow[] };
  return body.data ?? [];
}

/** 教练写动作类型（与服务端 prisma enum CoachActionType 对齐） */
export type CoachActionType =
  | "PLAN_WORKOUT_ADD"
  | "PLAN_WORKOUT_UPDATE"
  | "PLAN_WORKOUT_STATUS"
  | "PLAN_SHIFT"
  | "PLAN_LIFECYCLE"
  | "ACTIVITY_LINK"
  | "ACTIVITY_UNLINK"
  | "ACTIVITY_META_UPDATE"
  | "ACTIVITY_SESSION_RPE"
  | "ACTIVITY_DELETE"
  | "USER_THRESHOLD_UPDATE"
  | "USER_BODY_METRIC_UPDATE"
  | "COMPETITION_EVENT_MUTATION";

/** 教练写动作风险分级（与服务端 prisma enum CoachActionRiskTier 对齐） */
export type CoachActionRiskTier = "LOW" | "HIGH";

export type CoachActionListItem = {
  id: string;
  type: CoachActionType;
  riskTier: CoachActionRiskTier;
  summary: string;
  /** ISO 时间字符串 */
  createdAt: string;
  /** 撤销窗口截止；HIGH 风险动作恒为 null */
  undoUntil: string | null;
  /** 已撤销时间；非空表示已撤销 */
  undoneAt: string | null;
  /** 关联的 assistant 消息块 id（来自 tool_use.id） */
  messageId: string | null;
  /** 教练会话 sid */
  sid: string | null;
};

/**
 * 列出最近的教练写动作。
 * - 默认按 userId 全量；带 sid 时只看该会话内
 * - 用于「我都帮你做了什么」复盘 + Phase 1 增量挂卡片
 */
export async function fetchCoachActions(args?: {
  sid?: string | null;
  take?: number;
}): Promise<CoachActionListItem[]> {
  const params = new URLSearchParams();
  if (args?.sid) params.set("sid", args.sid);
  if (args?.take !== undefined) params.set("take", String(args.take));
  const query = params.toString();
  const url = `${getApiBaseUrl()}/ai/coach/actions${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    headers: coachHeaders(),
    credentials: "include",
  });
  if (response.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    return [];
  }
  const body = (await response.json()) as {
    data?: { items?: CoachActionListItem[] };
  };
  return body.data?.items ?? [];
}

/**
 * 撤销一次写动作。
 * - 仅 LOW 风险动作在 30s 内可撤销；超出窗口或 HIGH 风险动作会抛 Error
 * - 服务端通过 reverseData + 注册的 undo handler 反向执行业务
 */
export async function undoCoachAction(
  id: string,
): Promise<{ id: string; undoneAt: string | null }> {
  const enc = encodeURIComponent(id);
  const response = await fetch(
    `${getApiBaseUrl()}/ai/coach/actions/${enc}/undo`,
    {
      method: "POST",
      headers: coachHeaders(),
      credentials: "include",
    },
  );

  let json:
    | { data?: { id: string; undoneAt: string | null }; message?: string }
    | undefined;
  try {
    json = (await response.json()) as {
      data?: { id: string; undoneAt: string | null };
      message?: string;
    };
  } catch {
    json = undefined;
  }

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const msg =
      typeof json?.message === "string" && json.message.trim()
        ? json.message
        : `POST coach action undo failed (${response.status})`;
    throw new Error(msg);
  }
  if (!json?.data?.id) {
    throw new Error("Invalid response");
  }
  return json.data;
}

export type CoachDecisionRebaseResult = {
  branch: {
    id: string;
    contextId: string;
    status: string;
    baseEventSeq?: number;
    baseCommitId?: string | null;
  };
  source?: {
    branchId?: string | null;
    decisionId?: string | null;
    fromEventSeq?: number | null;
    toEventSeq?: number | null;
  };
};

export type PendingCoachDecision = {
  id: string;
  branchId: string;
  openReason: string;
  contextId: string;
  planId: string;
  planTitle: string | null;
  decisionType: string;
  riskTier: string;
  rationale: string | null;
  confidence: number | null;
  payload: Record<string, unknown>;
  options: Array<{
    optionKey: string;
    title: string | null;
    isSelected: boolean;
  }>;
  workout: {
    id: string | null;
    name: string | null;
    fromWeekIndex: number | null;
    fromDayIndex: number | null;
    weekIndex: number | null;
    dayIndex: number | null;
    status: string | null;
  };
  review: {
    scale: string | null;
    promptVersion: string | null;
    source: string | null;
    evidenceCodes: string[];
  } | null;
  adjustment: {
    kind: string | null;
    before: CoachDecisionImpactSide;
    after: CoachDecisionImpactSide | null;
    changes: Array<{
      field: string;
      before: string;
      after: string;
      reason: string | null;
    }>;
  } | null;
  createdAt: string;
};

export type CoachDecisionImpactSide = {
  name: string | null;
  date: string | null;
  summary: string | null;
  expectedLoad: number | null;
};

export type CoachReviewGuidance = {
  id: string;
  contextId: string;
  planId: string;
  planTitle: string | null;
  rationale: string;
  scale: string;
  evidenceCodes: string[];
  createdAt: string;
};

export type CoachHomeReviewState = {
  decisions: PendingCoachDecision[];
  guidance: CoachReviewGuidance | null;
  inquiry: CoachAssessmentInquiry | null;
};

function readCoachApplyResult(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const rec = json as Record<string, unknown>;
  if (typeof rec.result === "string") return rec.result;
  const data = rec.data;
  if (data && typeof data === "object") {
    const result = (data as { result?: unknown }).result;
    if (typeof result === "string") return result;
  }
  return undefined;
}

async function postCoachDecision(
  decisionId: string,
  action: "approve" | "apply" | "reject",
  body?: Record<string, unknown>,
): Promise<unknown> {
  const enc = encodeURIComponent(decisionId);
  const response = await fetch(
    `${getApiBaseUrl()}/ai/coach/decisions/${enc}/${action}`,
    {
      method: "POST",
      headers: coachHeaders(),
      credentials: "include",
      body: JSON.stringify(body ?? {}),
    },
  );
  if (response.status === 401) throw new Error("Unauthorized");
  if (!response.ok) {
    let message = `POST coach decision ${action} failed (${response.status})`;
    try {
      const json = (await response.json()) as { message?: string };
      if (typeof json?.message === "string" && json.message.trim()) {
        message = json.message;
      }
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    return {};
  }
}

/** 首页叠卡：拉当前用户所有可展示的 PROPOSED Decision。 */
export async function fetchPendingCoachDecisions(): Promise<
  PendingCoachDecision[]
> {
  return (await fetchCoachHomeReviewState()).decisions;
}

/** 首页叠卡一次拉取待确认变更与无需改计划的训练指导，避免串行请求。 */
export async function fetchCoachHomeReviewState(): Promise<CoachHomeReviewState> {
  const response = await fetch(
    `${getApiBaseUrl()}/ai/coach/pending-decisions`,
    {
      headers: coachHeaders(),
      credentials: "include",
    },
  );
  if (response.status === 401) throw new Error("Unauthorized");
  if (!response.ok) return { decisions: [], guidance: null, inquiry: null };
  const json = (await response.json()) as {
    data?: {
      decisions?: PendingCoachDecision[];
      guidance?: CoachReviewGuidance | null;
      inquiry?: CoachAssessmentInquiry | null;
    };
  };
  return {
    decisions: Array.isArray(json.data?.decisions) ? json.data.decisions : [],
    guidance:
      json.data?.guidance && typeof json.data.guidance === "object"
        ? json.data.guidance
        : null,
    inquiry:
      json.data?.inquiry && typeof json.data.inquiry === "object"
        ? json.data.inquiry
        : null,
  };
}

export async function openCoachAssessmentCase(caseId: string) {
  const response = await fetch(
    `${getApiBaseUrl()}/ai/coach/assessment-cases/${encodeURIComponent(caseId)}/open`,
    {
      method: "POST",
      headers: coachHeaders(),
      credentials: "include",
      body: JSON.stringify({}),
    },
  );
  if (!response.ok)
    throw new Error(`Open assessment case failed (${response.status})`);
  const json = (await response.json()) as {
    data?: OpenCoachAssessmentCaseResult;
  };
  if (!json.data?.sessionId || !json.data.questionMessageId) {
    throw new Error("Invalid assessment case response");
  }
  return json.data;
}

export async function dismissCoachAssessmentCase(caseId: string) {
  const response = await fetch(
    `${getApiBaseUrl()}/ai/coach/assessment-cases/${encodeURIComponent(caseId)}/dismiss`,
    {
      method: "POST",
      headers: coachHeaders(),
      credentials: "include",
      body: JSON.stringify({}),
    },
  );
  if (!response.ok)
    throw new Error(`Dismiss assessment case failed (${response.status})`);
}

export async function approveCoachDecision(
  decisionId: string,
  selectedOptionKey = "apply",
) {
  await postCoachDecision(decisionId, "approve", { selectedOptionKey });
}

export async function applyCoachDecision(decisionId: string) {
  const json = await postCoachDecision(decisionId, "apply");
  assertCoachDecisionApplied(readCoachApplyResult(json));
}

export async function rejectCoachDecision(decisionId: string, reason?: string) {
  await postCoachDecision(decisionId, "reject", {
    reason: reason ?? "user_dismissed_home_card",
  });
}

export async function confirmAndApplyCoachDecision(decisionId: string) {
  // 叠卡「确定」：先选 apply 选项，再真正写回计划。
  await approveCoachDecision(decisionId);
  await applyCoachDecision(decisionId);
}

export async function rebaseCoachDecision(
  decisionId: string,
  body?: { strategy?: string },
): Promise<CoachDecisionRebaseResult> {
  const enc = encodeURIComponent(decisionId);
  const response = await fetch(
    `${getApiBaseUrl()}/ai/coach/decisions/${enc}/rebase`,
    {
      method: "POST",
      headers: coachHeaders(),
      credentials: "include",
      body: JSON.stringify({
        strategy: body?.strategy ?? "USER_REQUESTED_REANALYZE",
      }),
    },
  );

  let json: { data?: CoachDecisionRebaseResult; message?: string } | undefined;
  try {
    json = (await response.json()) as {
      data?: CoachDecisionRebaseResult;
      message?: string;
    };
  } catch {
    json = undefined;
  }

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const msg =
      typeof json?.message === "string" && json.message.trim()
        ? json.message
        : `POST coach decision rebase failed (${response.status})`;
    throw new Error(msg);
  }
  if (!json?.data?.branch?.id) {
    throw new Error("Invalid response");
  }
  return json.data;
}

/** 侧栏与全量历史列表 queryKey 不同，只 invalidate 父前缀在 v5 下可能漏掉子 key，故显式双刷 */
export function invalidateCoachSessionLists(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: AI_COACH_SESSIONS_SIDEBAR_QUERY_KEY,
  });
  void queryClient.invalidateQueries({
    queryKey: AI_COACH_SESSIONS_HISTORY_QUERY_KEY,
  });
}

export function aiCoachMessagesQueryKey(sid: string) {
  return queryKeys.aiCoach.messages(sid);
}
