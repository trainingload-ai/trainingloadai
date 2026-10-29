/** 地址栏里的占位 sid，视为「无会话」。 */
export const PLACEHOLDER_COACH_SID = "default";

export function normalizeCoachSid(raw: string | null | undefined): string {
  const sid = raw?.trim() ?? "";
  if (!sid || sid === PLACEHOLDER_COACH_SID) return "";
  return sid;
}

export function readSidFromLocationSearch(): string {
  if (typeof window === "undefined") return "";
  try {
    return normalizeCoachSid(
      new URLSearchParams(window.location.search).get("sid"),
    );
  } catch {
    return "";
  }
}

export type CoachSidSyncInput = {
  /** useSearchParams 的 sid（已 normalize） */
  searchParamsSid: string;
  rawSearchParamsSid: string;
  /** window.location.search 的 sid（已 normalize） */
  locationSid: string;
  currentSid: string;
  urlClearPending: boolean;
  urlApplyPending: boolean;
};

export type CoachSidSyncResult = {
  sid: string;
  urlClearPending: boolean;
  urlApplyPending: boolean;
  stripDefaultFromUrl: boolean;
};

/**
 * 决定 URL ↔ 当前 sid 如何同步。
 *
 * 客户端以地址栏 `location.search` 为 URL 真源；`useSearchParams` 可能滞后或
 * 与 next-intl 的 replace 不同步。明确的「新对话 / applySid」用 pending 挡住
 * 过期 URL，避免把 Start 页绑回旧线程，或把已选会话清成空。
 */
export function decideCoachSidSync(input: CoachSidSyncInput): CoachSidSyncResult {
  const stripDefaultFromUrl = input.rawSearchParamsSid === PLACEHOLDER_COACH_SID;
  const urlSid = input.locationSid || (input.urlClearPending ? "" : input.searchParamsSid);

  if (input.urlApplyPending) {
    const caughtUp = Boolean(urlSid && urlSid === input.currentSid);
    return {
      sid: input.currentSid,
      urlClearPending: false,
      urlApplyPending: !caughtUp,
      stripDefaultFromUrl,
    };
  }

  if (input.urlClearPending && !input.currentSid) {
    const urlStillHasSid = Boolean(input.locationSid || input.searchParamsSid);
    return {
      sid: "",
      urlClearPending: urlStillHasSid,
      urlApplyPending: false,
      stripDefaultFromUrl,
    };
  }

  if (!urlSid) {
    return {
      sid: "",
      urlClearPending: false,
      urlApplyPending: false,
      stripDefaultFromUrl,
    };
  }

  return {
    sid: urlSid,
    urlClearPending: false,
    urlApplyPending: false,
    stripDefaultFromUrl,
  };
}

export function resolveActiveCoachSid(args: {
  searchParamsSid: string;
  storeSid: string;
  locationSid: string;
}): string {
  return (
    normalizeCoachSid(args.storeSid) ||
    normalizeCoachSid(args.locationSid) ||
    normalizeCoachSid(args.searchParamsSid)
  );
}

/** 已打开的 sid 拉回 0 条消息：空壳，不应继续粘在地址栏。 */
export function shouldReleaseEmptyCoachSid(args: {
  sid: string;
  messagesStatus: string;
  messageCount: number;
}): boolean {
  return (
    Boolean(normalizeCoachSid(args.sid)) &&
    args.messagesStatus === "success" &&
    args.messageCount === 0
  );
}

export function allocateClientCoachSid(): string {
  return crypto.randomUUID();
}
