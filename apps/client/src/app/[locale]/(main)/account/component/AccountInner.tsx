"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { authClient } from "@/lib/auth";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountAuthenticationSettings, AccountDeploymentDiagnostics } from "@deployment/managed-ui";

export function AccountInner() {
  const session = useViewerSession();
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();
  const t = useTranslations("AccountInner");
  const [name, setName] = useState(session.data?.user.name ?? "");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const handleNameUpdate = async () => {
    if (!name) {
      toast.error(t("name.emptyError"));
      return;
    }

    // 检查名字长度限制（20个字符）
    if (name.length > 20) {
      toast.error(t("name.lengthError"));
      return;
    }

    // 检查特殊字符（只允许字母、数字、中文、空格、连字符和下划线）
    const validNameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9\s\-_]+$/;
    if (!validNameRegex.test(name)) {
      toast.error(t("name.invalidCharError"));
      return;
    }

    try {
      setIsUpdatingName(true);
      const response = await authClient.updateUser({
        name,
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to update name");
      }

      toast.success(t("name.updateSuccess"));
      globalThis.location.reload();
    } catch (error) {
      console.error("Error updating name:", error);
      toast.error(
        error instanceof Error ? error.message : t("name.updateError"),
      );
    } finally {
      setIsUpdatingName(false);
    }
  };

  useEffect(() => {
    if (session.data?.user.name) setName(session.data.user.name);
  }, [session.data?.user.name]);

  return (
    <div key={session.data?.user.id} className="flex flex-col gap-4 md:gap-5">
      <section>
        <h1 className="mb-2 px-1 text-base font-semibold">{t("title")}</h1>
        <div className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("name.label")}</h4>
              <p className="text-mobile-caption text-muted-foreground pc:text-xs">
                {t("name.description")}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="name"
                  disabled={publicDemo.active}
                  title={
                    publicDemo.active ? demoText("readOnlyAction") : undefined
                  }
                  value={name}
                  onChange={({ target }) => setName(target.value)}
                  placeholder={t("name.placeholder")}
                />
                <Button
                  variant="outline"
                  onClick={handleNameUpdate}
                  size={"sm"}
                  disabled={
                    publicDemo.active ||
                    isUpdatingName ||
                    name === session.data?.user.name
                  }
                  title={
                    publicDemo.active ? demoText("readOnlyAction") : undefined
                  }
                >
                  {isUpdatingName ? t("name.updating") : t("name.updateButton")}
                </Button>
              </div>
            </div>
            <AccountAuthenticationSettings />
          </div>
        </div>
      </section>
      <AccountDeploymentDiagnostics />
    </div>
  );
}
