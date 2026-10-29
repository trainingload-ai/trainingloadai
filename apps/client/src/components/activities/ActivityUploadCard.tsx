"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import { FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { LazyFileUploadDialog } from "./LazyFileUploadDialog";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

type ActivityUploadCardProps = {
  cardTitle: string;
  description: string;
  buttonLabel: string;
  maxFiles?: number;
  onUploaded?: () => void;
  skipProgressAfterUpload?: boolean;
};

export function ActivityUploadCard({
  cardTitle,
  description,
  buttonLabel,
  maxFiles,
  onUploaded,
  skipProgressAfterUpload,
}: ActivityUploadCardProps) {
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();

  return (
    <div className="rounded-md bg-neutral-100 p-4 text-center dark:bg-muted/45">
      <FileUp className="mx-auto h-6 w-6 text-muted-foreground" />
      <div className="mt-2 text-sm font-semibold">{cardTitle}</div>
      <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      <LazyFileUploadDialog
        disabled={publicDemo.active}
        maxFiles={maxFiles}
        onUploaded={onUploaded}
        skipProgressAfterUpload={skipProgressAfterUpload}
        trigger={
          <button
            type="button"
            disabled={publicDemo.active}
            title={publicDemo.active ? demoText("readOnlyAction") : undefined}
            className="mt-3 inline-flex w-full max-w-[220px] items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {buttonLabel}
          </button>
        }
      />
    </div>
  );
}
