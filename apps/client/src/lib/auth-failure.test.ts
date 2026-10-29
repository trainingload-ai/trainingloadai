import { describe, expect, it, vi } from "vitest";

import { ApiFetchError } from "./api-error";
import {
  createAuthFailureCoordinator,
  isAuthOrPublicPath,
} from "./auth-failure";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createAuthFailureCoordinator", () => {
  it("runs sign-out and redirect once for concurrent 401 failures", async () => {
    const signOut = deferred();
    const markSessionExpired = vi.fn();
    const replace = vi.fn();
    const coordinator = createAuthFailureCoordinator({
      canHandle: () => true,
      markSessionExpired,
      signOut: () => signOut.promise,
      getLoginPath: () => "/zh/login?callbackURL=%2Fzh%2Fcalendar",
      replace,
    });
    const error = new ApiFetchError("Unauthorized", 401, "UNAUTHORIZED");

    const first = coordinator.handle(error);
    const second = coordinator.handle(error);
    const third = coordinator.handle(error);

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(coordinator.getPending()).toBe(first);
    await flushMicrotasks();
    expect(markSessionExpired).toHaveBeenCalledTimes(1);

    signOut.resolve();
    await flushMicrotasks();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "/zh/login?callbackURL=%2Fzh%2Fcalendar",
    );
  });

  it("still redirects when best-effort sign-out fails", async () => {
    const replace = vi.fn();
    const coordinator = createAuthFailureCoordinator({
      canHandle: () => true,
      markSessionExpired: () => {
        throw new Error("storage disabled");
      },
      signOut: () => Promise.reject(new Error("offline")),
      getLoginPath: () => "/en/login",
      replace,
    });

    void coordinator.handle(new ApiFetchError("Unauthorized", 401));
    await flushMicrotasks();

    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("returns the original error on authentication routes", async () => {
    const signOut = vi.fn();
    const coordinator = createAuthFailureCoordinator({
      canHandle: () => false,
      markSessionExpired: vi.fn(),
      signOut,
      getLoginPath: () => "/en/login",
      replace: vi.fn(),
    });
    const error = new ApiFetchError("Invalid credentials", 401);

    await expect(coordinator.handle(error)).rejects.toBe(error);
    expect(coordinator.getPending()).toBeUndefined();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("isAuthOrPublicPath", () => {
  it("treats auth routes as public even with a locale prefix", () => {
    expect(isAuthOrPublicPath("/en/login")).toBe(true);
    expect(isAuthOrPublicPath("/zh/share/plans/YznD7aM6MC7-")).toBe(false);
    expect(isAuthOrPublicPath("/zh/plans/import/share/abc")).toBe(false);
    expect(isAuthOrPublicPath("/zh/calendar")).toBe(false);
  });
});
