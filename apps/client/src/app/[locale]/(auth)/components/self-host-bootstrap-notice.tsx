"use client";

import { ArrowClockwise } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createLocalOwner,
  openLocalOwnerSession,
} from "@/api/self-host-bootstrap";

type SelfHostBootstrapNoticeProps = {
  browserSetupAvailable: boolean;
  isRefreshing: boolean;
  onInitialized: () => void;
  onRefresh: () => void;
};

export default function SelfHostBootstrapNotice({
  browserSetupAvailable,
  isRefreshing,
  onInitialized,
  onRefresh,
}: SelfHostBootstrapNoticeProps) {
  const t = useTranslations("login.selfHost");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError(t("localOwnerNameRequired"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await createLocalOwner(normalizedName);
      await openLocalOwnerSession();
      onInitialized();
    } catch {
      setError(t("localOwnerSetupFailed"));
      setIsSubmitting(false);
    }
  };

  if (browserSetupAvailable) {
    return (
      <form className="space-y-5" onSubmit={(event) => void createOwner(event)}>
        <div className="space-y-2">
          <Label htmlFor="self-host-owner-name">{t("localOwnerName")}</Label>
          <Input
            id="self-host-owner-name"
            name="name"
            size="lg"
            autoComplete="nickname"
            autoFocus
            maxLength={20}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("localOwnerNamePlaceholder")}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "self-host-owner-error" : undefined}
            disabled={isSubmitting}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {t("localOwnerNameHint")}
          </p>
          {error ? (
            <p
              id="self-host-owner-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? t("localOwnerCreating") : t("localOwnerContinue")}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p role="alert" className="text-sm text-muted-foreground">{t("localSessionFailed")}</p>
      <Button type="button" variant="outline" className="w-full" disabled={isRefreshing} onClick={onRefresh}>
        <ArrowClockwise aria-hidden className={isRefreshing ? "animate-spin" : undefined} />
        {t("localSessionRetry")}
      </Button>
    </div>
  );
}
