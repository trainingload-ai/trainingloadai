"use client";

import { createContext, useContext, type RefObject } from "react";

// Portals inside a native modal must stay inside its non-inert subtree.
export const OverlayContainerContext = createContext<
  RefObject<HTMLElement | null> | undefined
>(undefined);
export function useOverlayContainer() {
  return useContext(OverlayContainerContext)?.current;
}
