import { act, renderHook } from "@testing-library/react";
import { encode } from "@mapbox/polyline";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useActivityLayerManager,
  type ActivityLayer,
} from "./userActivityMapLayerManager";
import type { RuntimeMapConfiguration } from "@/api/runtime-capabilities";

type Source = { data: any; setData: ReturnType<typeof vi.fn> };
type MapDouble = {
  sources: Map<string, Source>;
  layers: Map<string, any>;
  fitBounds: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
  fire: (event: string) => void;
  ready: boolean;
  dragPan: {
    enable: ReturnType<typeof vi.fn>;
    disable: ReturnType<typeof vi.fn>;
  };
};
const state = vi.hoisted(() => ({
  maps: [] as MapDouble[],
  ready: true,
  unit: "metric" as "metric" | "imperial",
  theme: "light",
  config: {
    provider: "none",
    styleUrl: null,
    tileUrl: null,
    attribution: null,
    maxZoom: 18,
    publicToken: null,
    tilePolicy: { browserOnly: true, bulkDownloadAllowed: false },
  } as RuntimeMapConfiguration,
}));
vi.mock("@/lib/store", () => ({
  useStore: () => ({ systemUnit: state.unit }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: state.theme }) }));
vi.mock("@/api/runtime-capabilities", () => ({
  // Equivalent configuration snapshots must not recreate a map either.
  useRuntimeMapConfiguration: () => ({
    config: { ...state.config },
    isLoading: false,
  }),
}));
vi.mock("@deployment/map-engine", () => {
  class MockMap {
    sources = new globalThis.Map<string, Source>();
    layers = new globalThis.Map<string, any>();
    handlers = new globalThis.Map<string, Set<() => void>>();
    ready = state.ready;
    fitBounds = vi.fn();
    remove = vi.fn();
    resize = vi.fn();
    addControl = vi.fn();
    setStyle = vi.fn();
    scrollZoom = { enable: vi.fn(), disable: vi.fn() };
    boxZoom = { enable: vi.fn(), disable: vi.fn() };
    dragRotate = { enable: vi.fn(), disable: vi.fn() };
    dragPan = { enable: vi.fn(), disable: vi.fn() };
    keyboard = { enable: vi.fn(), disable: vi.fn() };
    doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };
    touchZoomRotate = { enable: vi.fn(), disable: vi.fn() };
    constructor() {
      state.maps.push(this);
    }
    getContainer() {
      return document.createElement("div");
    }
    isStyleLoaded() {
      return this.ready;
    }
    on(event: string, handler: () => void) {
      const handlers = this.handlers.get(event) ?? new Set();
      handlers.add(handler);
      this.handlers.set(event, handlers);
    }
    off(event: string, handler: () => void) {
      this.handlers.get(event)?.delete(handler);
    }
    once(event: string, handler: () => void) {
      const once = () => {
        this.off(event, once);
        handler();
      };
      this.on(event, once);
    }
    fire(event: string) {
      if (event === "style.load" || event === "idle") this.ready = true;
      for (const handler of [...(this.handlers.get(event) ?? [])]) handler();
    }
    addSource(id: string, input: { data: unknown }) {
      if (this.sources.has(id)) throw new Error(`Duplicate source: ${id}`);
      const source: Source = {
        data: input.data,
        setData: vi.fn((data) => {
          source.data = data;
        }),
      };
      this.sources.set(id, source);
    }
    getSource(id: string) {
      return this.sources.get(id);
    }
    addLayer(layer: { id: string }) {
      if (this.layers.has(layer.id))
        throw new Error(`Duplicate layer: ${layer.id}`);
      this.layers.set(layer.id, layer);
    }
    getLayer(id: string) {
      return this.layers.get(id);
    }
    setPaintProperty = vi.fn();
    setLayoutProperty = vi.fn();
  }
  return {
    Map: MockMap,
    ScaleControl: class {},
    LngLat: class {
      distanceTo() {
        return 5000;
      }
    },
    LngLatBounds: class {
      points: unknown[] = [];
      extend(point: unknown) {
        this.points.push(point);
      }
      isEmpty() {
        return !this.points.length;
      }
    },
    Marker: class {
      setLngLat() {
        return this;
      }
      addTo() {
        return this;
      }
      remove = vi.fn();
    },
    configureMapEngine: vi.fn(),
    getMapAttributionOptions: () => ({}),
  };
});

const original = encode([
  [30, 120],
  [30.01, 120.01],
]);
const segmented = encode([
  [30, 120],
  [30.005, 120.006],
  [30.01, 120.01],
]);
const layer = (polyline = original): ActivityLayer => ({
  center: [120.005, 30.005],
  bounds: [
    [30, 120],
    [30.01, 120.01],
  ],
  maps: [{ hashId: "run-1", polyline }],
});
type Props = Parameters<typeof useActivityLayerManager>[0];
const options = (activityLayer = layer()): Props => ({
  activityLayer,
  interactive: false,
  fitBoundsPadding: { top: 32, bottom: 32, left: 64, right: 64 },
  lockedFitBoundsPadding: { top: 32, bottom: 32, left: 64, right: 64 },
});
const routeCoordinates = (map: MapDouble) =>
  map.sources.get("activities-source")!.data.features[0].geometry.coordinates;

