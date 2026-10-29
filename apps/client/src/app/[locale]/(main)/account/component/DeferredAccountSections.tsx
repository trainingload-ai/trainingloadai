"use client";

import dynamic from "next/dynamic";
import { DeferredMount } from "@/components/deferred-mount";
import { useSelfHostSessionPolicy } from "@/api/self-host-bootstrap";

function AccountSectionSkeleton({ minHeight }: { minHeight: number }) {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45"
      style={{ minHeight }}
    />
  );
}

const ZoneSettings = dynamic(
  () => import("./zoneSettings").then((module) => module.ZoneSettings),
  {
    ssr: false,
    loading: () => <AccountSectionSkeleton minHeight={360} />,
  },
);

const ThirdPartyConnections = dynamic(
  () =>
    import("./ThirdPartyConnections").then(
      (module) => module.ThirdPartyConnections,
    ),
  {
    ssr: false,
    loading: () => <AccountSectionSkeleton minHeight={420} />,
  },
);

const AccountDeleteSection = dynamic(
  () =>
    import("./AccountDeleteSection").then(
      (module) => module.AccountDeleteSection,
    ),
  {
    ssr: false,
    loading: () => <AccountSectionSkeleton minHeight={160} />,
  },
);

export function DeferredZoneSettings() {
  return (
    <DeferredMount
      rootMargin="480px 0px"
      fallback={<AccountSectionSkeleton minHeight={360} />}
    >
      <ZoneSettings />
    </DeferredMount>
  );
}

export function DeferredThirdPartyConnections() {
  return (
    <DeferredMount
      rootMargin="480px 0px"
      fallback={<AccountSectionSkeleton minHeight={420} />}
    >
      <ThirdPartyConnections />
    </DeferredMount>
  );
}

export function DeferredAccountDeleteSection() {
  const { canDeleteAccount, canSignOut } = useSelfHostSessionPolicy();
  if (!canDeleteAccount && !canSignOut) return null;

  return (
    <DeferredMount
      rootMargin="480px 0px"
      fallback={<AccountSectionSkeleton minHeight={160} />}
    >
      <AccountDeleteSection />
    </DeferredMount>
  );
}
