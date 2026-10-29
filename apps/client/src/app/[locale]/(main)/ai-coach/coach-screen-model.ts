"use client";

export type CoachScreenMode = "history" | "reviews" | "start" | "chat";

export function getCoachScreenMode(args: {
  showAllHistory: boolean;
  showReviewHub: boolean;
  showStartScreen: boolean;
}): CoachScreenMode {
  if (args.showAllHistory) return "history";
  if (args.showReviewHub) return "reviews";
  if (args.showStartScreen) return "start";
  return "chat";
}
