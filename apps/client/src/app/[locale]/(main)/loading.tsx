import { useTranslations } from "next-intl";
import { MainPageSkeleton } from "@/components/layout/MainPageSkeleton";

export default function MainRouteLoading() {
  const t = useTranslations("SharedUI");
  return (
    <div role="status">
      <span className="sr-only">{t("loadingEllipsis")}</span>
      <div aria-hidden="true">
        <MainPageSkeleton />
      </div>
    </div>
  );
}
