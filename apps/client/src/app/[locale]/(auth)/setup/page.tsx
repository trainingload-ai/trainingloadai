"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth";
import { LoadingSpinner } from "@/components/icons/spinner";
import { Button } from "@/components/ui/button";
import {
  openLocalOwnerSession,
  useSelfHostBootstrapStatus,
} from "@/api/self-host-bootstrap";
import { getIsNewUser } from "@/api/use-user";
import {
  getLoginCallbackUrlFromLocation,
  getOnboardingUrlFromLocation,
} from "@/lib/auth-callback";
import AuthPageShell from "../components/auth-page-shell";
import SelfHostBootstrapNotice from "../components/self-host-bootstrap-notice";

export default function SetupPage() {
  const t = useTranslations("login.selfHost");
  const locale = useLocale();
  const session = authClient.useSession();
  const status = useSelfHostBootstrapStatus(true);
  const attempted = useRef(false);
  const [sessionFailed, setSessionFailed] = useState(false);

  const continueAfterOwnerSession = useCallback(
    (isNewUser: boolean) => {
      const destination = isNewUser
        ? getOnboardingUrlFromLocation(locale)
        : getLoginCallbackUrlFromLocation();
      window.location.replace(destination);
    },
    [locale],
  );

  const enter = useCallback(async () => {
    setSessionFailed(false);
    try {
      await openLocalOwnerSession();
      continueAfterOwnerSession(await getIsNewUser());
    } catch {
      setSessionFailed(true);
    }
  }, [continueAfterOwnerSession]);

  useEffect(() => {
    if (session.isPending) return;
    if (attempted.current) return;
    if (session.data?.user) {
      attempted.current = true;
      void getIsNewUser()
        .then(continueAfterOwnerSession)
        .catch(() => {
          attempted.current = false;
          setSessionFailed(true);
        });
    } else if (status.data?.state === "READY") {
      attempted.current = true;
      void enter();
    }
  }, [
    session.isPending,
    session.data?.user,
    status.data?.state,
    enter,
    continueAfterOwnerSession,
  ]);

  return (
    <AuthPageShell
      title={t("localOwnerTitle")}
      description={t("localOwnerPageDescription")}
      isSelfHost
    >
      {status.isError ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => void status.refetch()}
        >
          {t("checkStatus")}
        </Button>
      ) : status.data?.state === "PENDING" ? (
        <SelfHostBootstrapNotice
          browserSetupAvailable={status.data.browserSetupAvailable}
          isRefreshing={status.isFetching}
          onInitialized={() => {
            attempted.current = true;
            continueAfterOwnerSession(true);
          }}
          onRefresh={() => void status.refetch()}
        />
      ) : sessionFailed ? (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-muted-foreground">
            {t("localSessionFailed")}
          </p>
          <Button className="w-full" onClick={() => void enter()}>
            {t("localSessionRetry")}
          </Button>
        </div>
      ) : (
        <div className="flex min-h-32 items-center justify-center">
          <LoadingSpinner className="h-6 w-6" />
        </div>
      )}
    </AuthPageShell>
  );
}
