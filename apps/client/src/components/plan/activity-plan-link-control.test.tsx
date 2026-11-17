import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { V2ActivityListItem } from "@/api/v2-activities";
import { queryKeys } from "@/lib/query-keys";
import { ActivityPlanLinkControl } from "./activity-plan-link-control";

const state = vi.hoisted(() => ({ linked: false }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@deployment/managed-ui", () => ({
  useGuestAccessText: () => (key: string) => key,
}));
vi.mock("@/public-demo/public-demo-provider", () => ({
  usePublicDemo: () => ({ active: false }),
}));
vi.mock("@/api/activity-plan-link", () => ({
  getActivityPlanCandidates: async () => ({
    candidates: [
      {
        workoutId: "independent",
        planId: null,
        name: "Ordinary run",
        sessionIndex: 1,
      },
    ],
  }),
  replaceActivityPlanLink: async () => {
    state.linked = true;
    return {
      linkedPlanWorkout: {
        workoutId: "independent",
        planId: null,
        name: "Ordinary run",
        source: "MANUAL",
      },
    };
  },
  removeActivityPlanLink: async () => {
    state.linked = false;
  },
}));

function HomePreview() {
  const home = useQuery({
    queryKey: queryKeys.home.v2(),
    queryFn: async () => (state.linked ? "DONE" : "PLANNED"),
  });
  return <p>Home: {home.data}</p>;
}

function Activity() {
  const [activity, setActivity] = useState({
    hashId: "run",
    linkedPlanWorkout: null,
  } as V2ActivityListItem);
  return (
    <ActivityPlanLinkControl
      activity={activity}
      onLinkedPlanWorkoutChange={(linked) =>
        setActivity((current) => ({ ...current, linkedPlanWorkout: linked }))
      }
    />
  );
}

describe("activity-side manual completion", () => {
  it("refreshes a fresh home cache on link and undo without an active plan", async () => {
    state.linked = false;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    render(
      <QueryClientProvider client={client}>
        <HomePreview />
        <Activity />
      </QueryClientProvider>,
    );
    await screen.findByText("Home: PLANNED");
    fireEvent.keyDown(screen.getByRole("button", { name: "label.unlinked" }), {
      key: "ArrowDown",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Ordinary run/ }),
    );
    await screen.findByText("Home: DONE");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Ordinary run" }),
      ).toBeEnabled(),
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Ordinary run" }), {
      key: "ArrowDown",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "dropdown.removeLink" }),
    );
    await screen.findByText("Home: PLANNED");
    client.clear();
  });
});
