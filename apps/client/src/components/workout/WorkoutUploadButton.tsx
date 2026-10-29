"use client";

import React, { useRef, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { parseWorkoutFile, ParsedPlan } from "@/api/workout";

interface WorkoutUploadButtonProps {
  onParsed: (result: { block: ParsedPlan; plan: string }) => void;
  onError?: (message: string) => void;
  accept?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
  label?: string;
}

export const WorkoutUploadButton: React.FC<WorkoutUploadButtonProps> = ({
  onParsed,
  onError,
  accept = ".fit,.gpx,.tcx",
  size = "sm",
  variant = "secondary",
  className,
  label,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const onClick = () => inputRef.current?.click();

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { block, plan } = await parseWorkoutFile(file);
      onParsed({ block, plan });
    } catch (err: unknown) {
      onError?.(err instanceof Error ? err.message : "Upload or parse failed");
    } finally {
      setUploading(false);
      // Clear selection to allow re-uploading the same file
      e.target.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={onChange}
      />
      <Button
        onClick={onClick}
        disabled={uploading}
        size={size}
        variant={variant}
        className={className}
      >
        {uploading ? "Uploading..." : (label ?? "Upload FIT")}
      </Button>
    </>
  );
};
