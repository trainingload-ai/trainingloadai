"use client";

import { createContext, useContext } from "react";

export const CoachThinkingEnabledContext = createContext(false);

export function useCoachThinkingEnabled() {
  return useContext(CoachThinkingEnabledContext);
}
