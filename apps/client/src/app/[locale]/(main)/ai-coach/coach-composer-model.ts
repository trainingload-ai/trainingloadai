"use client";

import type * as React from "react";
import type { PendingSendItem } from "./coach-pending-send-queue";

export type CoachComposerViewModel = {
  input: string;
  hasPrompt: boolean;
  isStreaming: boolean;
  queueLocked: boolean;
  editingQueueItemId: string | null;
  pendingSendQueue: PendingSendItem[];
  promptExamples: string[];
  thinkingEnabled: boolean;
};

export type CoachComposerActions = {
  onInputChange: (value: string) => void;
  onComposerKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendClick: () => void;
  onStop: () => void;
  onEditQueueItem: (id: string) => void;
  onInterruptFromQueue: (id: string) => void;
  onDeleteQueueItem: (id: string) => void;
  onQuestionClick: (prompt: string) => void;
  onThinkingEnabledChange: (enabled: boolean) => void;
};
