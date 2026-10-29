import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { ActivityRecordType } from 'trackswap';
import { loadSharp } from '@/runtime/sharp-runtime';
import {
  type ElevationTileProvider,
  LocalDemElevationTileProvider,
  createRegisteredElevationTileProvider,
  defaultElevationTileProvider,
} from './elevation-tile.provider';

export type CoordinatePoint = Pick<
  ActivityRecordType,
  'positionLat' | 'positionLong' | 'altitude'
> & {
  positionLat?: number;
  positionLong?: number;
  altitude?: number;
};

export interface ElevationResult {
  success: boolean;
  altitude?: number;
  error?: string;
}

export interface BatchElevationResult {
  success: boolean;
  results?: CoordinatePoint[];
  error?: string;
}

export interface RouteElevationResult {
  success: boolean;
  elevationProfile?: CoordinatePoint[];
  totalAscent?: number;
  totalDescent?: number;
  minElevation?: number;
  maxElevation?: number;
  error?: string;
}

@Injectable()
export class ElevationService {
  private readonly logger = new Logger(ElevationService.name);
  private readonly provider: ElevationTileProvider;
  private readonly tileZoom: number;
  private providerFailureLogged = false;

  constructor(
    private readonly configService: ConfigService,
    @Inject(STORAGE_PORT) private readonly storageService: StoragePort,
  ) {
    const providerName =
      this.configService
        .get<string>('elevation.provider')
        ?.trim()
        .toLowerCase() ||
      this.configService
        .get<string>('ELEVATION_PROVIDER')
        ?.trim()
        .toLowerCase() ||
      defaultElevationTileProvider();
    this.tileZoom =
      this.configService.get<number>('elevation.tileZoom') ??
      this.configService.get<number>('ELEVATION_TILE_ZOOM', 13);
    this.provider =
      providerName === 'local-dem'
        ? new LocalDemElevationTileProvider(
            this.configService.get<string>('ELEVATION_DATA_PATH') ||
              this.configService.get<string>('elevation.dataPath') ||
              '/data/elevation',
          )
        : createRegisteredElevationTileProvider(providerName, this.storageService);
  }

