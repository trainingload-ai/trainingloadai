"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const proseBase =
  "prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-headings:font-semibold prose-pre:rounded-md prose-pre:bg-muted prose-pre:p-3 prose-a:text-emerald-700 hover:prose-a:text-emerald-800 dark:prose-a:text-emerald-300 dark:hover:prose-a:text-emerald-200";

type MarkdownProseProps = {
  markdown: string;
  className?: string;
};

/** 统一 typography（@tailwindcss/typography）样式，避免业务里拼一串 prose-* */
export function MarkdownProse({ markdown, className }: MarkdownProseProps) {
  if (!markdown.trim()) return null;
  return (
    <div className={cn(proseBase, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}
