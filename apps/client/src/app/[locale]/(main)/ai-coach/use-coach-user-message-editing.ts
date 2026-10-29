"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { patchCoachUserMessage } from "@/api/ai-coach";
import type { CoachTranscriptItem } from "./coach-transcript-model";

type UseCoachUserMessageEditingArgs = {
  sid: string | undefined;
  isStreaming: boolean;
  clearError: () => void;
  setTranscriptMetaItems: Dispatch<SetStateAction<CoachTranscriptItem[]>>;
  setLastStreamError: (error: Error | null) => void;
  sendMessage: (args: { text: string; messageId?: string }) => Promise<void>;
  t: (key: string) => string;
};

/**
 * 用户消息“编辑并重答”流程。
 * 保存时先 PATCH 服务端并截断后续消息，再用同一 messageId 触发 regenerate，避免追加重复 user 行。
 */
export function useCoachUserMessageEditing({
  sid,
  isStreaming,
  clearError,
  setTranscriptMetaItems,
  setLastStreamError,
  sendMessage,
  t,
}: UseCoachUserMessageEditingArgs) {
  const [editingUserMessageId, setEditingUserMessageId] = useState<
    string | null
  >(null);
  const [editDraft, setEditDraft] = useState("");
  const [userEditSaving, setUserEditSaving] = useState(false);
  const userEditTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editingUserMessageId) return;
    const el = userEditTextareaRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.select();
    });
  }, [editingUserMessageId]);

  const cancelUserMessageEdit = useCallback(() => {
    setEditingUserMessageId(null);
    setEditDraft("");
  }, []);

  const resetUserMessageEdit = useCallback(() => {
    setEditingUserMessageId(null);
    setEditDraft("");
    setUserEditSaving(false);
  }, []);

  const startUserMessageEdit = useCallback((id: string, text: string) => {
    setEditingUserMessageId(id);
    setEditDraft(text);
  }, []);

  const saveUserMessageEdit = useCallback(async () => {
    // 后端负责保证只能编辑本人的 user 消息，并删除该消息之后的上下文。
    const mid = editingUserMessageId;
    const text = editDraft.trim();
    if (!mid || !sid) return;
    if (!text) {
      toast.error(t("actions.editEmpty"));
      return;
    }
    if (isStreaming) {
      toast.error(t("actions.editWhileStreaming"));
      return;
    }
    setUserEditSaving(true);
    try {
      await patchCoachUserMessage(sid, mid, text);
      cancelUserMessageEdit();
      setTranscriptMetaItems([]);
      setLastStreamError(null);
      clearError();
      await sendMessage({ text, messageId: mid });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("actions.editUserFailed"));
    } finally {
      setUserEditSaving(false);
    }
  }, [
    cancelUserMessageEdit,
    clearError,
    editDraft,
    editingUserMessageId,
    isStreaming,
    sendMessage,
    setLastStreamError,
    setTranscriptMetaItems,
    sid,
    t,
  ]);

  return {
    editingUserMessageId,
    editDraft,
    userEditSaving,
    userEditTextareaRef,
    setEditDraft,
    startUserMessageEdit,
    cancelUserMessageEdit,
    resetUserMessageEdit,
    saveUserMessageEdit,
  };
}
