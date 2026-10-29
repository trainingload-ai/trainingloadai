import { describe, expect, it, vi } from "vitest";
import { attachFocusMarker } from "./focus-marker";

describe("attachFocusMarker", () => {
  it("sets the coordinate before adding the marker to the map", () => {
    const calls: string[] = [];
    const map = {};
    const marker = {
      setLngLat: vi.fn(() => {
        calls.push("setLngLat");
      }),
      addTo: vi.fn(() => {
        calls.push("addTo");
      }),
    };

    expect(attachFocusMarker(marker, map, [121.47, 31.23])).toBe(marker);
    expect(calls).toEqual(["setLngLat", "addTo"]);
    expect(marker.setLngLat).toHaveBeenCalledWith([121.47, 31.23]);
    expect(marker.addTo).toHaveBeenCalledWith(map);
  });
});
