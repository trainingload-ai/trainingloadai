import { describe, expect, it } from "vitest";
import { resolveCoachRuntimeMount } from "./coach-runtime-mount";

describe("resolveCoachRuntimeMount", () => {
  it("keeps the live new-conversation runtime when its sid reaches the URL", () => {
    expect(
      resolveCoachRuntimeMount(
        {
          mountedSid: "",
          internallyPersistedSid: "allocated-session",
          generation: 0,
        },
        "allocated-session",
      ),
    ).toEqual({
      mountedSid: "",
      internallyPersistedSid: "allocated-session",
      generation: 0,
      preservesAllocatedRuntime: true,
    });
  });

  it("starts a fresh runtime when the user opens another conversation", () => {
    expect(
      resolveCoachRuntimeMount(
        {
          mountedSid: "session-1",
          internallyPersistedSid: null,
          generation: 2,
        },
        "session-2",
      ),
    ).toEqual({
      mountedSid: "session-2",
      internallyPersistedSid: null,
      generation: 3,
      preservesAllocatedRuntime: false,
    });
  });

  it("resets the preserved runtime when a new blank chat is requested", () => {
    expect(
      resolveCoachRuntimeMount(
        {
          mountedSid: "",
          internallyPersistedSid: "allocated-session",
          generation: 0,
        },
        "",
      ),
    ).toEqual({
      mountedSid: "",
      internallyPersistedSid: null,
      generation: 1,
      preservesAllocatedRuntime: false,
    });
  });
});
