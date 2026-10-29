import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  LocalDemElevationTileProvider,
  NoneElevationTileProvider,
} from './elevation-tile.provider';

const tempRoots: string[] = [];

async function tempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'elevation-provider-'));
  tempRoots.push(root);
  return root;
}

async function writeManifest(root: string) {
  await fs.writeFile(
    path.join(root, 'source.json'),
    JSON.stringify({
      schemaVersion: 1,
      format: 'mapbox-terrain-rgb',
      source: 'operator supplied test fixture',
      attribution: 'Test DEM contributors',
      license: 'test-only',
    }),
  );
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('elevation tile providers', () => {
  it('keeps the none provider completely local', async () => {
    await expect(
      new NoneElevationTileProvider().getTile({ x: 0, y: 0, z: 0 }),
    ).resolves.toBeNull();
  });

  it('reads a declared local Terrain-RGB tile and returns null outside coverage', async () => {
    const root = await tempRoot();
    await writeManifest(root);
    await fs.mkdir(path.join(root, '0', '0'), { recursive: true });
    const tile = Buffer.from('terrain-rgb-fixture');
    await fs.writeFile(path.join(root, '0', '0', '0.png'), tile);
    const provider = new LocalDemElevationTileProvider(root);

    await expect(provider.manifest()).resolves.toMatchObject({
      format: 'mapbox-terrain-rgb',
      source: 'operator supplied test fixture',
    });
    await expect(provider.getTile({ x: 0, y: 0, z: 0 })).resolves.toEqual(tile);
    await expect(provider.getTile({ x: 0, y: 0, z: 1 })).resolves.toBeNull();
  });

  it('rejects a local DEM directory without source provenance', async () => {
    const provider = new LocalDemElevationTileProvider(await tempRoot());
    await expect(provider.getTile({ x: 0, y: 0, z: 0 })).rejects.toThrow(
      'LOCAL_DEM_SOURCE_MANIFEST_INVALID',
    );
  });


});
