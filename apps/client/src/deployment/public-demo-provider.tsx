"use client";

import type { PublicDemoCapability } from "@shared/public-demo-policy";

export type PublicDemoUser = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
};

const disabledPublicDemo = {
  active: false,
  capabilities: [] as readonly PublicDemoCapability[],
  can: (_capability: PublicDemoCapability) => false,
  datasetVersion: null,
  error: null,
  loading: false,
  user: null as PublicDemoUser | null,
  retry: () => undefined,
};

export function PublicDemoProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

export function usePublicDemo() {
  return disabledPublicDemo;
}
