"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { TopBar } from "@/components/TopBar";
import ThemeLogo from "@/components/ui/ThemeLogo";
import { getBaseUrl } from "@/lib/config";

type AuthPageShellProps = {
  children: ReactNode;
  description: string;
  isSelfHost: boolean;
  title: string;
};

export default function AuthPageShell({
  children,
  description,
  isSelfHost,
  title,
}: AuthPageShellProps) {
  const t = useTranslations("login");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <TopBar />
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:py-12">
        <div className="grid w-full max-w-[920px] overflow-hidden rounded-overlay border border-foreground/80 bg-card shadow-[6px_6px_0_rgba(25,27,24,0.12)] lg:grid-cols-[0.9fr_1.1fr] dark:shadow-[6px_6px_0_rgba(0,0,0,0.32)]">
          <aside className="hidden min-h-[560px] flex-col border-r border-border bg-secondary p-10 lg:flex">
            <ThemeLogo width={156} height={29} alt="Trainingload.ai" />
            <div className="flex flex-1 items-center">
              <div className="max-w-[18rem] space-y-4">
                {isSelfHost ? (
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {t("selfHost.instanceLabel")}
                  </p>
                ) : null}
                <h2 className="text-balance text-3xl font-semibold leading-[1.15] tracking-[-0.03em] text-foreground">
                  {isSelfHost
                    ? t("selfHost.sideTitle")
                    : t("authShell.sideTitle")}
                </h2>
              </div>
            </div>
          </aside>

          <section className="flex min-h-[500px] items-center px-6 py-10 sm:px-10 lg:min-h-[560px] lg:px-14">
            <div className="mx-auto w-full max-w-[380px]">
              <div className="mb-8 space-y-3">
                {isSelfHost ? (
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground lg:hidden">
                    {t("selfHost.instanceLabel")}
                  </p>
                ) : null}
                <h1 className="text-3xl font-semibold tracking-[-0.025em] text-foreground">
                  {title}
                </h1>
                <p className="text-pretty text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </div>
              {children}
            </div>
          </section>
        </div>
      </main>
      <footer className="px-4 pb-5 text-center text-xs text-muted-foreground">
        <a href={getBaseUrl()} title={t("platformTitle")}>
          {t("platformTitle")}
        </a>
      </footer>
    </div>
  );
}
