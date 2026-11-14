import type { AbstractIntlMessages } from "next-intl";

// Shared chrome and error boundaries stay available on every route. Page copy
// belongs to its route's ClientMessages boundary, not the root HTML payload.
export const SHARED_CLIENT_MESSAGE_PATHS = [
  "nav",
  "header",
  "accessibility",
  "banner.release",
  "runningPlanPages.labels",
  "commonLinks",
  "languageSuggestion",
  "SiteError",
] as const;

export function selectClientMessages(
  messages: AbstractIntlMessages,
  paths: readonly string[] = [],
): AbstractIntlMessages {
  const selected: Record<string, unknown> = {};

  for (const path of [...SHARED_CLIENT_MESSAGE_PATHS, ...paths]) {
    const segments = path.split(".");
    let value: unknown = messages;
    for (const segment of segments) {
      value =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[segment]
          : undefined;
    }
    if (value === undefined) {
      throw new Error(`Missing client message namespace: ${path}`);
    }

    let target = selected;
    for (const segment of segments.slice(0, -1)) {
      // A parent namespace may already have been selected. Copy it before
      // adding a child so the cached request dictionary is never mutated.
      target[segment] = { ...(target[segment] as Record<string, unknown>) };
      target = target[segment] as Record<string, unknown>;
    }
    target[segments.at(-1)!] = value;
  }

  return selected as AbstractIntlMessages;
}
