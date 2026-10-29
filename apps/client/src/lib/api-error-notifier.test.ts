import { describe, expect, it, vi } from "vitest";

import { ApiFetchError } from "./api-error";
import { createApiErrorNotifier } from "./api-error-notifier";

describe("createApiErrorNotifier", () => {
  it("groups concurrent server failures into one notice per scope", () => {
    let currentTime = 1_000;
    const notify = vi.fn();
    const notifier = createApiErrorNotifier({
      notify,
      now: () => currentTime,
      dedupeWindowMs: 4_000,
    });

    for (let index = 0; index < 5; index += 1) {
      notifier.report(
        new ApiFetchError(`server failure ${index}`, 500, "INTERNAL_ERROR"),
        { scope: "/zh/calendar", surface: "page" },
      );
    }

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("server failure 0", {
      id: "api-error:server:/zh/calendar",
    });

    currentTime += 4_000;
    notifier.report(new ApiFetchError("server failure later", 503), {
      scope: "/zh/calendar",
      surface: "background",
    });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("does not merge failures from different page scopes", () => {
    const notify = vi.fn();
    const notifier = createApiErrorNotifier({
      notify,
      now: () => 1_000,
    });

    notifier.report(new ApiFetchError("first", 500), {
      scope: "/zh/home",
    });
    notifier.report(new ApiFetchError("second", 500), {
      scope: "/zh/calendar",
    });

    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("keeps auth, cancellation, not-found, and background validation silent", () => {
    const notify = vi.fn();
    const notifier = createApiErrorNotifier({ notify });

    notifier.report(new ApiFetchError("unauthorized", 401));
    notifier.report(new DOMException("cancelled", "AbortError"));
    notifier.report(new ApiFetchError("missing", 404));
    notifier.report(new ApiFetchError("invalid", 422), {
      surface: "background",
    });

    expect(notify).not.toHaveBeenCalled();

    notifier.report(new ApiFetchError("invalid action", 422), {
      surface: "action",
      scope: "profile-save",
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("preserves explicit notification suppression from apiFetch callers", () => {
    const notify = vi.fn();
    const notifier = createApiErrorNotifier({ notify });

    notifier.report(
      new ApiFetchError("handled inline", 500, "INTERNAL_ERROR", undefined, true),
      { scope: "/zh/health", surface: "page" },
    );

    expect(notify).not.toHaveBeenCalled();
  });
});
