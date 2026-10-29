"use client";

import { useEffect } from "react";

import { useIsNewUser } from "@/api/use-user";
import { useRouter } from "@/i18n/navigation";

export function MainOnboardingRedirect() {
  const router = useRouter();
  const { data: isNewUser } = useIsNewUser();

  useEffect(() => {
    if (isNewUser) {
      router.replace("/onboarding");
    }
  }, [isNewUser, router]);

  return null;
}
