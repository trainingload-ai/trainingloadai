import { createHash } from 'node:crypto';
import { SaxesParser } from 'saxes';

export const ROUTE_LIMITS = {
  bytes: 20 * 1024 * 1024,
  points: 100000,
  segments: 32,
  depth: 64,
} as const;
import type { RouteGeometry, RoutePosition } from '@shared/routes';
export type { RouteGeometry, RoutePosition } from '@shared/routes';
const namespaces = new Set([
  '',
  'http://www.topografix.com/GPX/1/0',
  'http://www.topografix.com/GPX/1/1',
]);
const fail = (code: string): never => {
  throw new Error(code);
};
function number(value: string | undefined) {
  if (
    value == null ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())
  )
    return fail('ROUTE_COORDINATE_INVALID');
  const n = Number(value);
  if (!Number.isFinite(n)) return fail('ROUTE_COORDINATE_INVALID');
  return n;
}
function meters(a: RoutePosition, b: RoutePosition) {
  const r = Math.PI / 180,
    lat = (b[1] - a[1]) * r,
    lon = (b[0] - a[0]) * r;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(lon / 2) ** 2;
  return (
    6371008.8 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}
/** Strict XML parser. Never resolves a DTD, URL, stylesheet, or external entity. */
export function parseRouteGpx(bytes: Buffer) {
  if (!bytes.length || bytes.length > ROUTE_LIMITS.bytes)
    fail('ROUTE_FILE_SIZE_INVALID');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('ROUTE_ENCODING_INVALID');
  }
  const parser = new SaxesParser({ xmlns: true });
  const coordinates: RoutePosition[][] = [],
    stack: string[] = [];
  let ns: string | undefined,
    point: RoutePosition | undefined,
    segment: RoutePosition[] | undefined,
    elevationText = '',
    hasElevation = false,
    count = 0,
    root = false;
  parser.on('error', () => fail('ROUTE_XML_INVALID'));
  parser.on('doctype', () => fail('ROUTE_DTD_UNSUPPORTED'));
  parser.on('processinginstruction', () =>
    fail('ROUTE_PROCESSING_INSTRUCTION_UNSUPPORTED'),
  );
  parser.on('opentag', (tag) => {
    if (!stack.length) {
      if (root || tag.local !== 'gpx' || !namespaces.has(tag.uri))
        fail('ROUTE_GPX_ROOT_INVALID');
      const version = tag.attributes.version?.value;
      if (version !== '1.0' && version !== '1.1')
        fail('ROUTE_GPX_VERSION_UNSUPPORTED');
      root = true;
      ns = tag.uri;
    }
    stack.push(tag.uri === ns ? tag.local : '#extension');
    if (stack.length > ROUTE_LIMITS.depth) fail('ROUTE_XML_DEPTH_LIMIT');
    const path = stack.join('/');
    if (path === 'gpx/trk/trkseg' || path === 'gpx/rte') {
      if (coordinates.length >= ROUTE_LIMITS.segments)
        fail('ROUTE_SEGMENT_LIMIT');
      segment = [];
      coordinates.push(segment);
    }
    if (path === 'gpx/trk/trkseg/trkpt' || path === 'gpx/rte/rtept') {
      if (!segment || ++count > ROUTE_LIMITS.points) fail('ROUTE_POINT_LIMIT');
      const lat = number(tag.attributes.lat?.value),
        lon = number(tag.attributes.lon?.value);
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
        fail('ROUTE_COORDINATE_INVALID');
      point = [lon, lat];
      hasElevation = false;
    }
    if (
      point &&
      (path === 'gpx/trk/trkseg/trkpt/ele' || path === 'gpx/rte/rtept/ele')
    ) {
      if (hasElevation) fail('ROUTE_ELEVATION_DUPLICATE');
      hasElevation = true;
      elevationText = '';
    }
  });
  const content = (value: string) => {
    const path = stack.join('/');
    if (
      point &&
      (path === 'gpx/trk/trkseg/trkpt/ele' || path === 'gpx/rte/rtept/ele')
    ) {
      elevationText += value;
      if (elevationText.length > 128) fail('ROUTE_ELEVATION_INVALID');
    }
  };
  parser.on('text', content);
  parser.on('cdata', content);
  parser.on('closetag', () => {
    const path = stack.join('/');
    if (
      point &&
      (path === 'gpx/trk/trkseg/trkpt/ele' || path === 'gpx/rte/rtept/ele')
    )
      point[2] = number(elevationText);
    if (path === 'gpx/trk/trkseg/trkpt' || path === 'gpx/rte/rtept') {
      if (!point || !segment) fail('ROUTE_XML_INVALID');
      segment!.push(point!);
      point = undefined;
    }
    if (path === 'gpx/trk/trkseg' || path === 'gpx/rte') segment = undefined;
    stack.pop();
  });
  parser.write(text).close();
  if (!root || !coordinates.length || coordinates.some((s) => s.length < 2))
    fail('ROUTE_SEGMENT_TOO_SHORT');
  let distanceMeters = 0,
    elevationGainMeters = 0,
    elevationLossMeters = 0,
    complete = true;
  for (const segment of coordinates) {
    for (let i = 0; i < segment.length; i++) {
      if (segment[i][2] == null) complete = false;
      if (i) {
        distanceMeters += meters(segment[i - 1], segment[i]);
        if (segment[i - 1][2] != null && segment[i][2] != null) {
          const delta = segment[i][2]! - segment[i - 1][2]!;
          if (delta > 0) elevationGainMeters += delta;
          else elevationLossMeters -= delta;
        }
      }
    }
  }
  const geometry: RouteGeometry = { type: 'MultiLineString', coordinates };
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0)
    fail('ROUTE_DISTANCE_INVALID');
  if (
    !Number.isFinite(elevationGainMeters) ||
    !Number.isFinite(elevationLossMeters)
  )
    fail('ROUTE_ELEVATION_INVALID');
  return {
    geometry,
    pointCount: count,
    segmentCount: coordinates.length,
    distanceMeters,
    elevationGainMeters: complete ? elevationGainMeters : null,
    elevationLossMeters: complete ? elevationLossMeters : null,
    hasCompleteElevation: complete,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  };
}
/** Rendering is sampled independently; the immutable source and stored geometry remain intact. */
export function routePreviewGeometry(
  geometry: RouteGeometry,
  limit = 4000,
): RouteGeometry {
  const count = geometry.coordinates.reduce((sum, s) => sum + s.length, 0),
    stride = Math.max(1, Math.ceil(count / Math.max(64, limit)));
  return {
    type: 'MultiLineString',
    coordinates: geometry.coordinates.map((segment) =>
      segment.filter(
        (_point, index) =>
          index === 0 || index === segment.length - 1 || index % stride === 0,
      ),
    ),
  };
}
