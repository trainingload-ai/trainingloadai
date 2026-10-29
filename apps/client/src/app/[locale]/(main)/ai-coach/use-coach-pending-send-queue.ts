"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { PendingSendItem } from "./coach-pending-send-queue";
import type { CoachUserMessageBody } from "@/lib/ai-coach-stream";

type UseCoachPendingSendQueueArgs = {
  sendNowMessageRef: MutableRefObject<
    (
      text: string,
      opts?: { coachUserMessage?: CoachUserMessageBody },
    ) => Promise<void>
  >;
  setInput: Dispatch<SetStateAction<string>>;
  stopChatRef: MutableRefObject<() => void>;
};

/**
 * 流式回复期间的发送队列。
 * 用户可以连续输入多条消息；当前轮结束后自动出队，也可以中断当前回复并优先发送队列项。
 */
export function useCoachPendingSendQueue({
  sendNowMessageRef,
  setInput,
  stopChatRef,
}: UseCoachPendingSendQueueArgs) {
  const [pendingSendQueue, setPendingSendQueue] = useState<PendingSendItem[]>(
    [],
  );
  const [queueLocked, setQueueLocked] = useState(false);
  const [editingQueueItemId, setEditingQueueItemId] = useState<string | null>(
    null,
  );
  const [editingQueueSnapshot, setEditingQueueSnapshot] =
    useState<PendingSendItem | null>(null);
  const [editingQueueInsertIndex, setEditingQueueInsertIndex] = useState(0);

  const pendingSendQueueRef = useRef<PendingSendItem[]>([]);
  const queueLockedRef = useRef(false);
  const suppressAutoDrainRef = useRef(false);

  /** 待发送队列出队逻辑挂在 useChat onFinish，用 ref 避免闭包陈旧 */
  const drainQueueAfterStreamRef = useRef<() => void>(() => {});

  useEffect(() => {
    pendingSendQueueRef.current = pendingSendQueue;
  }, [pendingSendQueue]);

  useEffect(() => {
    queueLockedRef.current = queueLocked;
  }, [queueLocked]);

  useEffect(() => {
    drainQueueAfterStreamRef.current = () => {
      if (queueLockedRef.current || suppressAutoDrainRef.current) return;
      if (pendingSendQueueRef.current.length === 0) return;
      const [first, ...rest] = pendingSendQueueRef.current;
      pendingSendQueueRef.current = rest;
      setPendingSendQueue(rest);
      queueMicrotask(() => {
        void sendNowMessageRef.current(first.text, undefined);
      });
    };
  }, [sendNowMessageRef]);

  /**
   * 编辑队列项时先从队列移除并锁队列；确认后由上层按原索引插回，取消则在这里恢复。
   */
  const startEditQueueItem = useCallback((id: string) => {
    setPendingSendQueue((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
      if (idx === -1) return prev;
      const item = prev[idx];
      queueMicrotask(() => {
        setEditingQueueInsertIndex(idx);
        setEditingQueueSnapshot(item);
        setEditingQueueItemId(id);
        setQueueLocked(true);
        setInput(item.text);
      });
      return prev.filter((x) => x.id !== id);
    });
  }, [setInput]);

  const cancelQueueItemEdit = useCallback(() => {
    if (editingQueueSnapshot) {
      setPendingSendQueue((prev) => {
        const next = [...prev];
        next.splice(editingQueueInsertIndex, 0, editingQueueSnapshot);
        return next;
      });
    }
    setQueueLocked(false);
    setEditingQueueItemId(null);
    setEditingQueueSnapshot(null);
    setInput("");
  }, [editingQueueInsertIndex, editingQueueSnapshot, setInput]);

  const deleteQueueItem = useCallback((id: string) => {
    setPendingSendQueue((prev) => prev.filter((x) => x.id !== id));
  }, []);

  /**
   * 用户选择“立即发送”某个排队项时，停止当前流并抑制 onFinish 的自动出队，避免重复发送。
   */
  const interruptAndSendFromQueue = useCallback(
    async (id: string) => {
      const prev = pendingSendQueueRef.current;
      const payload = prev.find((x) => x.id === id);
      if (!payload) return;
      setPendingSendQueue((p) => p.filter((x) => x.id !== id));
      suppressAutoDrainRef.current = true;
      stopChatRef.current();
      await new Promise((r) => setTimeout(r, 120));
      try {
        await sendNowMessageRef.current(payload.text, undefined);
      } finally {
        suppressAutoDrainRef.current = false;
      }
    },
    [sendNowMessageRef, stopChatRef],
  );

  const resetQueueState = useCallback(() => {
    setPendingSendQueue([]);
    setQueueLocked(false);
    setEditingQueueItemId(null);
    setEditingQueueSnapshot(null);
  }, []);

  return {
    pendingSendQueue,
    setPendingSendQueue,
    queueLocked,
    setQueueLocked,
    editingQueueItemId,
    setEditingQueueItemId,
    editingQueueInsertIndex,
    editingQueueSnapshot,
    setEditingQueueSnapshot,
    drainQueueAfterStreamRef,
    suppressAutoDrainRef,
    pendingSendQueueRef,
    queueLockedRef,
    startEditQueueItem,
    cancelQueueItemEdit,
    deleteQueueItem,
    interruptAndSendFromQueue,
    resetQueueState,
  };
}
