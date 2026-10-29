import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { StoragePort } from '@/storage/storage.port';

export type ElevationTileCoordinate = { x: number; y: number; z: number };

export interface ElevationTileProvider {
  readonly name: 'none' | 'local-dem' | 'mapbox';
  getTile(coordinate: ElevationTileCoordinate): Promise<Buffer | null>;
}

export type LocalDemManifest = {
  schemaVersion: 1;
  format: 'mapbox-terrain-rgb';
  source: string;
  attribution: string;
  license: string;
};

export function assertTileCoordinate({ x, y, z }: ElevationTileCoordinate) {
  const limit = 2 ** z;
  if (
    !Number.isInteger(z) ||
    z < 0 ||
    z > 22 ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= limit ||
    y >= limit
  ) {
    throw new Error('ELEVATION_TILE_COORDINATE_INVALID');
  }
}

export class NoneElevationTileProvider implements ElevationTileProvider {
  readonly name = 'none' as const;

  async getTile(_coordinate: ElevationTileCoordinate): Promise<null> {
    return null;
  }
}

export class LocalDemElevationTileProvider implements ElevationTileProvider {
  readonly name = 'local-dem' as const;
  private readonly root: string;
  private manifestPromise?: Promise<LocalDemManifest>;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  manifest(): Promise<LocalDemManifest> {
    this.manifestPromise ??= this.readManifest();
    return this.manifestPromise;
  }

  private async readManifest(): Promise<LocalDemManifest> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        await fs.readFile(path.join(this.root, 'source.json'), 'utf8'),
      );
    } catch {
      throw new Error('LOCAL_DEM_SOURCE_MANIFEST_INVALID');
    }
    const value = parsed as Partial<LocalDemManifest>;
    if (
      value.schemaVersion !== 1 ||
      value.format !== 'mapbox-terrain-rgb' ||
      !value.source?.trim() ||
      !value.attribution?.trim() ||
      !value.license?.trim()
    ) {
      throw new Error('LOCAL_DEM_SOURCE_MANIFEST_INVALID');
    }
    return value as LocalDemManifest;
  }

  async getTile(coordinate: ElevationTileCoordinate): Promise<Buffer | null> {
    assertTileCoordinate(coordinate);
    await this.manifest();
    const filePath = path.resolve(
      this.root,
      String(coordinate.z),
      String(coordinate.x),
      `${coordinate.y}.png`,
    );
    if (
      filePath !== this.root &&
      !filePath.startsWith(`${this.root}${path.sep}`)
    ) {
      throw new Error('LOCAL_DEM_PATH_OUTSIDE_ROOT');
    }
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > 16 * 1024 * 1024) {
        throw new Error('LOCAL_DEM_TILE_INVALID');
      }
      return await fs.readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}

export type ElevationTileProviderFactory = (storage: StoragePort) => ElevationTileProvider;
const remoteProviders = new Map<string, ElevationTileProviderFactory>();
let defaultProvider = 'none';
export function registerElevationTileProvider(name: string, factory: ElevationTileProviderFactory, options: { default?: boolean } = {}) {
  if (remoteProviders.has(name)) throw new Error(`Elevation provider already registered: ${name}`);
  remoteProviders.set(name, factory);
  if (options.default) defaultProvider = name;
}
export function defaultElevationTileProvider() { return defaultProvider; }
export function createRegisteredElevationTileProvider(name: string, storage: StoragePort): ElevationTileProvider {
  return remoteProviders.get(name)?.(storage) ?? new NoneElevationTileProvider();
}
