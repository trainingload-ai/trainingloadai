"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useState } from "react";

const loadFileUploadDialog = () =>
  import("@/app/[locale]/(main)/activities/components/ActivityList/FileUploadDialog");

const FileUploadDialog = dynamic(
  () => loadFileUploadDialog().then((module) => module.FileUploadDialog),
  { ssr: false },
);

export function LazyFileUploadDialog({
  acceptedFileTypes,
  maxFiles,
  onUploaded,
  skipProgressAfterUpload,
  trigger,
  disabled = false,
}: {
  acceptedFileTypes?: string[];
  maxFiles?: number;
  onUploaded?: () => void;
  skipProgressAfterUpload?: boolean;
  trigger: ReactNode;
  disabled?: boolean;
}) {
  const [dialogLoaded, setDialogLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openDialog = () => {
    if (disabled) return;
    setDialogLoaded(true);
    setDialogOpen(true);
  };

  return (
    <>
      <span
        className="contents"
        onClick={openDialog}
        onFocus={() => {
          if (!disabled) void loadFileUploadDialog();
        }}
        onPointerEnter={() => {
          if (!disabled) void loadFileUploadDialog();
        }}
      >
        {trigger}
      </span>
      {dialogLoaded && !disabled ? (
        <FileUploadDialog
          acceptedFileTypes={acceptedFileTypes}
          maxFiles={maxFiles}
          onUploaded={onUploaded}
          skipProgressAfterUpload={skipProgressAfterUpload}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          trigger={null}
        />
      ) : null}
    </>
  );
}
