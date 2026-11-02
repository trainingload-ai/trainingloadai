/** Outdoor sports already defined by the common SportDefinition catalog. */
export const ROUTE_SPORT_CODES = [
  "ROAD_RUNNING",
  "TRAIL_RUNNING",
  "ROAD_CYCLING",
  "GRAVEL_CYCLING",
  "MOUNTAIN_BIKING",
  "HIKING",
  "WALKING",
] as const;
export type RouteSportCode = (typeof ROUTE_SPORT_CODES)[number];
export type RoutePosition = [
  longitude: number,
  latitude: number,
  elevation?: number,
];
export type RouteGeometry = {
  type: "MultiLineString";
  coordinates: RoutePosition[][];
};
export type RouteDeliveryState =
  | "PENDING"
  | "ACCEPTED"
  | "VERIFIED"
  | "UNKNOWN"
  | "REJECTED"
  | "REMOTE_DELETED";
export type SavedRouteSummary = {
  id: string;
  name: string;
  sportCode: RouteSportCode;
  revision: number;
  distanceMeters: number;
  elevationGainMeters: number | null;
  pointCount: number;
  segmentCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type SavedRouteDetail = SavedRouteSummary & {
  routeId: string;
  versionId: string;
  description: string;
  checksum: string;
  rawChecksum: string;
  rawSize: number;
  geometry: RouteGeometry;
  elevationLossMeters: number | null;
  hasCompleteElevation: boolean;
  deliveries: {
    id: string;
    provider: string;
    state: RouteDeliveryState;
    versionId: string | null;
    updatedAt: string;
  }[];
};
