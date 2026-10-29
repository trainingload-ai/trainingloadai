import { apiFetch } from "@/lib/api";

export type CalendarSubscription = {
  feedUrl: string;
  webcalUrl: string;
  createdAt: string;
  updatedAt: string;
};

export async function getCalendarSubscription() {
  return (await apiFetch("/calendar/subscription", {
    method: "GET",
  })) as CalendarSubscription | undefined;
}

export async function resetCalendarSubscription() {
  return (await apiFetch("/calendar/subscription/reset", {
    method: "POST",
  })) as CalendarSubscription | undefined;
}
