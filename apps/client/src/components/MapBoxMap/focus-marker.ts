export type MarkerCoordinate = [number, number];

interface FocusMarkerLike<TMap> {
  setLngLat(coordinate: MarkerCoordinate): unknown;
  addTo(map: TMap): unknown;
}

export function attachFocusMarker<
  TMap,
  TMarker extends FocusMarkerLike<TMap>,
>(marker: TMarker, map: TMap, coordinate: MarkerCoordinate): TMarker {
  marker.setLngLat(coordinate);
  marker.addTo(map);
  return marker;
}
