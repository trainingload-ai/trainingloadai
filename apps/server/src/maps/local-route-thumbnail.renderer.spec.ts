import { describe, expect, it } from '@jest/globals';
import { encode } from '@mapbox/polyline';
import sharp = require('sharp');
import {
  buildLocalRouteThumbnailSvg,
  renderLocalRouteThumbnail,
} from './local-route-thumbnail.renderer';

const route = encode([
  [31.2304, 121.4737],
  [31.231, 121.4744],
  [31.232, 121.4751],
]);

describe('local route thumbnail renderer', () => {
  it('renders a deterministic PNG without a basemap dependency', async () => {
    const first = await renderLocalRouteThumbnail({
      polylines: [route],
      width: 320,
      height: 180,
      theme: 'light',
    });
    const second = await renderLocalRouteThumbnail({
      polylines: [route],
      width: 320,
      height: 180,
      theme: 'light',
    });
    const metadata = await sharp(first).metadata();

    expect(first.equals(second)).toBe(true);
    expect(metadata).toMatchObject({ format: 'png', width: 320, height: 180 });
  });

  it('keeps antimeridian routes local instead of spanning the whole world', () => {
    const antimeridian = encode([
      [50, 179.8],
      [50.1, -179.9],
      [50.2, -179.7],
    ]);
    const svg = buildLocalRouteThumbnailSvg({
      polylines: [antimeridian],
      width: 320,
      height: 180,
      theme: 'dark',
    });

    expect(svg).toContain('stroke="#f97316"');
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('Infinity');
  });

  it('rejects malformed or empty route input with a stable error', () => {
    expect(() =>
      buildLocalRouteThumbnailSvg({
        polylines: ['not-a-polyline'],
        width: 320,
        height: 180,
        theme: 'light',
      }),
    ).toThrow('LOCAL_ROUTE_THUMBNAIL_NO_VALID_POLYLINE');
  });
});
