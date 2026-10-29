"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import { useEffect } from "react";
import { authClient } from "@/lib/auth";
import { useRouter } from "@/i18n/routing";
import { LoadingSpinner } from "@/components/icons/spinner";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function RequireSignedIn({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession();
  const router = useRouter();
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();

  useEffect(() => {
    if (publicDemo.active) return;
    if (session.isPending) return;
    if (!session.data?.user) {
      router.replace("/login");
    }
  }, [publicDemo.active, session.isPending, session.data?.user, router]);

  if (publicDemo.active && publicDemo.error) {
    return (
      <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{demoText("loadError")}</p>
        <Button type="button" variant="outline" onClick={publicDemo.retry}>
          {demoText("retry")}
        </Button>
      </div>
    );
  }

  if (publicDemo.active && !publicDemo.loading) return <>{children}</>;

  if (publicDemo.loading || session.isPending || !session.data?.user) {
    return (
      <div
        className="flex min-h-dvh w-full items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <LoadingSpinner className="h-6 w-6" />
      </div>
    );
  }

  return <>{children}</>;
}
