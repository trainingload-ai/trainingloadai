"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppWindow, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  adaptiveDialogFooterActionButtonClassName,
  adaptiveDialogFooterActionsClassName,
} from "@/components/ui/adaptive-dialog";
import {
  type OAuthAuthorization,
  useOAuthAuthorizations,
  useRevokeOAuthAuthorization,
} from "@/api/oauth-authorizations";

function scopeTranslationKey(scope: string) {
  switch (scope) {
    case "profile:read":
      return "profileRead";
    case "activity:read":
      return "activityRead";
    case "training:read":
      return "trainingRead";
    case "plan:read":
      return "planRead";
    case "health:read":
      return "healthRead";
    case "competition:read":
      return "competitionRead";
    case "offline_access":
      return "offlineAccess";
    case "openid":
    case "profile":
    case "email":
      return "identity";
    default:
      return null;
  }
}

export function AuthorizedApplications({
  readOnly = false,
}: {
  readOnly?: boolean;
}) {
  const t = useTranslations("ThirdPartyConnections.authorizedApps");
  const { locale } = useParams();
  const resolvedLocale = Array.isArray(locale) ? locale[0] : locale;
  const { data: authorizations = [], isLoading } = useOAuthAuthorizations();
  const revoke = useRevokeOAuthAuthorization();
  const [selected, setSelected] = useState<OAuthAuthorization | null>(null);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(resolvedLocale || "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [resolvedLocale],
  );

  const handleRevoke = async () => {
    if (!selected) return;
    try {
      await revoke.mutateAsync(selected.clientId);
      toast.success(t("revokeSuccess", { app: selected.clientName }));
      setSelected(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("revokeError"));
    }
  };

  const displayScopes = (scopes: string[]) => {
    const labels = new Set<string>();
    for (const scope of scopes) {
      const key = scopeTranslationKey(scope);
      labels.add(key ? t(`scopes.${key}`) : scope);
    }
    return Array.from(labels);
  };

  return (
    <div className="space-y-2">
      <div className="px-1">
        <h3 className="text-mobile-caption font-semibold text-muted-foreground pc:text-xs">
          {t("title")}
        </h3>
        <p className="mt-1 text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
          {t("description")}
        </p>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-background/70" />
      ) : authorizations.length === 0 ? (
        <div className="rounded-md bg-background/70 px-3 py-4 text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {authorizations.map((authorization) => (
            <div
              key={authorization.clientId}
              className="flex flex-col gap-3 rounded-md bg-background/80 p-3 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-primary">
                  <AppWindow className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {authorization.clientName}
                    </span>
                    <Badge variant="secondary">
                      <ShieldCheck
                        className="mr-1 h-3 w-3"
                        aria-hidden="true"
                      />
                      {authorization.renewable
                        ? t("renewable")
                        : authorization.active
                          ? t("active")
                          : t("expired")}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {displayScopes(authorization.scopes).map((scope) => (
                      <Badge
                        key={scope}
                        variant="outline"
                        className="font-normal"
                      >
                        {scope}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-2 text-mobile-unit text-muted-foreground pc:text-[11px]">
                    {t("authorizedOn", {
                      date: dateFormatter.format(
                        new Date(authorization.authorizedAt),
                      ),
                    })}
                    {authorization.refreshTokenExpiresAt
                      ? ` · ${t("renewalExpires", {
                          date: dateFormatter.format(
                            new Date(authorization.refreshTokenExpiresAt),
                          ),
                        })}`
                      : ""}
                  </p>
                  {authorization.isMcpClient ? (
                    <p className="mt-1 text-mobile-unit text-muted-foreground pc:text-[11px]">
                      {authorization.lastMcpUsedAt
                        ? t("lastMcpUsed", {
                            date: dateFormatter.format(
                              new Date(authorization.lastMcpUsedAt),
                            ),
                          })
                        : t("noMcpToolCalls")}
                    </p>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={readOnly || revoke.isPending}
                onClick={() => setSelected(authorization)}
              >
                {t("revoke")}
              </Button>
            </div>
          ))}
        </div>
      )}

      <AdaptiveDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !revoke.isPending) setSelected(null);
        }}
      >
        <AdaptiveDialogContent>
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>
              {t("revokeTitle", { app: selected?.clientName ?? "" })}
            </AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              {t("revokeDescription")}
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <AdaptiveDialogFooter
            className={adaptiveDialogFooterActionsClassName}
          >
            <Button
              type="button"
              variant="outline"
              disabled={revoke.isPending}
              onClick={() => setSelected(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={adaptiveDialogFooterActionButtonClassName}
              disabled={revoke.isPending}
              onClick={() => void handleRevoke()}
            >
              {revoke.isPending ? t("revoking") : t("confirmRevoke")}
            </Button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    </div>
  );
}
