import { parseRouteGpx, routePreviewGeometry } from '../route-geometry';
const xml = (inside: string) =>
  Buffer.from(
    `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${inside}</gpx>`,
  );
const segment = (lon: number, elevation = true) =>
  `<trkseg><trkpt lat="0" lon="${lon}">${elevation ? '<ele>10</ele>' : ''}</trkpt><trkpt lat="0" lon="${lon + 0.001}">${elevation ? '<ele>15</ele>' : ''}</trkpt></trkseg>`;
describe('provider-neutral route geometry', () => {
  it('keeps segments separate and computes distance/elevation only within them', () => {
    const parsed = parseRouteGpx(
      xml(`<trk>${segment(0)}${segment(100)}</trk>`),
    );
    expect(parsed.segmentCount).toBe(2);
    expect(parsed.distanceMeters).toBeCloseTo(222.39, 1);
    expect(parsed.elevationGainMeters).toBe(10);
    expect(parsed.geometry.coordinates[0][0]).toEqual([0, 0, 10]);
  });
  it('keeps missing elevation absent and handles the antimeridian', () => {
    const parsed = parseRouteGpx(
      xml(
        '<rte><rtept lat="0" lon="179.999"/><rtept lat="0" lon="-179.999"/></rte>',
      ),
    );
    expect(parsed.distanceMeters).toBeCloseTo(222.39, 1);
    expect(parsed.elevationGainMeters).toBeNull();
    expect(parsed.geometry.coordinates[0][0]).toEqual([179.999, 0]);
  });
  it.each([
    Buffer.from(
      '<!DOCTYPE gpx SYSTEM "http://127.0.0.1/"><gpx version="1.1"/>',
    ),
    Buffer.from('<gpx version="1.1"><trk>'),
    xml(
      '<trk><trkseg><trkpt lat="91" lon="0"/><trkpt lat="0" lon="0"/></trkseg></trk>',
    ),
    xml('<trk><trkseg><trkpt lat="" lon="0"/></trkseg></trk>'),
    xml('<trk><trkseg><trkpt lat="0" lon="0"/></trkseg></trk>'),
  ])('rejects active, malformed, invalid or insufficient geometry', (bytes) => {
    expect(() => parseRouteGpx(bytes)).toThrow();
  });
  it('does not treat foreign extension points as route geometry', () => {
    expect(() =>
      parseRouteGpx(
        xml(
          '<extensions xmlns:e="urn:untrusted"><e:trk><e:trkseg><e:trkpt lat="0" lon="0"/><e:trkpt lat="0" lon="1"/></e:trkseg></e:trk></extensions>',
        ),
      ),
    ).toThrow('ROUTE_SEGMENT_TOO_SHORT');
  });
  it('enforces point, segment and XML nesting limits before persistence', () => {
    expect(() =>
      parseRouteGpx(xml('<trk>' + segment(0).repeat(33) + '</trk>')),
    ).toThrow('ROUTE_SEGMENT_LIMIT');
    expect(() =>
      parseRouteGpx(
        xml('<extensions>'.repeat(65) + '</extensions>'.repeat(65)),
      ),
    ).toThrow('ROUTE_XML_DEPTH_LIMIT');
    expect(() =>
      parseRouteGpx(
        xml(
          '<trk><trkseg>' +
            '<trkpt lat="0" lon="0"/>'.repeat(100001) +
            '</trkseg></trk>',
        ),
      ),
    ).toThrow('ROUTE_POINT_LIMIT');
  });
  it('samples each segment without altering source points or joining gaps', () => {
    const g: any = {
      type: 'MultiLineString',
      coordinates: [
        Array.from({ length: 5000 }, (_, i) => [i / 1000, 0]),
        [
          [100, 0],
          [100.1, 0],
        ],
      ],
    };
    const preview = routePreviewGeometry(g);
    expect(g.coordinates[0]).toHaveLength(5000);
    expect(preview.coordinates).toHaveLength(2);
    expect(preview.coordinates[0].at(-1)).toEqual([4.999, 0]);
    expect(preview.coordinates[1]).toEqual([
      [100, 0],
      [100.1, 0],
    ]);
  });
});
