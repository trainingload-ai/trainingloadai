"use client";

import { ActivityUploadCard } from "@/components/activities/ActivityUploadCard";

type ActivitiesEmptyStateProps = {
  title: string;
  description: string;
  uploadCardTitle: string;
  uploadDescription: string;
  uploadButtonLabel: string;
  onUploaded?: () => void;
};

export function ActivitiesEmptyState({
  title,
  description,
  uploadCardTitle,
  uploadDescription,
  uploadButtonLabel,
  onUploaded,
}: ActivitiesEmptyStateProps) {
  return (
    <div className="rounded-md border border-dashed border-border/70 bg-neutral-100 p-4 dark:bg-muted/45">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        {description}
      </p>
      <div className="mt-3 hidden lg:block">
        <ActivityUploadCard
          cardTitle={uploadCardTitle}
          description={uploadDescription}
          buttonLabel={uploadButtonLabel}
          onUploaded={onUploaded}
        />
      </div>
    </div>
  );
}
