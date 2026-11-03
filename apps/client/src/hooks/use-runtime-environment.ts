"use client";

import { useSyncExternalStore } from "react";
import {
  getDesktopRuntime,
  resolveRuntimeEnvironment,
} from "@/lib/runtime-environment";

const subscribe = () => () => {};
const getServerRuntime = () => null;

export function useRuntimeEnvironment() {
  const desktop = useSyncExternalStore(
    subscribe,
    getDesktopRuntime,
    getServerRuntime,
  );
  return {
    ...resolveRuntimeEnvironment(
      process.env.NEXT_PUBLIC_SELF_HOST_MODE ? "self-host" : "cloud",
      desktop ? "desktop" : "web",
    ),
    desktop,
  };
}
