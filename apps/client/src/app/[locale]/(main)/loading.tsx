import { LoadingSpinner } from "@/components/icons/spinner";

export default function MainRouteLoading() {
  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner className="h-6 w-6" />
    </div>
  );
}