beforeEach(() => {
  state.maps = [];
  state.ready = true;
  state.unit = "metric";
  state.theme = "light";
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe("activity map lifetime and route updates", () => {
  it("reuses the same basemap and camera when entering and leaving timeline repeatedly", () => {
    const { rerender, unmount } = renderHook(useActivityLayerManager, {
      initialProps: options(),
    });
    const map = state.maps[0];
    const source = map.sources.get("activities-source")!;
    const markerSource = map.sources.get("distance-markers-source")!;
    const framingCount = map.fitBounds.mock.calls.length;
    for (let i = 0; i < 3; i++) {
      rerender({
        ...options(layer(segmented)),
        focusTracks: null,
        autoFitFocus: false,
      });
      expect(routeCoordinates(map)).toEqual([
        [120, 30],
        [120.006, 30.005],
        [120.01, 30.01],
      ]);
      rerender(options());
      expect(routeCoordinates(map)).toEqual([
        [120, 30],
        [120.01, 30.01],
      ]);
    }
    expect(state.maps).toHaveLength(1);
    expect(map.remove).not.toHaveBeenCalled();
    expect(map.setStyle).not.toHaveBeenCalled();
    expect(map.fitBounds).toHaveBeenCalledTimes(framingCount);
    expect(map.sources.get("activities-source")).toBe(source);
    expect(map.sources.get("distance-markers-source")).toBe(markerSource);
    expect(source.setData).toHaveBeenCalledTimes(6);
    unmount();
    expect(map.remove).toHaveBeenCalledTimes(1);
  });

  it("uses only the latest track if tabs change before the style is ready", () => {
    state.ready = false;
    const { rerender } = renderHook(useActivityLayerManager, {
      initialProps: options(),
    });
    const map = state.maps[0];
    rerender(options(layer(segmented)));
    rerender(options());
    expect(map.sources.size).toBe(0);
    act(() => map.fire("style.load"));
    expect(routeCoordinates(map)).toEqual([
      [120, 30],
      [120.01, 30.01],
    ]);
    expect(
      map.sources.get("activities-source")!.setData,
    ).not.toHaveBeenCalled();
    expect(state.maps).toHaveLength(1);
  });

  it("waits for idle when an existing style is busy, without waiting for another initial load", () => {
    const { rerender } = renderHook(useActivityLayerManager, {
      initialProps: options(),
    });
    const map = state.maps[0];
    map.ready = false;
    rerender({
      ...options(layer(segmented)),
      autoFitFocus: false,
      focusTracks: [
        [
          [120, 30],
          [120.006, 30.005],
        ],
      ],
    });
    expect(routeCoordinates(map)).toEqual([
      [120, 30],
      [120.01, 30.01],
    ]);
    act(() => map.fire("idle"));
    expect(routeCoordinates(map)).toEqual([
      [120, 30],
      [120.006, 30.005],
      [120.01, 30.01],
    ]);
    expect(map.sources.has("activity-focus-source")).toBe(true);
    expect(state.maps).toHaveLength(1);
  });

  it("clears timeline highlights without fitting a camera the timeline never moved", () => {
    const { rerender } = renderHook(useActivityLayerManager, {
      initialProps: options(),
    });
    const map = state.maps[0];
    const framingCount = map.fitBounds.mock.calls.length;
    rerender({
      ...options(layer(segmented)),
      autoFitFocus: false,
      focusTracks: [
        [
          [120, 30],
          [120.006, 30.005],
        ],
      ],
    });
    expect(
      map.sources.get("activity-focus-source")!.data.features[0].geometry
        .coordinates,
    ).toHaveLength(1);
    rerender(options());
    expect(state.maps).toHaveLength(1);
    expect(map.fitBounds).toHaveBeenCalledTimes(framingCount);
    expect(map.remove).not.toHaveBeenCalled();
  });

  it("updates distance units without replacing the map or leaving stale markers", () => {
    const { rerender } = renderHook(useActivityLayerManager, {
      initialProps: options(),
    });
    const map = state.maps[0];
    const markers = map.sources.get("distance-markers-source")!;
    expect(markers.data.features).toHaveLength(5);
    state.unit = "imperial";
    rerender(options());
    expect(markers.data.features).toHaveLength(3);
    rerender(options({ ...layer(), maps: [] }));
    expect(markers.data.features).toEqual([]);
    expect(state.maps).toHaveLength(1);
  });

  it("unlocks in place and fits only when explicitly locking again", () => {
    const { rerender } = renderHook(useActivityLayerManager, {
      initialProps: {
        ...options(),
        lockedFitBoundsPadding: 50,
        fitBoundsPadding: 100,
      },
    });
    const map = state.maps[0];
    const framingCount = map.fitBounds.mock.calls.length;
    rerender({
      ...options(),
      lockedFitBoundsPadding: 50,
      fitBoundsPadding: 100,
      interactive: true,
    });
    expect(map.dragPan.enable).toHaveBeenCalled();
    expect(map.fitBounds).toHaveBeenCalledTimes(framingCount);
    rerender({
      ...options(),
      lockedFitBoundsPadding: 50,
      fitBoundsPadding: 100,
    });
    expect(map.fitBounds).toHaveBeenCalledTimes(framingCount + 1);
    expect(state.maps).toHaveLength(1);
  });

  it("recreates style-dependent resources only for an actual theme change", () => {
    const { rerender } = renderHook(useActivityLayerManager, {
      initialProps: options(),
    });
    const oldMap = state.maps[0];
    state.theme = "dark";
    rerender(options());
    expect(state.maps).toHaveLength(2);
    expect(oldMap.remove).toHaveBeenCalledTimes(1);
    expect(routeCoordinates(state.maps[1])).toEqual([
      [120, 30],
      [120.01, 30.01],
    ]);
    expect(state.maps[1].fitBounds.mock.calls[0][1]).toMatchObject({
      duration: 0,
    });
  });
});
