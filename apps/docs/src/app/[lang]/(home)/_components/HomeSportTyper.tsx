"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const TYPE_DELAY_MS = 144;
const DELETE_DELAY_MS = 68;
const HOLD_DELAY_MS = 2360;

export function HomeSportTyper({
  words,
  className,
}: {
  words: string[];
  className?: string;
}) {
  const stableWords = useMemo(
    () => words.filter((word) => word.trim().length > 0),
    [words],
  );
  const [wordIndex, setWordIndex] = useState(0);
  const [letterCount, setLetterCount] = useState(stableWords[0]?.length ?? 0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (stableWords.length <= 1) return;

    const currentWord = stableWords[wordIndex] ?? stableWords[0] ?? "";
    const isComplete = !isDeleting && letterCount === currentWord.length;
    const isEmpty = isDeleting && letterCount === 0;
    const delay = isComplete
      ? HOLD_DELAY_MS
      : isDeleting
        ? DELETE_DELAY_MS
        : TYPE_DELAY_MS;

    const timeout = window.setTimeout(() => {
      if (isComplete) {
        setIsDeleting(true);
        return;
      }

      if (isEmpty) {
        setIsDeleting(false);
        setWordIndex((current) => (current + 1) % stableWords.length);
        return;
      }

      setLetterCount((current) => current + (isDeleting ? -1 : 1));
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [isDeleting, letterCount, stableWords, wordIndex]);

  const word = stableWords[wordIndex] ?? "";
  const visibleText = stableWords.length <= 1 ? word : word.slice(0, letterCount);

  return (
    <span
      className={cn("inline-flex h-[1lh] min-w-0 items-baseline", className)}
    >
      <span>{visibleText}</span>
      <span
        aria-hidden="true"
        className="ml-1 inline-block h-[0.9em] w-[0.08em] translate-y-[0.08em] animate-pulse rounded-full bg-current"
      />
    </span>
  );
}
