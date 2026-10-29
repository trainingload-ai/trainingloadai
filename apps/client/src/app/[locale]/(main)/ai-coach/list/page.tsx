import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { CoachReviewSessionsListPage } from "../coach-review-sessions-list-page";

function ListFallback() {
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center text-muted-foreground">
      <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden />
    </div>
  );
}

/**
 * 复盘会话全量列表：/ai-coach/list?type=day|week|month
 */
export default function CoachReviewListRoutePage() {
  return (
    <Suspense fallback={<ListFallback />}>
      <CoachReviewSessionsListPage />
    </Suspense>
  );
}