  /**
   * 获取单个坐标点的海拔
   */
  async getElevation(
    positionLat: number,
    positionLong: number,
  ): Promise<ElevationResult> {
    const startTime = Date.now();

    try {
      if (this.provider.name === 'none') {
        return { success: false, error: 'Elevation provider disabled' };
      }

      const { x, y, z } = this.getTileCoordinates(
        positionLat,
        positionLong,
        this.tileZoom,
      );

      // 检查瓦片坐标的有效性
      if (
        isNaN(x) ||
        isNaN(y) ||
        z === undefined ||
        z === null ||
        x < 0 ||
        y < 0
      ) {
        this.logger.error(`无效的瓦片坐标: x=${x}, y=${y}, z=${z}`);
        return { success: false, error: 'Invalid tile coordinates' };
      }

      const tileBuffer = await this.provider.getTile({ x, y, z });
      if (!tileBuffer) {
        return { success: false, error: 'Elevation tile unavailable' };
      }

      // 海拔
      const elevation = await this.extractElevationFromTile(
        tileBuffer,
        positionLat,
        positionLong,
        x,
        y,
        z,
      );

      return { success: true, altitude: elevation };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[getElevation] 获取海拔失败，坐标=(${positionLat}, ${positionLong})，耗时=${duration}ms：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * 批量获取坐标点的海拔
   */
  async getBatchElevation(
    coordinates: ActivityRecordType[],
  ): Promise<ActivityRecordType[]> {
    if (coordinates?.length == 0) {
      return [];
    }
    if (this.provider.name === 'none') {
      return coordinates.map((coordinate) => ({ ...coordinate }));
    }

    const startTime = Date.now();
    try {
      // 先复制一份结果数组，保证顺序与输入一致
      const results: ActivityRecordType[] = coordinates.map((coord) => ({
        ...coord,
      }));

      // 收集所有需要的瓦片键，按瓦片去重，并记录每个瓦片对应的坐标点
      const tileMap = new Map<
        string,
        {
          x: number;
          y: number;
          z: number;
          points: { index: number; coord: ActivityRecordType }[];
        }
      >();

      coordinates.forEach((coord, index) => {
        const { x, y, z } = this.getTileCoordinates(
          coord.positionLat,
          coord.positionLong,
          this.tileZoom,
        );

        // 检查瓦片坐标的有效性
        if (
          isNaN(x) ||
          isNaN(y) ||
          z === undefined ||
          z === null ||
          x < 0 ||
          y < 0
        ) {
          this.logger.error(`无效的瓦片坐标: x=${x}, y=${y}, z=${z}`);
          return;
        }

        const tileKey = `elevation/tiles/${z}/${x}/${y}.png`;
        let entry = tileMap.get(tileKey);
        if (!entry) {
          entry = { x, y, z, points: [] };
          tileMap.set(tileKey, entry);
        }
        entry.points.push({ index, coord });
      });

      // 按瓦片批量获取/下载并缓存，然后在该瓦片上提取所有坐标点的海拔
      for (const [_tileKey, { x, y, z, points }] of tileMap.entries()) {
        let tileBuffer: Buffer | null;
        try {
          tileBuffer = await this.provider.getTile({ x, y, z });
        } catch (error) {
          if (!this.providerFailureLogged) {
            this.providerFailureLogged = true;
            this.logger.warn(
              `[getBatchElevation] elevation provider unavailable provider=${this.provider.name} error=${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          continue;
        }
        if (!tileBuffer) continue;

        for (const { index, coord } of points) {
          try {
            const elevation = await this.extractElevationFromTile(
              tileBuffer,
              coord.positionLat,
              coord.positionLong,
              x,
              y,
              z,
            );
            results[index] = {
              ...results[index],
              enhancedAltitude: elevation,
            };
          } catch (error) {
            this.logger.error(
              `[getBatchElevation] 批量从瓦片提取海拔失败: 坐标(${coord.positionLat}, ${
                coord.positionLong
              }), 瓦片 ${z}/${x}/${y}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `批量海拔获取完成: ${coordinates.length} 个坐标点, 使用瓦片数: ${tileMap.size}, 耗时: ${duration}ms`,
      );

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[getBatchElevation] 批量获取海拔失败，耗时=${duration}ms：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return coordinates.map((coordinate) => ({ ...coordinate }));
    }
  }

  /**
   * 获取路线的海拔剖面
   */
  async getRouteElevation(
    coordinates: ActivityRecordType[],
  ): Promise<RouteElevationResult> {
    const startTime = Date.now();

    try {
      const batchResult = await this.getBatchElevation(coordinates);

      if (!batchResult.length) {
        return { success: false, error: '批量海拔获取失败' };
      }

      const elevationProfile = batchResult;
      const elevations = elevationProfile
        .map((point) => point.enhancedAltitude ?? point.altitude)
        .filter((value): value is number => Number.isFinite(value));
      if (elevations.length === 0) {
        return { success: false, error: 'No elevation samples available' };
      }

      // 计算统计信息
      const minElevation = Math.min(...elevations);
      const maxElevation = Math.max(...elevations);

      let totalAscent = 0;
      let totalDescent = 0;

      for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i] - elevations[i - 1];
        if (diff > 0) {
          totalAscent += diff;
        } else {
          totalDescent += Math.abs(diff);
        }
      }

      this.logger.log(`路线海拔剖面获取成功: ${coordinates.length} 个坐标点`);

      return {
        success: true,
        elevationProfile,
        totalAscent,
        totalDescent,
        minElevation,
        maxElevation,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[getRouteElevation] 获取路线海拔剖面失败，耗时=${duration}ms：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取瓦片坐标
   */
  private getTileCoordinates(
    positionLat: number,
    positionLong: number,
    zoom: number,
  ) {
    if (
      !Number.isFinite(positionLat) ||
      !Number.isFinite(positionLong) ||
      positionLat < -90 ||
      positionLat > 90 ||
      positionLong < -180 ||
      positionLong > 180
    ) {
      return { x: Number.NaN, y: Number.NaN, z: zoom };
    }
    const latitude = Math.max(-85.05112878, Math.min(85.05112878, positionLat));
    const longitude = positionLong === 180 ? 180 - 1e-10 : positionLong;
    const latRad = (latitude * Math.PI) / 180;
    const n = Math.pow(2, zoom);
    const x = Math.floor(((longitude + 180) / 360) * n);
    const y = Math.floor(
      ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n,
    );
    return { x, y, z: zoom };
  }

  /**
   * 从瓦片提取海拔数据
   */
  private async extractElevationFromTile(
    tileBuffer: Buffer,
    lat: number,
    lng: number,
    tileX: number,
    tileY: number,
    zoom: number,
  ): Promise<number> {
    try {
      const sharp = await loadSharp();
      const image = sharp(tileBuffer);
      const { data, info } = await image
        .raw()
        .toBuffer({ resolveWithObject: true });

      // 计算像素位置
      const n = Math.pow(2, zoom);
      const latRad = (lat * Math.PI) / 180;

      const worldX = ((lng + 180) / 360) * n;
      const worldY = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;

      const pixelX = Math.floor((worldX - tileX) * info.width);
      const pixelY = Math.floor((worldY - tileY) * info.height);

      // 确保像素坐标在有效范围内
      const clampedX = Math.max(0, Math.min(info.width - 1, pixelX));
      const clampedY = Math.max(0, Math.min(info.height - 1, pixelY));

      // 提取 RGB 值
      const pixelIndex = (clampedY * info.width + clampedX) * info.channels;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];

      // 根据 Mapbox Terrain-RGB 格式计算海拔
      if (r === undefined || g === undefined || b === undefined) {
        throw new Error('Terrain-RGB tile has no RGB channels');
      }
      const elevation = -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
      const roundedElevation = Math.round(elevation * 10) / 10; // 保留一位小数

      return roundedElevation;
    } catch (error) {
      this.logger.error(
        `[extractElevationFromTile] 提取海拔失败，坐标=(${lat}, ${lng})：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * 清理过期的瓦片缓存
   */
  async cleanExpiredCache(): Promise<{ deletedFiles: number }> {
    const startTime = Date.now();
    this.logger.log('开始清理过期的瓦片缓存');

    try {
      // 这里可以根据需要实现清理逻辑
      // 由于 StorageService 可能没有直接的过期检查，我们可以：
      // 1. 定期清理所有 elevation/tiles/ 下的文件
      // 2. 或者在存储服务中添加过期时间支持

      const duration = Date.now() - startTime;
      this.logger.log(`缓存清理完成，耗时: ${duration}ms`);
      return { deletedFiles: 0 };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[cleanExpiredCache] 清理缓存失败，耗时=${duration}ms：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { deletedFiles: 0 };
    }
  }
}
