import type { StyleSpecification } from "@deployment/map-engine";
import type {
  RuntimeMapConfiguration,
  RuntimeMapProvider,
} from "@/api/runtime-capabilities";

type MapTheme = "light" | "dark";

export interface MapProvider {
  readonly name: RuntimeMapProvider;
  readonly routeOnly: boolean;
  readonly attributionControl: false | { customAttribution?: string };
  style(theme: MapTheme): StyleSpecification | string;
}

const background = {
  light: "#f5f5f4",
  dark: "#171717",
} as const;

export function routeOnlyStyle(theme: MapTheme): StyleSpecification {
  return {
    version: 8,
    name: `Trainingload route-only ${theme}`,
    sources: {},
    layers: [
      {
        id: "route-only-background",
        type: "background",
        paint: { "background-color": background[theme] },
      },
    ],
  };
}

function rasterStyle(
  config: RuntimeMapConfiguration,
  theme: MapTheme,
): StyleSpecification {
  if (!config.tileUrl) return routeOnlyStyle(theme);
  return {
    version: 8,
    name: `${config.provider} ${theme}`,
    sources: {
      basemap: {
        type: "raster",
        tiles: [config.tileUrl],
        tileSize: 256,
        maxzoom: config.maxZoom,
        ...(config.attribution ? { attribution: config.attribution } : {}),
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        minzoom: 0,
        maxzoom: Math.min(24, config.maxZoom + 1),
      },
    ],
  };
}

function mapboxStyle(
  config: RuntimeMapConfiguration,
  theme: MapTheme,
): string | StyleSpecification {
  if (!config.publicToken) return routeOnlyStyle(theme);
  return (
    config.styleUrl ??
    `mapbox://styles/mapbox/${theme === "dark" ? "dark-v11" : "outdoors-v12"}`
  );
}

export function createMapProvider(
  config: RuntimeMapConfiguration,
): MapProvider {
  if (config.provider === "openfreemap" && config.styleUrl) {
    return {
      name: "openfreemap",
      routeOnly: false,
      // The OpenFreeMap style carries the required OpenMapTiles/OSM source
      // attribution, so MapLibre should render its native attribution entries.
      attributionControl: {},
      style: () => config.styleUrl!,
    };
  }

  if (config.provider === "custom-style" || config.provider === "local") {
    if (config.styleUrl) {
      return {
        name: config.provider,
        routeOnly: false,
        attributionControl: config.attribution
          ? { customAttribution: config.attribution }
          : {},
        style: () => config.styleUrl!,
      };
    }
  }

  if (
    config.provider === "osm-raster" ||
    (config.provider === "custom-raster" && Boolean(config.tileUrl)) ||
    (config.provider === "local" && Boolean(config.tileUrl))
  ) {
    return {
      name: config.provider,
      routeOnly: false,
      attributionControl: {},
      style: (theme) => rasterStyle(config, theme),
    };
  }

  if (config.provider === "mapbox" && config.publicToken) {
    return {
      name: "mapbox",
      routeOnly: false,
      attributionControl: {},
      style: (theme) => mapboxStyle(config, theme),
    };
  }

  return {
    name: config.provider,
    routeOnly: true,
    attributionControl: false,
    style: routeOnlyStyle,
  };
}
