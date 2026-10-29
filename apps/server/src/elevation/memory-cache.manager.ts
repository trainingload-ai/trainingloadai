import { Injectable, Logger } from '@nestjs/common';
import { LocalFileCacheManager } from './local-file-cache.manager';

/**
 * 内存缓存管理器
 * 负责管理瓦片数据的内存缓存，包括内存限制、LRU淘汰策略和文件缓存降级
 * TODO: 暂时不用
 */
@Injectable()
export class MemoryCacheManager {
  private readonly logger = new Logger(MemoryCacheManager.name);

  // 内存缓存存储
  private readonly memoryCache = new Map<string, Buffer>();

  // 访问时间记录，用于 LRU 策略
  private readonly accessTimes = new Map<string, number>();

  // 内存使用统计
  private currentMemoryUsage = 0;

  // 配置参数
  private readonly maxMemoryUsage: number; // 最大内存使用量（字节）
  private readonly maxCacheSize: number; // 最大缓存条目数
  private readonly cleanupThreshold: number; // 清理阈值（0.8 表示 80%）

  constructor(private readonly localFileCacheManager: LocalFileCacheManager) {
    // 设置默认配置
    this.maxMemoryUsage = 100 * 1024 * 1024; // 100MB (增加内存限制)
    this.maxCacheSize = 1000; // 1000 个瓦片 (增加缓存条目)
    this.cleanupThreshold = 0.8; // 80% 阈值 (提高清理阈值)

    this.logger.log(`内存缓存管理器初始化完成`);
    this.logger.log(
      `最大内存使用: ${(this.maxMemoryUsage / 1024 / 1024).toFixed(2)}MB`,
    );
    this.logger.log(`最大缓存条目: ${this.maxCacheSize}`);
    this.logger.log(`清理阈值: ${(this.cleanupThreshold * 100).toFixed(0)}%`);
  }

  /**
   * 获取缓存的瓦片数据
   */
  async get(tileKey: string): Promise<Buffer | null> {
    // 检查内存缓存
    if (this.memoryCache.has(tileKey)) {
      // 更新访问时间
      this.accessTimes.set(tileKey, Date.now());
      return this.memoryCache.get(tileKey)!;
    }

    // 内存缓存未命中，尝试从文件缓存获取
    try {
      const fileBuffer = await this.getFromFileCache(tileKey);
      if (fileBuffer) {
        // 将文件缓存的数据加载到内存缓存
        await this.set(tileKey, fileBuffer, false); // false 表示不需要再次写入文件缓存
        this.logger.debug(`文件缓存命中，已加载到内存: ${tileKey}`);
        return fileBuffer;
      }
    } catch (error) {
      this.logger.debug(`文件缓存获取失败: ${tileKey}`, error);
    }

    return null;
  }

  /**
   * 设置缓存数据
   */
  async set(
    tileKey: string,
    data: Buffer,
    writeToFile: boolean = true,
  ): Promise<void> {
    // 检查是否需要清理内存
    await this.checkAndCleanup();

    // 如果已存在，先移除旧数据
    if (this.memoryCache.has(tileKey)) {
      const oldData = this.memoryCache.get(tileKey)!;
      this.currentMemoryUsage -= oldData.length;
    }

    // 添加到内存缓存
    this.memoryCache.set(tileKey, data);
    this.accessTimes.set(tileKey, Date.now());
    this.currentMemoryUsage += data.length;

    this.logger.debug(
      `瓦片已缓存到内存: ${tileKey}, 大小: ${data.length} bytes, 当前内存使用: ${(this.currentMemoryUsage / 1024 / 1024).toFixed(2)}MB`,
    );

    // 写入文件缓存
    if (writeToFile) {
      try {
        await this.writeToFileCache(tileKey, data);
        this.logger.debug(`瓦片已缓存到文件: ${tileKey}`);
      } catch (error) {
        this.logger.warn(`文件缓存写入失败: ${tileKey}`, error);
      }
    }
  }

  /**
   * 删除特定缓存
   */
  delete(tileKey: string): void {
    if (this.memoryCache.has(tileKey)) {
      const data = this.memoryCache.get(tileKey)!;
      this.currentMemoryUsage -= data.length;
      this.memoryCache.delete(tileKey);
      this.accessTimes.delete(tileKey);
      this.logger.debug(`已删除内存缓存: ${tileKey}`);
    }
  }

