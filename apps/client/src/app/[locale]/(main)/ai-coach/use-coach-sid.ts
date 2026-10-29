"use client";

import { useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { stripAiPlanSeedParams } from "@/lib/ai-plan-seed-prompt";
import {
  decideCoachSidSync,
  normalizeCoachSid,
  readSidFromLocationSearch,
} from "./coach-sid-model";
import {
  getCoachSidPendingFlags,
  setCoachSidPendingFlags,
  useSharedCoachSid,
  writeCoachSid,
} from "./coach-sid-store";

const COACH_CHAT_PATH = "/ai-coach";

function stripAiCoachEntryParams(next: URLSearchParams): void {
  stripAiPlanSeedParams(next);
  next.delete("branch");
  next.delete("branchId");
  next.delete("contextId");
  next.delete("source");
  next.delete("date");
  next.delete("workoutId");
  next.delete("openReason");
  next.delete("caseId");
  next.delete("view");
}

function replaceCoachChatUrl(
  router: { replace: (href: string, opts?: { scroll?: boolean }) => void },
  searchParams: URLSearchParams,
  nextSid: string,
) {
  const sp = new URLSearchParams(searchParams.toString());
  stripAiCoachEntryParams(sp);
  if (nextSid) {
    sp.set("sid", nextSid);
  } else {
    sp.delete("sid");
  }
  const qs = sp.toString();
  router.replace(qs ? `${COACH_CHAT_PATH}?${qs}` : COACH_CHAT_PATH, {
    scroll: false,
  });
}

function isCoachChatPath(pathname: string) {
  return pathname === COACH_CHAT_PATH;
}

export function useCoachSid() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sid = useSharedCoachSid();
  const rawUrlSid = searchParams.get("sid")?.trim() ?? "";
  const searchParamsSid = normalizeCoachSid(rawUrlSid);
  const onCoachChat = isCoachChatPath(pathname);

  const applySid = useCallback(
    (next: string) => {
      const normalizedNext = normalizeCoachSid(next);
      if (!normalizedNext) {
        setCoachSidPendingFlags({
          urlClearPending: true,
          urlApplyPending: false,
        });
        writeCoachSid("");
        replaceCoachChatUrl(router, searchParams, "");
        return;
      }
      setCoachSidPendingFlags({
        urlClearPending: false,
        urlApplyPending: true,
      });
      writeCoachSid(normalizedNext);
      replaceCoachChatUrl(router, searchParams, normalizedNext);
    },
    [router, searchParams],
  );

  /** 新对话：从地址栏去掉 sid；首条发送再由 sendNowMessage 创建会话并写回 URL */
  const clearCoachSidFromUrl = useCallback(() => {
    setCoachSidPendingFlags({
      urlClearPending: true,
      urlApplyPending: false,
    });
    writeCoachSid("");
    replaceCoachChatUrl(router, searchParams, "");
  }, [router, searchParams]);

  /**
   * 侧栏「教练」入口：清掉已恢复的 sid，落到空白新对话。
   * 不复用当前页 query，避免从训练空间带入无关参数，也不把旧 sid 写回 URL。
   */
  const openNewCoachChat = useCallback(() => {
    setCoachSidPendingFlags({
      urlClearPending: true,
      urlApplyPending: false,
    });
    writeCoachSid("");
    router.replace(COACH_CHAT_PATH, { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!onCoachChat) return;

    const syncFromUrl = () => {
      const pending = getCoachSidPendingFlags();
      const result = decideCoachSidSync({
        searchParamsSid,
        rawSearchParamsSid: rawUrlSid,
        locationSid: readSidFromLocationSearch(),
        currentSid: sid,
        urlClearPending: pending.urlClearPending,
        urlApplyPending: pending.urlApplyPending,
      });
      setCoachSidPendingFlags({
        urlClearPending: result.urlClearPending,
        urlApplyPending: result.urlApplyPending,
      });
      writeCoachSid(result.sid);
      if (result.stripDefaultFromUrl) {
        replaceCoachChatUrl(router, searchParams, "");
      }
    };

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [onCoachChat, rawUrlSid, router, searchParams, searchParamsSid, sid]);

  return { sid, applySid, clearCoachSidFromUrl, openNewCoachChat };
}
