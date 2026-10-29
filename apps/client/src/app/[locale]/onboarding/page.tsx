import { RequireSignedIn } from "@/components/auth/RequireSignedIn";
import { OnboardingPageClient } from "./OnboardingPageClient";

export default function OnboardingPage() {
  return (
    <RequireSignedIn>
      <OnboardingPageClient />
    </RequireSignedIn>
  );
}
