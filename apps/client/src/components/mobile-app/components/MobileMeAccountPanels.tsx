"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { authClient } from "@/lib/auth";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

function MobileAccountField({
  label,
  value,
  onChange,
  type = "text",
  last = false,
  maxLength,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  last?: boolean;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex min-h-[52px] items-center gap-3 bg-card px-4 ${
        last ? "" : "border-b border-border/60"
      }`}
    >
      <span className="w-[92px] shrink-0 text-mobile-subtitle text-foreground/80">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        maxLength={maxLength}
        disabled={disabled}
        autoCapitalize="none"
        autoCorrect="off"
        placeholder={label}
        className="min-w-0 flex-1 bg-transparent py-2 text-right text-mobile-headline outline-none placeholder:text-muted-foreground/55"
      />
    </label>
  );
}

function MobileAccountAction({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-12 w-full rounded-xl bg-zinc-200 px-4 text-mobile-subtitle font-medium text-zinc-800 active:bg-zinc-300 disabled:opacity-45 dark:bg-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-600"
    >
      {children}
    </button>
  );
}

export function MobileNicknamePanel({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("AccountInner");
  const publicDemo = usePublicDemo();
  const session = useViewerSession();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(session.data?.user?.name ?? "");
  }, [session.data?.user?.name]);

  const save = async () => {
    if (publicDemo.active) return;
    const value = name.trim();
    if (!value) return toast.error(t("name.emptyError"));
    if (value.length > 20) return toast.error(t("name.lengthError"));
    if (!/^[\u4e00-\u9fa5a-zA-Z0-9\s\-_]+$/.test(value)) {
      return toast.error(t("name.invalidCharError"));
    }
    setSaving(true);
    try {
      const response = await authClient.updateUser({ name: value });
      if (response.error) throw new Error(response.error.message);
      await session.refetch();
      toast.success(t("name.updateSuccess"));
      onSaved();
    } catch {
      toast.error(t("name.updateError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-[68dvh] flex-col justify-between gap-5 pb-3">
      <div className="space-y-1.5">
        <div className="overflow-hidden rounded-surface bg-card">
          <MobileAccountField
            label={t("name.label")}
            value={name}
            onChange={setName}
            maxLength={20}
            disabled={publicDemo.active}
            last
          />
        </div>
        <p className="px-1 text-mobile-caption leading-5 text-muted-foreground">
          {t("name.description")}
        </p>
      </div>
      <MobileAccountAction
        disabled={publicDemo.active || saving}
        onClick={() => void save()}
      >
        {saving ? t("name.updating") : t("name.updateButton")}
      </MobileAccountAction>
    </div>
  );
}

