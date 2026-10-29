import { SiteErrorState } from "@/components/site-error-state";

export default function HomeNotFound() {
  return <SiteErrorState kind="not-found" />;
}
