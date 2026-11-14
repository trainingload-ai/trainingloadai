import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ track: vi.fn(), capture: vi.fn() }));
vi.mock("./tool-analytics", () => ({ trackToolEvent: mocks.track }));
vi.mock("./tool-sentry", () => ({ captureToolFailure: mocks.capture }));
import {
  captureLactateFailure,
  createLactateAttempt,
  editedLactateOrigin,
  safeLactateProperties,
  trackLactateEvent,
} from "./lactate-telemetry";
import { sanitizeLactateSentryEvent } from "./lactate-sentry";

afterEach(() => vi.clearAllMocks());
describe("lactate telemetry boundaries", () => {
  it("strips input values, filenames, free text and unknown enum values", () => {
    const safe = safeLactateProperties({
      input_origin: "user",
      sport: "cycling",
      lactate: 9.87654321,
      filename: "private-athlete.csv",
      reason_code: "private text",
      duration_ms: 35.1,
      engine_version: "untrusted",
    });
    expect(safe).toEqual({
      engine_version: "1.0.0",
      input_origin: "user",
      sport: "cycling",
      duration_ms: 35,
    });
    trackLactateEvent("tool_completed", {
      status: "partial",
      input_origin: "example_edited",
    });
    expect(mocks.track).toHaveBeenCalledWith(
      "tool_completed",
      "lactate_curve_calculator",
      expect.objectContaining({ input_origin: "example_edited" }),
    );
  });
  it("keeps edited examples separate and admits only one attempt terminal", () => {
    expect(editedLactateOrigin("example")).toBe("example_edited");
    expect(editedLactateOrigin("example_edited")).toBe("example_edited");
    const attempt = createLactateAttempt();
    expect(attempt.start()).toBe(true);
    expect(attempt.start()).toBe(false);
    expect(attempt.finish()).toBe(true);
    expect(attempt.finish()).toBe(false);
    expect(attempt.start()).toBe(true);
  });
  it("removes sensitive automatic Sentry context on this route only", () => {
    const event = {
      type: undefined,
      message: "9.87654321",
      user: { email: "private@example.test" },
      extra: { input: "private input" },
      request: { url: "https://example.test/?input=private" },
      breadcrumbs: [{ message: "private input" }],
      exception: {
        values: [
          {
            value: "private cell",
            stacktrace: {
              frames: [
                {
                  filename: "https://example.test/app.js?private",
                  vars: { lactate: "private" },
                  lineno: 20,
                },
              ],
            },
          },
        ],
      },
    };
    const clean = sanitizeLactateSentryEvent(
      event,
      "/zh/lactate-curve-calculator",
    );
    expect(JSON.stringify(clean)).not.toMatch(/private|9\.87654321/);
    expect(clean.exception?.values?.[0]?.stacktrace?.frames?.[0]?.lineno).toBe(
      20,
    );
    expect(sanitizeLactateSentryEvent(event, "/ftp-calculator")).toBe(event);
    captureLactateFailure("analysis");
    expect(mocks.capture.mock.calls[0]![0].error.message).toBe(
      "Lactate tool analysis failed",
    );
  });
});
