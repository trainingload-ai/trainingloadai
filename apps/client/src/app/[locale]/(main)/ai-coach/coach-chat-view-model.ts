"use client";

import type { PendingSendItem } from "./coach-pending-send-queue";
import type { CoachComposerViewModel } from "./coach-composer-model";

type TranslateFn = {
  (key: string, values?: Record<string, string | number>): string;
  raw?: (key: string) => unknown;
};

export const COACH_PROMPT_EXAMPLE_LIMIT = 8;

export function getCoachDisplayName(args: {
  fallbackName: string;
  rawName?: string | null;
}) {
  const raw = args.rawName?.trim();
  if (!raw) return args.fallbackName;
  if (raw.includes("@")) return args.fallbackName;

  const normalized = raw.split(/\s+/)[0] || raw;
  if (/\d{4,}/.test(normalized)) return args.fallbackName;
  if (normalized.length > 16) return args.fallbackName;
  return normalized;
}

export function getCoachHeroTitle(args: {
  displayName: string;
  fallbackName: string;
  t: TranslateFn;
}) {
  return args.displayName === args.fallbackName
    ? args.t("heroTitleGeneric")
    : args.t("heroTitlePersonal", { name: args.displayName });
}

export function getCoachPromptExamples(t: TranslateFn) {
  const rawPrompts =
    typeof t.raw === "function" ? t.raw("prompts") : undefined;

  if (Array.isArray(rawPrompts)) {
    const prompts = rawPrompts
      .filter((prompt): prompt is string => typeof prompt === "string")
      .map((prompt) => prompt.trim())
      .filter(Boolean);

    if (prompts.length > 0) return prompts;
  }

  return Array.from({ length: 6 }, (_, index) => t(`prompts.${index}`));
}

export function sampleCoachPromptExamples(
  prompts: string[],
  limit = COACH_PROMPT_EXAMPLE_LIMIT,
) {
  if (prompts.length <= limit) return prompts;

  return prompts
    .map((prompt, index) => ({
      prompt,
      index,
      sort: Math.random(),
    }))
    .sort((a, b) => a.sort - b.sort || a.index - b.index)
    .slice(0, limit)
    .map(({ prompt }) => prompt);
}

export function buildCoachComposerViewModel(args: {
  editingQueueItemId: string | null;
  hasPrompt: boolean;
  input: string;
  isStreaming: boolean;
  pendingSendQueue: PendingSendItem[];
  promptExamples: string[];
  queueLocked: boolean;
  thinkingEnabled: boolean;
}): CoachComposerViewModel {
  return {
    input: args.input,
    hasPrompt: args.hasPrompt,
    isStreaming: args.isStreaming,
    queueLocked: args.queueLocked,
    editingQueueItemId: args.editingQueueItemId,
    pendingSendQueue: args.pendingSendQueue,
    promptExamples: args.promptExamples,
    thinkingEnabled: args.thinkingEnabled,
  };
}
