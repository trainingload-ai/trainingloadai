import { readSidFromLocationSearch } from "./coach-sid-model";

/** 只从地址栏恢复 sid。localStorage 里的旧值不再自动打开上一会话。 */
export function readSidFromBrowser(): string {
  if (typeof window === "undefined") return "";
  return readSidFromLocationSearch();
}

export function getMessageText(message: {
  parts?: Array<{ type?: string; text?: string }>;
}): string {
  return (message.parts ?? [])
    .filter(
      (part): part is { type: "text"; text: string } =>
        part?.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");
}

export const AUTO_SCROLL_THRESHOLD = 72;

export function isNearBottom(element: HTMLDivElement): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <
    AUTO_SCROLL_THRESHOLD
  );
}
