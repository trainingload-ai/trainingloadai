import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCoachSid } from "./use-coach-sid";
import { resetCoachSidStoreForTests } from "./coach-sid-store";

const EXISTING = "39b1e053-6431-4c69-aa73-75391bf3cf0a";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: "/ai-coach",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

function setLocationSearch(search: string) {
  window.history.replaceState(
    {},
    "",
    search ? `/zh-hant/ai-coach?${search}` : "/zh-hant/ai-coach",
  );
}

describe("useCoachSid", () => {
  beforeEach(() => {
    resetCoachSidStoreForTests();
    mocks.replace.mockReset();
    mocks.pathname = "/ai-coach";
    mocks.searchParams = new URLSearchParams();
    window.localStorage.clear();
    setLocationSearch("");
  });

  afterEach(() => {
    resetCoachSidStoreForTests();
  });

  it("keeps an existing location sid when useSearchParams has not caught up", () => {
    setLocationSearch(`sid=${EXISTING}`);

    const { result } = renderHook(() => useCoachSid());

    expect(result.current.sid).toBe(EXISTING);
    expect(window.localStorage.getItem("ai_coach_sid")).toBe(EXISTING);
  });

  it("shares one sid across hook instances so the runtime applySid hydrates the page", () => {
    setLocationSearch(`sid=${EXISTING}`);

    const page = renderHook(() => useCoachSid());
    const runtime = renderHook(() => useCoachSid());

    expect(page.result.current.sid).toBe(EXISTING);
    expect(runtime.result.current.sid).toBe(EXISTING);

    act(() => {
      runtime.result.current.clearCoachSidFromUrl();
    });

    expect(page.result.current.sid).toBe("");
    expect(runtime.result.current.sid).toBe("");
  });

  it("does not restore a stale searchParams sid after starting a new conversation", () => {
    mocks.searchParams = new URLSearchParams(`sid=${EXISTING}`);
    setLocationSearch(`sid=${EXISTING}`);

    const { result } = renderHook(() => useCoachSid());
    expect(result.current.sid).toBe(EXISTING);

    act(() => {
      result.current.clearCoachSidFromUrl();
    });

    expect(result.current.sid).toBe("");
    setLocationSearch("");
    mocks.searchParams = new URLSearchParams(`sid=${EXISTING}`);

    const { result: rerendered } = renderHook(() => useCoachSid());
    expect(rerendered.current.sid).toBe("");
  });

  it("writes sid immediately on applySid even before the URL commit", () => {
    const { result } = renderHook(() => useCoachSid());

    act(() => {
      result.current.applySid(EXISTING);
    });

    expect(result.current.sid).toBe(EXISTING);
    expect(mocks.replace).toHaveBeenCalledWith(`/ai-coach?sid=${EXISTING}`, {
      scroll: false,
    });
  });

  it("clears a leftover localStorage sid on a bare /ai-coach URL", () => {
    window.localStorage.setItem("ai_coach_sid", EXISTING);

    const { result } = renderHook(() => useCoachSid());

    expect(result.current.sid).toBe("");
    expect(window.localStorage.getItem("ai_coach_sid")).toBeNull();
  });

  it("opens a new conversation instead of restoring a leftover sid", () => {
    window.localStorage.setItem("ai_coach_sid", EXISTING);
    mocks.searchParams = new URLSearchParams(`sid=${EXISTING}`);
    setLocationSearch(`sid=${EXISTING}`);

    const { result } = renderHook(() => useCoachSid());
    expect(result.current.sid).toBe(EXISTING);

    act(() => {
      result.current.openNewCoachChat();
    });

    expect(result.current.sid).toBe("");
    expect(window.localStorage.getItem("ai_coach_sid")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/ai-coach", { scroll: false });
  });

  it("does not restore a leftover localStorage sid while the sidebar hook is mounted outside /ai-coach", () => {
    mocks.pathname = "/plan";
    window.localStorage.setItem("ai_coach_sid", EXISTING);

    const { result } = renderHook(() => useCoachSid());

    expect(result.current.sid).toBe("");
    expect(window.localStorage.getItem("ai_coach_sid")).toBe(EXISTING);
  });
});
