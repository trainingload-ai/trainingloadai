import { setWorkerUrl } from "maplibre-gl";

let configured = false;

export function configureMapLibreWorker() {
  if (configured) return;
  setWorkerUrl(
    new URL(
      "maplibre-gl/dist/maplibre-gl-worker.mjs",
      import.meta.url,
    ).toString(),
  );
  configured = true;
}
