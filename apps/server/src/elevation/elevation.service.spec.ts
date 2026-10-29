import { afterEach, describe, expect, it } from '@jest/globals';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp = require('sharp');
import type { ActivityRecordType } from 'trackswap';
import { ElevationService } from './elevation.service';

const tempRoots: string[] = [];

function config(values: Record<string, unknown>) {
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('ElevationService provider degradation', () => {
  it('preserves original samples when elevation is disabled', async () => {
    const service = new ElevationService(
      config({
        'elevation.provider': 'none',
        'elevation.tileZoom': 0,
      }) as never,
      {} as never,
    );
    const input = [
      { positionLat: 0, positionLong: 0, altitude: 42 },
    ] as ActivityRecordType[];

    const result = await service.getBatchElevation(input);

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });

  it('reads enhanced altitude from an operator supplied local DEM tile', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'elevation-service-'));
    tempRoots.push(root);
    await fs.writeFile(
      path.join(root, 'source.json'),
      JSON.stringify({
        schemaVersion: 1,
        format: 'mapbox-terrain-rgb',
        source: 'fixture',
        attribution: 'Fixture contributors',
        license: 'test-only',
      }),
    );
    await fs.mkdir(path.join(root, '0', '0'), { recursive: true });
    const encoded = Math.round((123.4 + 10_000) * 10);
    const red = Math.floor(encoded / 65_536);
    const green = Math.floor((encoded % 65_536) / 256);
    const blue = encoded % 256;
    const tile = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: red, g: green, b: blue },
      },
    })
      .png()
      .toBuffer();
    await fs.writeFile(path.join(root, '0', '0', '0.png'), tile);
    const service = new ElevationService(
      config({
        'elevation.provider': 'local-dem',
        'elevation.dataPath': root,
        'elevation.tileZoom': 0,
      }) as never,
      {} as never,
    );

    const [result] = await service.getBatchElevation([
      { positionLat: 0, positionLong: 0, altitude: 10 } as ActivityRecordType,
    ]);

    expect(result?.altitude).toBe(10);
    expect(result?.enhancedAltitude).toBe(123.4);
  });

  it('preserves samples when local coverage is missing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'elevation-service-'));
    tempRoots.push(root);
    await fs.writeFile(
      path.join(root, 'source.json'),
      JSON.stringify({
        schemaVersion: 1,
        format: 'mapbox-terrain-rgb',
        source: 'fixture',
        attribution: 'Fixture contributors',
        license: 'test-only',
      }),
    );
    const service = new ElevationService(
      config({
        'elevation.provider': 'local-dem',
        'elevation.dataPath': root,
        'elevation.tileZoom': 0,
      }) as never,
      {} as never,
    );
    const input = [
      { positionLat: 0, positionLong: 0, altitude: 10 },
    ] as ActivityRecordType[];

    await expect(service.getBatchElevation(input)).resolves.toEqual(input);
  });
});
