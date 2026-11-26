"use client";

import { type ReactElement, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, SquarePen } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  AI_COACH_SESSIONS_SIDEBAR_QUERY_KEY,
  fetchCoachSessionsPage,
  type CoachSessionListItem,
} from "@/api/ai-coach";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  excludeEmptyCoachHistorySessions,
  getCoachHistoryLineText,
} from "./coach-history-list-model";

export function CoachSearchDialog({
  open,
  onOpenChange,
  onNewChat,
  onSelectSession,
  sessions,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewChat?: () => void;
  onSelectSession: (sid: string) => void;
  sessions: CoachSessionListItem[];
  trigger: ReactElement;
}) {
  const t = useTranslations("sidebar");
  const historyT = useTranslations("AiCoachPage.history");
  const actions = useTranslations("AiCoachPage.actions");
  const sharedT = useTranslations("SharedUI");
  const format = useFormatter();
  const [input, setInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const query = input.trim();

  useEffect(() => {
    if (!open || !query) return;
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const results = useQuery({
    queryKey: [
      ...AI_COACH_SESSIONS_SIDEBAR_QUERY_KEY,
      "search",
      debouncedQuery,
    ],
    enabled: open && Boolean(query) && query === debouncedQuery,
    queryFn: async ({ signal }) => {
      const page = await fetchCoachSessionsPage(0, 20, "chat", undefined, {
        query: debouncedQuery,
        signal,
      });
      if (!page) throw new Error("Coach session search failed");
      return excludeEmptyCoachHistorySessions(page.items);
    },
  });
  const isSearching =
    Boolean(query) && (query !== debouncedQuery || results.isPending);
  const visibleSessions = query ? (results.data ?? []) : sessions;
  const close = (next: boolean) => {
    if (!next) {
      setInput("");
      setDebouncedQuery("");
    }
    onOpenChange(next);
  };

  const status = isSearching
    ? t("loadingChats")
    : query && results.isError
      ? t("searchChatsError")
      : visibleSessions.length === 0
        ? query
          ? t("searchChatsEmpty")
          : historyT("empty")
        : null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        aria-label={t("searchChats")}
        aria-labelledby={undefined}
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden [--overlay-surface-color:var(--popover)] p-0 shadow-2xl tablet:inset-x-auto tablet:bottom-auto tablet:left-1/2 tablet:top-[12vh] tablet:w-[min(40rem,calc(100vw-2rem))] tablet:-translate-x-1/2 tablet:rounded-overlay tablet:border pc:top-[12vh] pc:max-w-[40rem] pc:translate-y-0 pc:p-0"
      >
        <DialogDescription className="sr-only">
          {t("searchChatsPlaceholder")}
        </DialogDescription>
        <Command shouldFilter={false} className="bg-transparent">
          <div className="relative border-b border-border/40 [&_[data-slot=command-input-wrapper]]:h-14 [&_[data-slot=command-input-wrapper]]:gap-3 [&_[data-slot=command-input-wrapper]]:border-0 [&_[data-slot=command-input-wrapper]]:ps-4 [&_[data-slot=command-input-wrapper]]:pe-16 [&_[data-slot=command-input-wrapper]>svg]:size-5">
            <CommandInput
              aria-label={t("searchChats")}
              className="text-base"
              placeholder={t("searchChatsPlaceholder")}
              maxLength={120}
              onValueChange={setInput}
              value={input}
            />
            <DialogClose asChild>
              <Button
                aria-label={sharedT("close")}
                variant="outline"
                size="xs"
                className="absolute end-3 top-1/2 h-6 -translate-y-1/2 px-1.5 text-xs text-muted-foreground"
              >
                <kbd>Esc</kbd>
              </Button>
            </DialogClose>
          </div>
          <CommandList className="min-h-28 max-h-[min(52vh,25rem)] px-2 py-2">
            {!query && onNewChat ? (
              <CommandItem
                className="mb-1 min-h-10 gap-3 px-3"
                value="new-chat"
                onSelect={() => {
                  close(false);
                  onNewChat();
                }}
              >
                <SquarePen aria-hidden="true" />
                <span>{actions("newChat")}</span>
              </CommandItem>
            ) : null}
            {status ? (
              <p
                role="status"
                className="px-3 py-6 text-center text-sm text-muted-foreground"
              >
                {status}
              </p>
            ) : (
              <CommandGroup
                heading={historyT("title")}
                className="p-0 [&_[cmdk-group-heading]]:px-3"
              >
                {visibleSessions.map((session) => {
                  const title = getCoachHistoryLineText(
                    session,
                    historyT("untitled"),
                  );
                  const preview = [
                    session.lastReplyPreview,
                    session.lastMessagePreview,
                  ].find((text) => text && text !== title);
                  return (
                    <CommandItem
                      key={session.id}
                      value={`chat:${session.id}`}
                      aria-label={title}
                      className="min-h-11 gap-3 px-3 py-2"
                      onSelect={() => {
                        close(false);
                        onSelectSession(session.id);
                      }}
                    >
                      <MessageSquare aria-hidden="true" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{title}</span>
                        {preview ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {preview}
                          </span>
                        ) : null}
                      </span>
                      <time
                        dateTime={session.updatedAt}
                        className="shrink-0 text-xs tabular-nums text-muted-foreground"
                      >
                        {format.dateTime(new Date(session.updatedAt), {
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
          <div
            className="flex min-h-9 items-center justify-end gap-2 border-t border-border/40 bg-muted/40 px-4 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            <kbd className="rounded-xs border border-border/80 bg-background px-1.5">
              ↑ ↓
            </kbd>
            <kbd className="rounded-xs border border-border/80 bg-background px-1.5">
              ↵
            </kbd>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
