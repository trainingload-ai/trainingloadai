import { decode } from "@mapbox/polyline";

export type RouteCoordinate = [number, number];
export type RouteDistance = (
  from: RouteCoordinate,
  to: RouteCoordinate,
) => number;

const EARTH_RADIUS_M = 6_371_000;

export function geographicDistanceMeters(
  from: RouteCoordinate,
  to: RouteCoordinate,
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to[1] - from[1]);
  const longitudeDelta = toRadians(to[0] - from[0]);
  const fromLatitude = toRadians(from[1]);
  const toLatitude = toRadians(to[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(haversine));
}

export function decodeActivityTracks(
  maps: Array<{ polyline: string }>,
): RouteCoordinate[][] {
  return maps.map((track) =>
    decode(track.polyline).map(
      ([latitude, longitude]) => [longitude, latitude] as RouteCoordinate,
    ),
  );
}

function interpolateCoordinate(
  from: RouteCoordinate,
  to: RouteCoordinate,
  ratio: number,
): RouteCoordinate {
  return [
    from[0] + (to[0] - from[0]) * ratio,
    from[1] + (to[1] - from[1]) * ratio,
  ];
}

function appendCoordinate(
  coordinates: RouteCoordinate[],
  coordinate: RouteCoordinate,
) {
  const previous = coordinates.at(-1);
  if (
    !previous ||
    previous[0] !== coordinate[0] ||
    previous[1] !== coordinate[1]
  ) {
    coordinates.push(coordinate);
  }
}

export function coordinateAtRouteDistance(
  tracks: RouteCoordinate[][],
  targetDistanceM: number,
  distanceBetween: RouteDistance = geographicDistanceMeters,
): RouteCoordinate | null {
  const first = tracks.find((track) => track.length)?.[0];
  if (!first) return null;
  if (targetDistanceM <= 0) return first;

  let accumulatedDistanceM = 0;
  let lastCoordinate = first;
  for (const track of tracks) {
    if (!track.length) continue;
    lastCoordinate = track.at(-1) ?? lastCoordinate;
    for (let index = 0; index < track.length - 1; index += 1) {
      const from = track[index];
      const to = track[index + 1];
      const segmentDistanceM = distanceBetween(from, to);
      if (
        segmentDistanceM > 0 &&
        accumulatedDistanceM + segmentDistanceM >= targetDistanceM
      ) {
        return interpolateCoordinate(
          from,
          to,
          (targetDistanceM - accumulatedDistanceM) / segmentDistanceM,
        );
      }
      accumulatedDistanceM += segmentDistanceM;
    }
  }
  return lastCoordinate;
}

export function sliceRouteByDistance(
  tracks: RouteCoordinate[][],
  startDistanceM: number,
  endDistanceM: number,
  distanceBetween: RouteDistance = geographicDistanceMeters,
): RouteCoordinate[][] {
  const rangeStartM = Math.max(0, Math.min(startDistanceM, endDistanceM));
  const rangeEndM = Math.max(startDistanceM, endDistanceM);
  if (!Number.isFinite(rangeStartM) || !Number.isFinite(rangeEndM)) return [];
  if (rangeEndM <= rangeStartM) return [];

  let accumulatedDistanceM = 0;
  const focusedTracks: RouteCoordinate[][] = [];

  for (const track of tracks) {
    const focusedCoordinates: RouteCoordinate[] = [];
    for (let index = 0; index < track.length - 1; index += 1) {
      const from = track[index];
      const to = track[index + 1];
      const segmentDistanceM = distanceBetween(from, to);
      if (segmentDistanceM <= 0) continue;

      const segmentStartM = accumulatedDistanceM;
      const segmentEndM = accumulatedDistanceM + segmentDistanceM;
      const overlapStartM = Math.max(rangeStartM, segmentStartM);
      const overlapEndM = Math.min(rangeEndM, segmentEndM);

      if (overlapEndM >= overlapStartM) {
        appendCoordinate(
          focusedCoordinates,
          interpolateCoordinate(
            from,
            to,
            (overlapStartM - segmentStartM) / segmentDistanceM,
          ),
        );
        appendCoordinate(
          focusedCoordinates,
          interpolateCoordinate(
            from,
            to,
            (overlapEndM - segmentStartM) / segmentDistanceM,
          ),
        );
      }

      accumulatedDistanceM = segmentEndM;
      if (accumulatedDistanceM >= rangeEndM) break;
    }
    if (focusedCoordinates.length >= 2) {
      focusedTracks.push(focusedCoordinates);
    }
    if (accumulatedDistanceM >= rangeEndM) break;
  }

  return focusedTracks;
}
