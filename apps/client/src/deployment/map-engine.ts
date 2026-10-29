import "maplibre-gl/dist/maplibre-gl.css";

import { configureMapLibreWorker } from "@/lib/map/maplibre-worker";

export * from "maplibre-gl";

export function configureMapEngine(_config?: { publicToken?: string | null }) {
  configureMapLibreWorker();
}

export function getMapAttributionOptions(
  attribution: false | { customAttribution?: string },
) {
  return { attributionControl: attribution } as const;
}

export function getMapCanvasExportOptions() {
  return {
    canvasContextAttributes: { preserveDrawingBuffer: true },
  } as const;
}
