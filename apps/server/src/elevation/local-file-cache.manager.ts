import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 本地文件缓存管理器
 * 负责管理磁盘上的瓦片缓存文件
 */
@Injectable()
export class LocalFileCacheManager {
  private readonly logger = new Logger(LocalFileCacheManager.name);
  private readonly cacheDir: string;
  private readonly maxCacheSize: number; // 最大缓存大小（字节）
  private readonly maxFileCount: number; // 最大文件数量
  private readonly cleanupThreshold: number; // 清理阈值

  constructor() {
    // 设置缓存目录
    this.cacheDir = path.join(os.tmpdir(), 'starshards-elevation-cache');

    // 配置参数
    this.maxCacheSize = 500 * 1024 * 1024; // 500MB
    this.maxFileCount = 5000; // 5000 个文件
    this.cleanupThreshold = 0.8; // 80% 阈值

    this.initializeCacheDir();
  }

  /**
   * 初始化缓存目录
   */
  private async initializeCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      this.logger.log(`本地文件缓存目录初始化完成: ${this.cacheDir}`);
      this.logger.log(
        `最大缓存大小: ${(this.maxCacheSize / 1024 / 1024).toFixed(2)}MB`,
      );
      this.logger.log(`最大文件数量: ${this.maxFileCount}`);
    } catch (error) {
      this.logger.error('初始化缓存目录失败:', error);
    }
  }

  /**
   * 获取缓存文件路径
   */
  private getCacheFilePath(tileKey: string): string {
    // 将瓦片键转换为安全的文件路径
    const safeKey = tileKey.replace(/[/\\:*?"<>|]/g, '_');
    return path.join(this.cacheDir, `${safeKey}.png`);
  }

  /**
   * 从本地文件缓存获取瓦片
   */
  async get(tileKey: string): Promise<Buffer | null> {
    try {
      const filePath = this.getCacheFilePath(tileKey);
      const data = await fs.readFile(filePath);

      // 更新文件访问时间
      await fs.utimes(filePath, new Date(), new Date());

      this.logger.debug(`本地文件缓存命中: ${tileKey}`);
      return data;
    } catch (error) {
      // 文件不存在或读取失败
      return null;
    }
  }

  /**
   * 将瓦片保存到本地文件缓存
   */
  async set(tileKey: string, data: Buffer): Promise<void> {
    try {
      const filePath = this.getCacheFilePath(tileKey);
      await fs.writeFile(filePath, data);

      this.logger.debug(`瓦片已保存到本地文件缓存: ${tileKey}`);

      // 检查是否需要清理
      await this.checkAndCleanup();
    } catch (error) {
      this.logger.error(`保存瓦片到本地文件缓存失败: ${tileKey}`, error);
    }
  }

  /**
   * 删除特定瓦片的缓存文件
   */
  async delete(tileKey: string): Promise<void> {
    try {
      const filePath = this.getCacheFilePath(tileKey);
      await fs.unlink(filePath);
      this.logger.debug(`已删除本地缓存文件: ${tileKey}`);
    } catch (error) {
      // 文件可能不存在，忽略错误
    }
  }

  /**
   * 清空所有本地缓存文件
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);
      const deletePromises = files.map((file) =>
        fs.unlink(path.join(this.cacheDir, file)).catch(() => {}),
      );

      await Promise.all(deletePromises);
      this.logger.log(`已清空本地文件缓存，删除了 ${files.length} 个文件`);
    } catch (error) {
      this.logger.error('清空本地文件缓存失败:', error);
    }
  }

  /**
   * 检查并执行清理
   */
  private async checkAndCleanup(): Promise<void> {
    try {
      const stats = await this.getCacheStats();

      // 检查是否超过阈值
      const sizeThresholdReached =
        stats.totalSize > this.maxCacheSize * this.cleanupThreshold;
      const countThresholdReached =
        stats.fileCount > this.maxFileCount * this.cleanupThreshold;

      if (sizeThresholdReached || countThresholdReached) {
        await this.performCleanup();
      }
    } catch (error) {
      this.logger.error('检查缓存状态失败:', error);
    }
  }

  /**
   * 执行清理操作
   */
  private async performCleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);

      // 获取文件信息并按访问时间排序
      const fileInfos = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(this.cacheDir, file);
          try {
            const stat = await fs.stat(filePath);
            return {
              path: filePath,
              name: file,
              size: stat.size,
              atime: stat.atime.getTime(),
            };
          } catch {
            return null;
          }
        }),
      );

      // 过滤掉无效文件并按访问时间排序（最久未访问的在前）
      const validFiles = fileInfos
        .filter((info) => info !== null)
        .sort((a, b) => a.atime - b.atime);

      // 计算需要删除的文件数量
      const targetFileCount = Math.floor(this.maxFileCount * 0.7); // 清理到70%
      const filesToDelete = validFiles.slice(
        0,
        Math.max(0, validFiles.length - targetFileCount),
      );

      // 删除文件
      let deletedCount = 0;
      let freedSize = 0;

      for (const fileInfo of filesToDelete) {
        try {
          await fs.unlink(fileInfo.path);
          deletedCount++;
          freedSize += fileInfo.size;
        } catch (error) {
          this.logger.warn(`删除缓存文件失败: ${fileInfo.name}`, error);
        }
      }

      this.logger.log(
        `本地文件缓存清理完成: 删除了 ${deletedCount} 个文件，释放了 ${(freedSize / 1024 / 1024).toFixed(2)}MB 空间`,
      );
    } catch (error) {
      this.logger.error('执行本地文件缓存清理失败:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats(): Promise<{
    fileCount: number;
    totalSize: number;
    maxCacheSize: number;
    maxFileCount: number;
    usagePercentage: number;
  }> {
    try {
      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;

      for (const file of files) {
        try {
          const filePath = path.join(this.cacheDir, file);
          const stat = await fs.stat(filePath);
          totalSize += stat.size;
        } catch {
          // 忽略无法访问的文件
        }
      }

      return {
        fileCount: files.length,
        totalSize,
        maxCacheSize: this.maxCacheSize,
        maxFileCount: this.maxFileCount,
        usagePercentage: (totalSize / this.maxCacheSize) * 100,
      };
    } catch (error) {
      this.logger.error('获取缓存统计信息失败:', error);
      return {
        fileCount: 0,
        totalSize: 0,
        maxCacheSize: this.maxCacheSize,
        maxFileCount: this.maxFileCount,
        usagePercentage: 0,
      };
    }
  }
}