  /**
   * 清空所有内存缓存
   */
  clear(): void {
    const cacheSize = this.memoryCache.size;
    const memoryUsage = this.currentMemoryUsage;

    this.memoryCache.clear();
    this.accessTimes.clear();
    this.currentMemoryUsage = 0;

    this.logger.log(
      `已清空所有内存缓存: ${cacheSize} 个瓦片, ${(memoryUsage / 1024 / 1024).toFixed(2)}MB`,
    );
  }

  /**
   * 检查并执行清理
   */
  private async checkAndCleanup(): Promise<void> {
    const memoryThreshold = this.maxMemoryUsage * this.cleanupThreshold;
    const sizeThreshold = this.maxCacheSize * this.cleanupThreshold;

    if (
      this.currentMemoryUsage > memoryThreshold ||
      this.memoryCache.size > sizeThreshold
    ) {
      this.logger.log(
        `清理条件触发，当前内存使用: ${(this.currentMemoryUsage / 1024 / 1024).toFixed(2)}MB, 缓存条目数: ${this.memoryCache.size}`,
      );
      await this.performCleanup();
    }
  }

  /**
   * 执行 LRU 清理
   */
  private async performCleanup(): Promise<void> {
    const startTime = Date.now();
    const initialSize = this.memoryCache.size;
    const initialMemory = this.currentMemoryUsage;

    // 获取所有缓存项并按访问时间排序
    const entries = Array.from(this.accessTimes.entries()).sort(
      (a, b) => a[1] - b[1],
    ); // 按访问时间升序排序，最久未访问的在前

    // 计算需要清理的数量
    const targetMemory = this.maxMemoryUsage * 0.7; // 清理到 70% (降低清理目标)
    const targetSize = Math.floor(this.maxCacheSize * 0.7);

    let cleanedCount = 0;
    let cleanedMemory = 0;

    for (const [tileKey, _] of entries) {
      if (
        this.currentMemoryUsage <= targetMemory &&
        this.memoryCache.size <= targetSize
      ) {
        break;
      }

      const data = this.memoryCache.get(tileKey);
      if (data) {
        // 将数据下放到文件缓存（如果还没有的话）
        try {
          await this.writeToFileCache(tileKey, data);
        } catch (error) {
          this.logger.warn(`清理时文件缓存写入失败: ${tileKey}`, error);
        }

        // 从内存中删除
        this.currentMemoryUsage -= data.length;
        cleanedMemory += data.length;
        this.memoryCache.delete(tileKey);
        this.accessTimes.delete(tileKey);
        cleanedCount++;
      }
    }

    const duration = Date.now() - startTime;
    this.logger.log(
      `内存清理完成: 清理 ${cleanedCount} 个瓦片, 释放 ${(cleanedMemory / 1024 / 1024).toFixed(2)}MB, 耗时 ${duration}ms`,
    );
    this.logger.log(
      `清理前: ${initialSize} 个瓦片, ${(initialMemory / 1024 / 1024).toFixed(2)}MB`,
    );
    this.logger.log(
      `清理后: ${this.memoryCache.size} 个瓦片, ${(this.currentMemoryUsage / 1024 / 1024).toFixed(2)}MB`,
    );
  }

  /**
   * 从本地文件缓存获取数据
   */
  private async getFromFileCache(tileKey: string): Promise<Buffer | null> {
    return await this.localFileCacheManager.get(tileKey);
  }

  /**
   * 写入本地文件缓存
   */
  private async writeToFileCache(tileKey: string, data: Buffer): Promise<void> {
    await this.localFileCacheManager.set(tileKey, data);
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    memory: {
      usage: number;
      cacheSize: number;
      maxMemoryUsage: number;
      maxCacheSize: number;
      cleanupThreshold: number;
      usagePercentage: number;
    };
    localFile: {
      fileCount: number;
      totalSize: number;
      maxCacheSize: number;
      maxFileCount: number;
      usagePercentage: number;
    };
  }> {
    const localFileStats = await this.localFileCacheManager.getCacheStats();

    return {
      memory: {
        usage: this.currentMemoryUsage,
        cacheSize: this.memoryCache.size,
        maxMemoryUsage: this.maxMemoryUsage,
        maxCacheSize: this.maxCacheSize,
        cleanupThreshold: this.cleanupThreshold,
        usagePercentage: (this.currentMemoryUsage / this.maxMemoryUsage) * 100,
      },
      localFile: localFileStats,
    };
  }
}
