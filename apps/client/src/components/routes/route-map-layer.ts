import { encode } from "@mapbox/polyline";
import type { RouteGeometry } from "@shared/routes";
import type { ActivityLayer } from "@/components/MapBoxMap/hooks/userActivityMapLayerManager";
/** Display-only conversion; each source segment remains a separate line. */
export function savedRouteMapLayer(geometry: RouteGeometry): ActivityLayer {
  const origin = geometry.coordinates[0]?.[0]?.[0] ?? 0;
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  const maps = geometry.coordinates.map((segment, index) => {
    let previous = origin;
    const points = segment.map(([longitude, latitude]) => {
      let lng = longitude;
      while (lng - previous > 180) lng -= 360;
      while (lng - previous < -180) lng += 360;
      previous = lng;
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, latitude);
      north = Math.max(north, latitude);
      return [latitude, lng] as [number, number];
    });
    return { hashId: `saved-route-${index}`, polyline: encode(points) };
  });
  return {
    maps,
    center: [(west + east) / 2, (south + north) / 2],
    bounds: [
      [south, west],
      [north, east],
    ],
  };
}
