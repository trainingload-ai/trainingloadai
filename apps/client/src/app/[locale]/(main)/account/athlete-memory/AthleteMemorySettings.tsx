"use client";

import { useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Download, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  correctAthleteMemoryFact,
  deleteAthleteMemoryFact,
  exportAthleteMemory,
  fetchAthleteMemoryPage,
  fetchAthleteMemoryPreference,
  updateAthleteMemoryPreference,
} from "@/api/athlete-memory";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import type { AthleteMemoryFact } from "@shared/athlete-memory";

const preferenceKey = ["athlete-memory", "preference"] as const;
const factsKey = ["athlete-memory", "facts"] as const;

export function AthleteMemorySettings() {
  const t = useTranslations("AthleteMemory");
  const consentT = useTranslations("AiDataConsent");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [disableOpen, setDisableOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [editing, setEditing] = useState<AthleteMemoryFact | null>(null);
  const [deleting, setDeleting] = useState<AthleteMemoryFact | null>(null);
  const [claim, setClaim] = useState("");

  const preference = useQuery({
    queryKey: preferenceKey,
    queryFn: fetchAthleteMemoryPreference,
  });
  const facts = useInfiniteQuery({
    queryKey: factsKey,
    queryFn: ({ pageParam }) => fetchAthleteMemoryPage(pageParam || null),
    initialPageParam: "",
    getNextPageParam: (page) => page?.nextCursor ?? undefined,
  });
  const items = useMemo(
    () => facts.data?.pages.flatMap((page) => page?.items ?? []) ?? [],
    [facts.data],
  );
  const hasMemories = items.length > 0;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: preferenceKey }),
      queryClient.invalidateQueries({ queryKey: factsKey }),
    ]);
  };
  const preferenceMutation = useMutation({
    mutationFn: updateAthleteMemoryPreference,
    onSuccess: async (_result, input) => {
      setClearOpen(false);
      await refresh();
      if (input.clearHistory) {
        setDisableOpen(false);
        toast.success(t("memoriesCleared"));
      } else if (input.enabled) {
        toast.success(t("preferenceEnabled"));
      } else {
        toast.success(t("preferenceDisabled"));
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("saveError")),
  });
  const editMutation = useMutation({
    mutationFn: correctAthleteMemoryFact,
    onSuccess: async () => {
      setEditing(null);
      await refresh();
      toast.success(t("updated"));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("saveError")),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAthleteMemoryFact,
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
      toast.success(t("deleted"));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("saveError")),
  });

  const setting = preference.data;
  const busy = preferenceMutation.isPending;
  const dateTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : t("unknownTime");
  const eventTime = (fact: AthleteMemoryFact) => {
    if (fact.eventStart && fact.eventEnd && fact.eventStart !== fact.eventEnd) {
      return `${dateTime(fact.eventStart)} – ${dateTime(fact.eventEnd)}`;
    }
    return dateTime(fact.eventStart ?? fact.eventEnd ?? fact.createdAt);
  };

  const downloadExport = async () => {
    try {
      const data = await exportAthleteMemory();
      const blob = new Blob([JSON.stringify(data ?? [], null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `trainingload-athlete-memory-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("exportError"));
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t("toggleTitle")}</h2>
            <p className="mt-1 max-w-2xl text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
              {t("toggleDescription")}
            </p>
          </div>
          <Switch
            checked={setting?.enabled === true}
            disabled={
              preference.isLoading || busy || setting?.available !== true
            }
            aria-label={t("toggleTitle")}
            onCheckedChange={(next) => {
              if (next) {
                preferenceMutation.mutate({ enabled: true });
              } else if (hasMemories) {
                preferenceMutation.mutate(
                  { enabled: false },
                  { onSuccess: () => setDisableOpen(true) },
                );
              } else {
                preferenceMutation.mutate({ enabled: false });
              }
            }}
          />
        </div>
        {setting?.available === false ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("unavailable")}
          </p>
        ) : setting?.consentRequired ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("consentRequired")}
            </p>
            <Button asChild type="button" variant="outline" size="sm">
              <Link href="/account/privacy-ai">
                {consentT("settingsTitle")}
              </Link>
            </Button>
          </div>
        ) : setting?.updatedAt ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("updatedAt", { date: dateTime(setting.updatedAt) })}
          </p>
        ) : null}
      </section>

      <section className="rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{t("savedTitle")}</h2>
            <p className="mt-1 text-mobile-caption text-muted-foreground pc:text-xs">
              {t("savedDescription")}
            </p>
          </div>
          {hasMemories ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadExport}
            >
              <Download aria-hidden="true" />
              {t("export")}
            </Button>
          ) : null}
        </div>

        {facts.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("loading")}</p>
        ) : facts.isError ? (
          <div className="mt-4 rounded-md border border-border bg-background p-4">
            <p className="text-sm font-medium">{t("loadErrorTitle")}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("loadErrorDescription")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => facts.refetch()}
            >
              {t("retry")}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4 rounded-md border border-border bg-background p-4">
            <p className="text-sm font-medium">{t("emptyTitle")}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("emptyDescription")}
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-md border border-border bg-background">
            {items.map((fact) => (
              <article key={fact.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{t(`categories.${fact.category}` as never)}</span>
                      <span aria-hidden="true">·</span>
                      <time>{eventTime(fact)}</time>
                      {fact.status !== "ACTIVE" ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{fact.status}</span>
                        </>
                      ) : null}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
                      {fact.claim}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {fact.status === "ACTIVE" ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("edit")}
                        onClick={() => {
                          setEditing(fact);
                          setClaim(fact.claim);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("delete")}
                      disabled={deleteMutation.isPending}
                      onClick={() => setDeleting(fact)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {facts.hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full bg-background"
            disabled={facts.isFetchingNextPage}
            onClick={() => facts.fetchNextPage()}
          >
            {facts.isFetchingNextPage ? t("loading") : t("loadMore")}
          </Button>
        ) : null}
      </section>

      {hasMemories ? (
        <section className="rounded-surface border border-destructive/25 p-3">
          <h2 className="text-base font-semibold">{t("clearTitle")}</h2>
          <p className="mt-1 text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
            {setting?.enabled
              ? t("clearDescriptionEnabled")
              : t("clearDescriptionDisabled")}
          </p>
          <Button
            type="button"
            variant="destructive"
            className="mt-3"
            disabled={busy}
            onClick={() => setClearOpen(true)}
          >
            {setting?.enabled ? t("disableClear") : t("clearAction")}
          </Button>
        </section>
      ) : null}

      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("disableTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("disableDescription", { count: items.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("disableKeep")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={() =>
                preferenceMutation.mutate({
                  enabled: false,
                  clearHistory: true,
                })
              }
            >
              {t("disableClear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clearConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("clearConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={() =>
                preferenceMutation.mutate({
                  enabled: false,
                  clearHistory: true,
                })
              }
            >
              {setting?.enabled ? t("disableClear") : t("clearAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResponsiveModal
        open={Boolean(editing)}
        onOpenChange={(next) => !next && setEditing(null)}
      >
        <ResponsiveModalContent className="gap-0 p-0 pc:max-w-[640px] pc:p-0">
          <ResponsiveModalHeader className="border-b border-border/70 px-4 pb-4 pr-14 pt-5 text-left pc:px-5 pc:pb-4 pc:pt-5">
            <ResponsiveModalTitle>{t("editTitle")}</ResponsiveModalTitle>
            <ResponsiveModalDescription>
              {t("editDescription")}
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>
          <div className="space-y-4 p-4 pc:p-5">
            <div className="space-y-2">
              <label
                htmlFor="athlete-memory-claim"
                className="text-sm font-medium"
              >
                {t("claimLabel")}
              </label>
              <Textarea
                id="athlete-memory-claim"
                value={claim}
                maxLength={320}
                rows={6}
                className="min-h-36 resize-y bg-background"
                onChange={(event) => setClaim(event.target.value)}
              />
            </div>
            {editing ? (
              <div className="flex items-center justify-between gap-4 rounded-md bg-muted/45 px-3 py-2.5">
                <span className="text-mobile-caption text-muted-foreground pc:text-xs">
                  {t("categoryLabel")}
                </span>
                <span className="text-sm font-medium">
                  {t(`categories.${editing.category}` as never)}
                </span>
              </div>
            ) : null}
          </div>
          <ResponsiveModalFooter className="gap-2 border-t border-border/70 px-4 py-3 sm:space-x-0 pc:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setEditing(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={!editing || !claim.trim() || editMutation.isPending}
              onClick={() => {
                if (!editing) return;
                editMutation.mutate({
                  factId: editing.id,
                  expectedVersion: editing.version,
                  claim: claim.trim(),
                  category: editing.category,
                });
              }}
            >
              {t("save")}
            </Button>
          </ResponsiveModalFooter>
        </ResponsiveModalContent>
      </ResponsiveModal>
    </div>
  );
}
