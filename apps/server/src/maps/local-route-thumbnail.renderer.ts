import { decode } from '@mapbox/polyline';
import { normalizeActivityPolylines } from '@/utils/activity-polyline.util';
import { loadSharp } from '@/runtime/sharp-runtime';

export type RouteThumbnailTheme = 'light' | 'dark';

type Point = { x: number; y: number };

const MAX_RENDER_POINTS = 4_000;
const MERCATOR_LAT_LIMIT = 85.05112878;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mercatorY(latitude: number): number {
  const lat =
    (clamp(latitude, -MERCATOR_LAT_LIMIT, MERCATOR_LAT_LIMIT) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}

function unwrapLongitudes(
  coordinates: Array<[number, number]>,
): Array<[number, number]> {
  if (coordinates.length < 2) return coordinates;
  const result: Array<[number, number]> = [coordinates[0]!];
  let previous = coordinates[0]![1];
  for (let index = 1; index < coordinates.length; index += 1) {
    const [latitude, rawLongitude] = coordinates[index]!;
    let longitude = rawLongitude;
    while (longitude - previous > 180) longitude -= 360;
    while (longitude - previous < -180) longitude += 360;
    result.push([latitude, longitude]);
    previous = longitude;
  }
  return result;
}

function sample<T>(values: T[], stride: number): T[] {
  if (stride <= 1 || values.length <= 2) return values;
  const result = [values[0]!];
  for (let index = stride; index < values.length - 1; index += stride) {
    result.push(values[index]!);
  }
  result.push(values.at(-1)!);
  return result;
}

function decodeSegments(value: unknown): Array<Array<[number, number]>> {
  const encoded = normalizeActivityPolylines(value);
  const decoded = encoded
    .map((polyline) => {
      try {
        return unwrapLongitudes(
          decode(polyline).filter(
            ([latitude, longitude]) =>
              Number.isFinite(latitude) &&
              Number.isFinite(longitude) &&
              latitude >= -90 &&
              latitude <= 90 &&
              longitude >= -180 &&
              longitude <= 180,
          ),
        );
      } catch {
        return [];
      }
    })
    .filter((segment) => segment.length >= 2);
  const pointCount = decoded.reduce(
    (total, segment) => total + segment.length,
    0,
  );
  const stride = Math.max(1, Math.ceil(pointCount / MAX_RENDER_POINTS));
  return decoded.map((segment) => sample(segment, stride));
}

function svgNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function buildLocalRouteThumbnailSvg(args: {
  polylines: unknown;
  width: number;
  height: number;
  theme: RouteThumbnailTheme;
  routeColor?: string;
}): string {
  const width = clamp(Math.floor(args.width), 64, 2_048);
  const height = clamp(Math.floor(args.height), 64, 2_048);
  const segments = decodeSegments(args.polylines);
  if (segments.length === 0) {
    throw new Error('LOCAL_ROUTE_THUMBNAIL_NO_VALID_POLYLINE');
  }

  const projected = segments.map((segment) =>
    segment.map(([latitude, longitude]) => ({
      x: (longitude * Math.PI) / 180,
      y: -mercatorY(latitude),
    })),
  );
  const points = projected.flat();
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const padding = Math.max(14, Math.min(width, height) * 0.1);
  const drawableWidth = Math.max(1, width - padding * 2);
  const drawableHeight = Math.max(1, height - padding * 2);
  const rangeX = Math.max(maxX - minX, 1e-8);
  const rangeY = Math.max(maxY - minY, 1e-8);
  const scale = Math.min(drawableWidth / rangeX, drawableHeight / rangeY);
  const renderedWidth = rangeX * scale;
  const renderedHeight = rangeY * scale;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;
  const toCanvas = (point: Point): Point => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
  });
  const canvasSegments = projected.map((segment) => segment.map(toCanvas));
  const routeColor = args.routeColor ?? '#f97316';
  const palette =
    args.theme === 'dark'
      ? { background: '#171717', casing: '#0a0a0a', start: '#fafafa' }
      : { background: '#f5f5f4', casing: '#ffffff', start: '#ffffff' };
  const strokeWidth = clamp(Math.min(width, height) * 0.035, 3, 9);
  const paths = canvasSegments
    .map(
      (segment) =>
        `<path d="${segment
          .map(
            (point, index) =>
              `${index === 0 ? 'M' : 'L'}${svgNumber(point.x)} ${svgNumber(point.y)}`,
          )
          .join(' ')}"/>`,
    )
    .join('');
  const first = canvasSegments[0]![0]!;
  const lastSegment = canvasSegments.at(-1)!;
  const last = lastSegment.at(-1)!;
  const radius = clamp(strokeWidth * 0.9, 4, 8);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${palette.background}"/>
  <g fill="none" stroke="${palette.casing}" stroke-width="${svgNumber(strokeWidth + 3)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
  <g fill="none" stroke="${routeColor}" stroke-width="${svgNumber(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
  <circle cx="${svgNumber(first.x)}" cy="${svgNumber(first.y)}" r="${svgNumber(radius)}" fill="${palette.start}" stroke="${routeColor}" stroke-width="2"/>
  <circle cx="${svgNumber(last.x)}" cy="${svgNumber(last.y)}" r="${svgNumber(radius)}" fill="${routeColor}" stroke="${palette.casing}" stroke-width="2"/>
</svg>`;
}

export async function renderLocalRouteThumbnail(args: {
  polylines: unknown;
  width: number;
  height: number;
  theme: RouteThumbnailTheme;
  routeColor?: string;
}): Promise<Buffer> {
  const svg = buildLocalRouteThumbnailSvg(args);
  const sharp = await loadSharp();
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
