"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import React, { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { featureAllowed, useFeatureAccess } from "@/api/feature-access";
import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";
import { AccessOptionsDialog } from "@deployment/managed-ui";
import {
  CreatePlanModeDialog,
  type CreatePlanMode,
} from "@/components/plan/create-plan-mode-dialog";
import { usePlanStore } from "@/lib/plan-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileAiPlanCreateSheet } from "@/components/plan/mobile-ai-plan-create-sheet";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { useTranslations } from "next-intl";

type PlanCreateLauncherProps = {
  children: React.ReactNode;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  mode?: CreatePlanMode;
};

/**
 * 打开「手动 / AI」创建方式选择；移动端 AI 在 Sheet 内填写简报，桌面端进入完整创建页。
 */
export function PlanCreateLauncher({
  children,
  className,
  variant,
  size,
  mode,
}: PlanCreateLauncherProps) {
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();
  const router = useRouter();
  const isMobile = useIsMobile();
  const clearPlanDraft = usePlanStore((s) => s.clear);
  const access = useFeatureAccess({ enabled: !publicDemo.active });
  const [modeOpen, setModeOpen] = useState(false);
  const [mobileAiOpen, setMobileAiOpen] = useState(false);
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);

  const handleSelect = (mode: CreatePlanMode) => {
    if (mode === "template") {
      setModeOpen(false);
      router.push("/plans/templates");
      return;
    }
    if (mode === "ai") {
      if (access.isLoading) return;
      setModeOpen(false);
      if (!featureAllowed(access.data, "ai.planAdvice")) {
        setPricingDialogOpen(true);
        return;
      }
      if (isMobile) {
        requestAnimationFrame(() => setMobileAiOpen(true));
        return;
      }
      router.push("/plans/create");
      return;
    }
    setModeOpen(false);
    clearPlanDraft();
    router.push("/plans/create/manual");
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={publicDemo.active}
        title={publicDemo.active ? demoText("readOnlyAction") : undefined}
        onClick={() => (mode ? handleSelect(mode) : setModeOpen(true))}
      >
        {children}
      </Button>

      <CreatePlanModeDialog
        open={modeOpen}
        onOpenChange={setModeOpen}
        onSelect={handleSelect}
        aiDisabled={access.isLoading}
      />

      <MobileAiPlanCreateSheet
        open={mobileAiOpen}
        onOpenChange={setMobileAiOpen}
        onBackToMode={() => {
          setMobileAiOpen(false);
          requestAnimationFrame(() => setModeOpen(true));
        }}
        onGenerate={(params) => {
          setMobileAiOpen(false);
          router.push(`/ai-coach?${params.toString()}`);
        }}
      />

      <AccessOptionsDialog
        open={pricingDialogOpen}
        onOpenChange={setPricingDialogOpen}
      />
    </>
  );
}
