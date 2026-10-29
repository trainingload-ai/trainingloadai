import { LoaderCircle } from "lucide-react";

export function CoachTypingDots() {
  return (
    <div className="flex items-center py-1 text-neutral-400 dark:text-neutral-500">
      <LoaderCircle className="h-4 w-4 animate-spin" />
    </div>
  );
}
