import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { I18nService } from 'nestjs-i18n';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';
import { CreateFileResponseDto } from './dto/dto';
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import {
  assertReadableStoragePath,
  DEFAULT_LOCAL_STORAGE_PATH,
  ensureSecureStorageParent,
  localStorageKey,
  LOCAL_PRIVATE_NAMESPACE,
  LOCAL_PUBLIC_NAMESPACE,
  normalizeStorageKey,
  publicStorageUrlPath,
  resolveStoragePath,
} from './storage-path';
import { toStorageBusinessException } from './storage-error';
import {
  type StorageBucketTarget,
  type StorageMultipartPart,
  type StoragePort,
  type StorageVisibility,
} from './storage.port';
import {
  REMOTE_OBJECT_STORAGE_PORT,
  type RemoteObjectStoragePort,
} from './remote-object-storage.port';

export type {
  StorageBucketTarget,
  StorageMultipartPart,
  StorageVisibility,
} from './storage.port';

@Injectable()
export class StorageService implements OnModuleDestroy, StoragePort {
  private readonly logger = new Logger(StorageService.name);
  private readonly usesRemoteStorage: boolean;
  private readonly localStoragePath: string;
  private cleanupIntervalId?: NodeJS.Timeout;
  private readonly TEMP_FILE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
    @Optional()
    @Inject(REMOTE_OBJECT_STORAGE_PORT)
    private readonly remoteStorage?: RemoteObjectStoragePort,
  ) {
    // 从环境变量获取存储策略，默认为本地存储
    const configuredStrategy =
      this.configService.get<string>('STORAGE_STRATEGY') || 'LOCAL';
    this.usesRemoteStorage = configuredStrategy !== 'LOCAL';
    if (this.usesRemoteStorage && !this.remoteStorage) {
      throw new Error(
        `External storage strategy ${configuredStrategy} requires a Managed storage adapter`,
      );
    }
    this.localStoragePath = path.resolve(
      this.usesRemoteStorage
        ? this.configService.get<string>('LOCAL_STORAGE_CACHE_PATH') ||
            '/data/cache/storage'
        : this.configService.get<string>('LOCAL_STORAGE_PATH') ||
            DEFAULT_LOCAL_STORAGE_PATH,
    );

    this.logger.log(
      `使用存储策略: ${this.usesRemoteStorage ? 'EXTERNAL' : 'LOCAL'}`,
    );

    if (this.usesRemoteStorage) {
      // 远端对象存储模式也初始化本地临时缓存目录。
      this.initializeLocalStorage();
      this.startTempCleanupScheduler();
    } else {
      this.initializeLocalStorage();
    }
  }

  /**
   * 初始化本地存储
   */
  private initializeLocalStorage(): void {
    // 确保本地存储目录存在
    if (!fs.existsSync(this.localStoragePath)) {
      fs.mkdirSync(this.localStoragePath, { recursive: true });
      this.logger.log(`创建本地存储目录: ${this.localStoragePath}`);
    }
    const stat = fs.lstatSync(this.localStoragePath);
    if (!stat.isDirectory()) {
      throw new Error(
        `Local storage root is not a directory: ${this.localStoragePath}`,
      );
    }
    fs.accessSync(this.localStoragePath, fs.constants.R_OK | fs.constants.W_OK);
    if (!this.usesRemoteStorage) {
      for (const namespace of [
        LOCAL_PUBLIC_NAMESPACE,
        LOCAL_PRIVATE_NAMESPACE,
      ]) {
        const namespacePath = path.join(this.localStoragePath, namespace);
        if (!fs.existsSync(namespacePath)) {
          fs.mkdirSync(namespacePath, { mode: 0o750 });
        }
        const namespaceStat = fs.lstatSync(namespacePath);
        if (namespaceStat.isSymbolicLink() || !namespaceStat.isDirectory()) {
          throw new Error(
            `Local storage namespace is not a real directory: ${namespacePath}`,
          );
        }
        fs.accessSync(namespacePath, fs.constants.R_OK | fs.constants.W_OK);
      }
    }
    this.logger.log(`本地存储初始化完成，路径: ${this.localStoragePath}`);
  }

  /**
   * 启动临时文件定时清理，仅在远端缓存模式下启用
   */
  private startTempCleanupScheduler(): void {
    if (this.cleanupIntervalId) return;
    this.cleanupIntervalId = setInterval(
      () =>
        this.cleanupTempFiles().catch((e) =>
          this.logger.error(
            `[startTempCleanupScheduler] 清理临时文件失败：${
              e instanceof Error ? e.message : String(e)
            }`,
          ),
        ),
      this.CLEANUP_INTERVAL_MS,
    );
    this.logger.log('临时文件清理任务已启动（每小时执行一次）');
  }

  /**
   * 停止临时文件清理任务
   */
  private stopTempCleanupScheduler(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
      this.logger.log('临时文件清理任务已停止');
    }
  }

  /**
   * 清理超过 TTL 的临时文件（递归扫描临时目录）
   */
  private async cleanupTempFiles(): Promise<void> {
    if (!this.usesRemoteStorage) return;
    const now = Date.now();

    const walk = async (dir: string): Promise<void> => {
      let entries: fs.Dirent[] = [];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch (_e) {
        this.logger.warn(`清理扫描失败，无法读取目录: ${dir}`);
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        try {
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            const stat = await fsp.stat(fullPath);
            const age = now - stat.mtimeMs; // 使用修改时间作为参考
            if (age > this.TEMP_FILE_TTL_MS) {
              await fsp.unlink(fullPath);
              this.logger.debug(`已清理临时文件: ${fullPath}`);
            }
          }
        } catch (_e) {
          this.logger.warn(`清理文件失败: ${fullPath}`);
        }
      }
    };

    await walk(this.localStoragePath);
  }

  /**
   * Upload a file through the configured storage port.
   * @param file
   * @param bucket
   * @param req
   * @returns
   */
  async uploadFile(
    file: Express.Multer.File,
    bucket?: StorageBucketTarget,
    req?: unknown,
  ): Promise<CreateFileResponseDto> {
    // 对外统一入口，根据组合阶段选择本地或 Managed 远端适配器。
    if (this.usesRemoteStorage) {
      return await this.uploadFileToRemote(file, bucket, req);
    } else {
      return await this.uploadFileToLocal(file, bucket, req);
    }
  }

  /**
   * 批量上传文件
   * @param file
   * @returns
   */
  async uploadFiles(
    files: Express.Multer.File[],
    bucket?: StorageBucketTarget,
  ): Promise<CreateFileResponseDto[]> {
    return await Promise.all(
      files.map((file) => this.uploadFile(file, bucket)),
    );
  }

  /**
   * Persist a file that Multer streamed to disk without loading the whole file
   * into memory. This is intended for large archives such as Garmin exports.
   */
  async uploadFileFromPath(
    file: Pick<
      Express.Multer.File,
      'path' | 'originalname' | 'mimetype' | 'size'
    >,
    bucket?: StorageBucketTarget,
    req?: unknown,
  ): Promise<CreateFileResponseDto> {
    let fileKey = this.generateFileKey(file.originalname);
    if (this.usesRemoteStorage) {
      await this.remote().upload({
        fileKey,
        body: fs.createReadStream(file.path),
        contentType: file.mimetype,
        contentLength: file.size,
        target: bucket,
      });
      // The request must not return until the archive is durable: the worker
      // can run in another process that cannot see this process's temp file.
    } else {
      fileKey = this.localWriteKey(fileKey, bucket);
      await this.copySourceFileAtomically(fileKey, file.path);
      await fsp.unlink(file.path).catch(() => undefined);
    }

    return {
      name: file.originalname,
      size: file.size,
      type: file.originalname?.split('.')?.pop() || 'zip',
      url: this.getFileUrl(fileKey, req, bucket),
      fileKey,
    };
  }

  /** Start a multipart object without exposing storage credentials to clients. */
  async createMultipartUpload(
    originalName: string,
    bucket?: StorageBucketTarget,
  ): Promise<{ fileKey: string; uploadId: string }> {
    let fileKey = this.generateFileKey(originalName);
    if (this.usesRemoteStorage) {
      const uploadId = await this.remote().createMultipart({
        fileKey,
        contentType: 'application/zip',
        target: bucket,
      });
      return { fileKey, uploadId };
    }

    fileKey = this.localWriteKey(fileKey, bucket);
    const uploadId = uuidv4();
    await fsp.mkdir(this.localMultipartDirectory(uploadId), {
      recursive: true,
    });
    return { fileKey, uploadId };
  }

  /** Upload or replace one bounded multipart chunk from disk. */
  async uploadMultipartPartFromPath(args: {
    fileKey: string;
    uploadId: string;
    partNumber: number;
    filePath: string;
    size: number;
    bucket?: StorageBucketTarget;
  }): Promise<void> {
    const fileKey = normalizeStorageKey(args.fileKey);
    if (!Number.isSafeInteger(args.partNumber) || args.partNumber <= 0) {
      throw new Error('Invalid multipart part number');
    }
    if (this.usesRemoteStorage) {
      await this.remote().uploadPart({
        fileKey,
        uploadId: args.uploadId,
        partNumber: args.partNumber,
        body: fs.createReadStream(args.filePath),
        size: args.size,
        target: args.bucket,
      });
      return;
    }

    const directory = this.localMultipartDirectory(args.uploadId);
    await fsp.mkdir(directory, { recursive: true });
    const destination = path.join(directory, `${args.partNumber}.part`);
    const temporary = `${destination}.${uuidv4()}.tmp`;
    try {
      await fsp.copyFile(args.filePath, temporary);
      await fsp.rename(temporary, destination);
    } finally {
      await fsp.unlink(temporary).catch(() => undefined);
    }
  }

  /** List durable chunks so interrupted browser uploads can resume. */
  async listMultipartParts(args: {
    fileKey: string;
    uploadId: string;
    bucket?: StorageBucketTarget;
  }): Promise<StorageMultipartPart[]> {
    const fileKey = normalizeStorageKey(args.fileKey);
    if (this.usesRemoteStorage) {
      return this.remote().listParts({
        fileKey,
        uploadId: args.uploadId,
        target: args.bucket,
      });
    }

    const directory = this.localMultipartDirectory(args.uploadId);
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    const parts: StorageMultipartPart[] = [];
    for (const entry of entries) {
      const match = entry.isFile() ? entry.name.match(/^(\d+)\.part$/) : null;
      if (!match) continue;
      const partNumber = Number(match[1]);
      const stat = await fsp.stat(path.join(directory, entry.name));
      parts.push({ partNumber, size: stat.size });
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  /** Assemble all verified chunks into the final private object. */
  async completeMultipartUpload(args: {
    fileKey: string;
    uploadId: string;
    parts: StorageMultipartPart[];
    bucket?: StorageBucketTarget;
  }): Promise<void> {
    const fileKey = normalizeStorageKey(args.fileKey);
    if (
      args.parts.length === 0 ||
      args.parts.some(
        (part) =>
          !Number.isSafeInteger(part.partNumber) || part.partNumber <= 0,
      )
    ) {
      throw new Error('Multipart upload contains an invalid part number');
    }
    if (this.usesRemoteStorage) {
      await this.remote().completeMultipart({
        fileKey,
        uploadId: args.uploadId,
        parts: args.parts,
        target: args.bucket,
      });
      return;
    }

    const destination = resolveStoragePath(this.localStoragePath, fileKey);
    const directory = this.localMultipartDirectory(args.uploadId);
    await ensureSecureStorageParent(this.localStoragePath, destination);
    const stagingPath = `${destination}.${process.pid}.${uuidv4()}.tmp`;
    let handle: Awaited<ReturnType<typeof fsp.open>> | undefined;
    try {
      handle = await fsp.open(stagingPath, 'wx', 0o600);
      for (const part of args.parts) {
        const partPath = resolveStoragePath(
          directory,
          `${part.partNumber}.part`,
        );
        await assertReadableStoragePath(directory, partPath);
        for await (const chunk of fs.createReadStream(partPath)) {
          await this.writeBufferFully(handle, chunk as Buffer);
        }
      }
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fsp.rename(stagingPath, destination);
      await this.syncDirectory(path.dirname(destination));
      await fsp.rm(directory, { recursive: true, force: true });
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await fsp.unlink(stagingPath).catch(() => undefined);
      throw error;
    }
  }

  async abortMultipartUpload(args: {
    fileKey: string;
    uploadId: string;
    bucket?: StorageBucketTarget;
  }): Promise<void> {
    const fileKey = normalizeStorageKey(args.fileKey);
    if (this.usesRemoteStorage) {
      await this.remote().abortMultipart({
        fileKey,
        uploadId: args.uploadId,
        target: args.bucket,
      });
      return;
    }
    await fsp.rm(this.localMultipartDirectory(args.uploadId), {
      recursive: true,
      force: true,
    });
  }

  async storedFileSize(
    fileKey: string,
    bucket?: StorageBucketTarget,
  ): Promise<number | null> {
    const localPath = await this.findLocalObjectPath(fileKey, bucket);
    if (localPath) {
      return (await fsp.stat(localPath)).size;
    }
    if (!this.usesRemoteStorage) return null;
    return this.remote().storedFileSize(fileKey, bucket);
  }

  /** Copy a stored object to a local path without buffering it in memory. */
  async copyFileToPath(
    fileKey: string,
    destinationPath: string,
    bucket?: StorageBucketTarget,
  ): Promise<void> {
    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
    const cachedPath = await this.findLocalObjectPath(fileKey, bucket);
    if (cachedPath) {
      await fsp.copyFile(cachedPath, destinationPath);
      return;
    }

    if (!this.usesRemoteStorage) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.STORAGE_FILE_NOT_FOUND,
        message: 'SELF_HOST_STORAGE_FILE_NOT_FOUND',
      });
    }

    const body = await this.remote().openReadStream(fileKey, bucket);
    await pipeline(body, fs.createWriteStream(destinationPath));
  }

  /** Open a stored object as a stream without loading it into memory. */
  async openReadStream(
    fileKey: string,
    bucket?: StorageBucketTarget,
  ): Promise<Readable> {
    const cachedPath = await this.findLocalObjectPath(fileKey, bucket);
    if (cachedPath) {
      return fs.createReadStream(cachedPath);
    }

    if (!this.usesRemoteStorage) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.STORAGE_FILE_NOT_FOUND,
        message: 'SELF_HOST_STORAGE_FILE_NOT_FOUND',
      });
    }

    return this.remote().openReadStream(fileKey, bucket);
  }

  /**
   * 使用 key 来获取文件
   * @param key
   * @param bucket 可选的存储桶名称，由远端存储适配器决定
   */
  async getFileWithKey(key: string, bucket?: StorageBucketTarget) {
    // 远端模式采用本地缓存优先，导入解析可立即读取刚上传的文件。
    if (this.usesRemoteStorage) {
      // 本地优先读取，命中则直接返回；否则从远端拉取并写入缓存。
      const fullPath = resolveStoragePath(this.localStoragePath, key);
      try {
        if (fs.existsSync(fullPath)) {
          await assertReadableStoragePath(this.localStoragePath, fullPath);
          return await fsp.readFile(fullPath);
        }
      } catch (_e) {
        // 读取失败则继续从远端获取
        this.logger.warn(
          `从本地缓存读取失败: ${fullPath}, 接下来尝试从远端下载`,
        );
      }
      this.logger.log(`从远端对象存储下载文件: ${key}`);
      const buffer = await this.downloadFileFromRemote(key, bucket);
      // 写入本地缓存
      if (buffer) {
        try {
          await this.writeLocalCacheAtomically(key, buffer);
        } catch (_e) {
          this.logger.warn(`写入本地缓存失败: ${fullPath}`);
        }
        return buffer;
      }
      this.logger.warn(`从远端对象存储下载文件失败: ${key}`);
      return undefined;
    } else {
      return await this.downloadFileFromLocal(key, bucket);
    }
  }

  /**
   * 使用 keys 来批量获取文件
   * @param keys
   * @param bucket 可选的存储桶名称，由远端存储适配器决定
   * @returns
   */
  async getFilesWithKey(
    keys: string[],
    bucket?: StorageBucketTarget,
  ): Promise<Buffer[]> {
    return await Promise.all(
      keys.map((key) => this.getFileWithKey(key, bucket)),
    );
  }

  /**
   * 删除单个文件
   * @param fileKey 文件的存储键
   * @param bucket 可选的存储桶名称
   */
  async deleteFile(
    fileKey: string,
    bucket?: StorageBucketTarget,
  ): Promise<void> {
    if (this.usesRemoteStorage) {
      await this.remote().delete(fileKey, bucket);
      // 同步删除本地临时缓存（忽略错误）
      try {
        await this.deleteFileFromLocal(fileKey);
      } catch {}
      return;
    } else {
      return await this.deleteFileFromLocal(fileKey, bucket);
    }
  }

  /**
   * 批量删除文件
   * @param fileKeys 文件键数组
   * @param bucket 可选的存储桶名称
   */
  async deleteFiles(
    fileKeys: string[],
    bucket?: StorageBucketTarget,
  ): Promise<void> {
    await Promise.all(fileKeys.map((key) => this.deleteFile(key, bucket)));
  }

  /**
   * 使用自定义文件键上传文件
   * @param file 文件对象
   * @param customKey 自定义文件键路径
   * @param bucket 远端对象目标
   * @param req 请求对象，用于获取区域信息
   * @returns
   */
  async uploadFileWithCustomKey(
    file: Express.Multer.File,
    customKey: string,
    bucket?: StorageBucketTarget,
    req?: unknown,
  ): Promise<CreateFileResponseDto> {
    this.logger.debug(
      `当前存储策略：${this.usesRemoteStorage ? 'EXTERNAL' : 'LOCAL'}`,
    );
    if (this.usesRemoteStorage) {
      return await this.uploadFileToRemoteWithCustomKey(
        file,
        customKey,
        bucket,
        req,
      );
    } else {
      return await this.uploadFileToLocalWithCustomKey(
        file,
        customKey,
        bucket,
        req,
      );
    }
  }

  /**
   * 生成基于当前日期的文件夹路径
   * @returns 格式为 YYYY/MM/DD 的路径字符串
   */
  private generateDatePath(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}/${month}/${day}`;
  }

  /**
   * 生成包含日期路径的完整文件键
   * @param originalName 原始文件名
   * @returns 完整的文件键路径
   */
  private generateFileKey(originalName?: string): string {
    const datePath = this.generateDatePath();
    const portableName = (originalName ?? 'unnamed-file').replace(/\\/g, '/');
    const baseName = path.posix.basename(portableName);
    const safeName = baseName
      .replace(/[\u0000-\u001f\u007f]/g, '_')
      .trim()
      .slice(-180);
    const fileName = `${uuidv4()}-${safeName || 'unnamed-file'}`;

    return normalizeStorageKey(`${datePath}/${fileName}`);
  }

  private localVisibility(target?: StorageBucketTarget): StorageVisibility {
    if (typeof target === 'string') {
      return target === 'public' ? 'public' : 'private';
    }
    return target?.visibility ?? 'private';
  }

  private localWriteKey(fileKey: string, target?: StorageBucketTarget): string {
    return localStorageKey(fileKey, this.localVisibility(target));
  }

  private localObjectKeys(
    fileKey: string,
    target?: StorageBucketTarget,
  ): string[] {
    const normalizedKey = normalizeStorageKey(fileKey);
    if (this.usesRemoteStorage) return [normalizedKey];
    if (
      normalizedKey.startsWith(`${LOCAL_PUBLIC_NAMESPACE}/`) ||
      normalizedKey.startsWith(`${LOCAL_PRIVATE_NAMESPACE}/`)
    ) {
      return [normalizedKey];
    }
    // Prefer the v1 namespace, then fall back to a legacy unprefixed object.
    return [this.localWriteKey(normalizedKey, target), normalizedKey];
  }

  private async findLocalObjectPath(
    fileKey: string,
    target?: StorageBucketTarget,
  ): Promise<string | null> {
    for (const candidateKey of this.localObjectKeys(fileKey, target)) {
      const candidatePath = resolveStoragePath(
        this.localStoragePath,
        candidateKey,
      );
      try {
        await assertReadableStoragePath(this.localStoragePath, candidatePath);
        return candidatePath;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return null;
  }

  private localMultipartDirectory(uploadId: string): string {
    if (!/^[a-f0-9-]{36}$/i.test(uploadId)) {
      throw new Error('Invalid local multipart upload id');
    }
    return resolveStoragePath(this.localStoragePath, `.multipart/${uploadId}`);
  }

  public publicAssetUrl(
    fileKey: string,
    baseUrl?: string | null,
  ): string | null {
    if (!this.usesRemoteStorage) {
      if (
        normalizeStorageKey(fileKey).startsWith(`${LOCAL_PRIVATE_NAMESPACE}/`)
      ) {
        return null;
      }
      // LOCAL mode must never inherit a stale managed CDN base URL.
      const base = this.localApiBaseUrl();
      return `${base}/uploads/${publicStorageUrlPath(fileKey)}`;
    }
    return this.remote().publicAssetUrl(fileKey, undefined, baseUrl);
  }

  private getFileUrl(
    fileKey: string,
    req?: unknown,
    bucket?: StorageBucketTarget,
  ): string {
    if (this.usesRemoteStorage) {
      return this.remote().objectUrl(fileKey, bucket);
    }
    const normalizedKey = normalizeStorageKey(fileKey);
    if (!normalizedKey.startsWith(`${LOCAL_PUBLIC_NAMESPACE}/`)) return '';
    return `${this.localApiBaseUrl()}/uploads/${publicStorageUrlPath(normalizedKey)}`;
  }

  private localApiBaseUrl(explicitBaseUrl?: string | null): string {
    const configuredBaseUrl =
      explicitBaseUrl ||
      process.env.SELF_HOST_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_URL;
    if (configuredBaseUrl?.trim()) {
      return configuredBaseUrl.trim().replace(/\/+$/, '');
    }
    return '';
  }

  /**
   * 上传文件到本地存储
   * @param file
   * @param req 请求对象，用于获取区域信息
   * @returns
   */
  private async uploadFileToLocal(
    file: Express.Multer.File,
    bucket?: StorageBucketTarget,
    req?: unknown,
  ): Promise<CreateFileResponseDto> {
    this.logger.log('准备上传文件到本地存储');

    const fileKey = this.localWriteKey(
      this.generateFileKey(file?.originalname),
      bucket,
    );
    try {
      const fullPath = await this.writeLocalFileAtomically(
        fileKey,
        file.buffer,
      );
      this.logger.log(`文件上传成功: ${fullPath}`);

      return {
        name: file.originalname,
        size: file.size,
        type: file.originalname?.split('.')?.pop() || 'gpx',
        url: this.getFileUrl(fileKey, req, bucket),
        fileKey: fileKey,
      };
    } catch (err) {
      this.logger.error(
        `[uploadFileToLocal] 上传本地文件失败：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw toStorageBusinessException(err);
    }
  }

  /**
   * 使用自定义文件键上传文件到本地存储
   * @param file
   * @param customKey 自定义文件键
   * @param req 请求对象，用于获取区域信息
   * @returns
   */
  private async uploadFileToLocalWithCustomKey(
    file: Express.Multer.File,
    customKey: string,
    bucket?: StorageBucketTarget,
    req?: unknown,
  ): Promise<CreateFileResponseDto> {
    this.logger.log(`准备使用自定义键上传文件到本地存储: ${customKey}`);

    try {
      const normalizedKey = this.localWriteKey(customKey, bucket);
      const fullPath = await this.writeLocalFileAtomically(
        normalizedKey,
        file.buffer,
      );
      this.logger.log(`文件上传成功: ${fullPath}`);

      return {
        name: file.originalname,
        size: file.size,
        type: file.originalname?.split('.')?.pop() || 'gpx',
        url: this.getFileUrl(normalizedKey, req, bucket),
        fileKey: normalizedKey,
      };
    } catch (err) {
      this.logger.error(
        `[uploadFileToLocalWithCustomKey] 使用自定义键上传本地文件失败：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw toStorageBusinessException(err);
    }
  }

  /**
   * 从本地存储下载文件
   * @param fileKey
   * @returns
   */
  private async downloadFileFromLocal(
    fileKey: string,
    bucket?: StorageBucketTarget,
  ): Promise<Buffer> {
    try {
      const fullPath = await this.findLocalObjectPath(fileKey, bucket);
      if (!fullPath) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.STORAGE_FILE_NOT_FOUND,
          message: 'SELF_HOST_STORAGE_FILE_NOT_FOUND',
        });
      }
      return await fsp.readFile(fullPath);
    } catch (err) {
      if (err instanceof BusinessException) {
        throw err;
      }
      this.logger.error(
        `[downloadFileFromLocal] 下载本地文件失败：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw toStorageBusinessException(err);
    }
  }

  /**
   * 从本地存储删除文件
   * @param fileKey
   */
  private async deleteFileFromLocal(
    fileKey: string,
    bucket?: StorageBucketTarget,
  ): Promise<void> {
    try {
      for (const candidateKey of this.localObjectKeys(fileKey, bucket)) {
        const fullPath = resolveStoragePath(
          this.localStoragePath,
          candidateKey,
        );
        if (fs.existsSync(fullPath)) {
          await assertReadableStoragePath(this.localStoragePath, fullPath);
          await fsp.unlink(fullPath);
          this.logger.log(`成功删除本地文件: ${candidateKey}`);
        }
      }
    } catch (err) {
      this.logger.error(`删除本地文件失败: ${fileKey}`, err);
      throw toStorageBusinessException(err);
    }
  }

  private async uploadFileToRemote(
    file: Express.Multer.File,
    bucket?: StorageBucketTarget,
    req?: unknown,
  ): Promise<CreateFileResponseDto> {
    const fileKey = this.generateFileKey(file?.originalname);
    // 远端对象是权威副本；只有适配器确认持久化后才返回 key。
    await this.remote().upload({
      fileKey,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
      target: bucket,
    });

    // 本地缓存失败不影响远端上传成功，后续可从远端回源。
    try {
      await this.writeLocalCacheAtomically(fileKey, file.buffer);
    } catch (error) {
      this.logger.warn(
        `远端上传成功，但本地缓存写入失败: ${fileKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      name: file.originalname,
      size: file.size,
      type: file.originalname?.split('.')?.pop() || 'gpx',
      url: this.getFileUrl(fileKey, req, bucket),
      fileKey: fileKey,
    };
  }

  private async uploadFileToRemoteWithCustomKey(
    file: Express.Multer.File,
    customKey: string,
    bucket?: StorageBucketTarget,
    req?: unknown,
  ): Promise<CreateFileResponseDto> {
    const normalizedKey = normalizeStorageKey(customKey);
    await this.remote().upload({
      fileKey: normalizedKey,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
      target: bucket,
    });

    try {
      await this.writeLocalCacheAtomically(normalizedKey, file.buffer);
    } catch (error) {
      this.logger.warn(
        `远端上传成功，但本地缓存写入失败: ${normalizedKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      name: file.originalname,
      size: file.size,
      type: file.originalname?.split('.')?.pop() || 'gpx',
      url: this.getFileUrl(normalizedKey, req, bucket),
      fileKey: normalizedKey,
    };
  }

  private async writeLocalCacheAtomically(
    fileKey: string,
    buffer: Buffer,
  ): Promise<void> {
    await this.writeLocalFileAtomically(fileKey, buffer);
  }

  private async writeLocalFileAtomically(
    fileKey: string,
    buffer: Buffer,
  ): Promise<string> {
    const fullPath = resolveStoragePath(this.localStoragePath, fileKey);
    await ensureSecureStorageParent(this.localStoragePath, fullPath);
    const stagingPath = `${fullPath}.${process.pid}.${uuidv4()}.tmp`;
    let handle: Awaited<ReturnType<typeof fsp.open>> | undefined;
    try {
      handle = await fsp.open(stagingPath, 'wx', 0o600);
      await handle.writeFile(buffer);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fsp.rename(stagingPath, fullPath);
      await this.syncDirectory(path.dirname(fullPath));
      return fullPath;
    } finally {
      await handle?.close().catch(() => undefined);
      await fsp.unlink(stagingPath).catch(() => undefined);
    }
  }

  private async copySourceFileAtomically(
    fileKey: string,
    sourcePath: string,
  ): Promise<void> {
    const fullPath = resolveStoragePath(this.localStoragePath, fileKey);
    await ensureSecureStorageParent(this.localStoragePath, fullPath);
    const stagingPath = `${fullPath}.${process.pid}.${uuidv4()}.tmp`;
    try {
      await pipeline(
        fs.createReadStream(sourcePath),
        fs.createWriteStream(stagingPath, { flags: 'wx', mode: 0o600 }),
      );
      const handle = await fsp.open(stagingPath, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fsp.rename(stagingPath, fullPath);
      await this.syncDirectory(path.dirname(fullPath));
    } finally {
      await fsp.unlink(stagingPath).catch(() => undefined);
    }
  }

  private async syncDirectory(directory: string): Promise<void> {
    let handle: Awaited<ReturnType<typeof fsp.open>> | undefined;
    try {
      handle = await fsp.open(directory, 'r');
      await handle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM'].includes(code ?? '')) {
        throw error;
      }
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  private async writeBufferFully(
    handle: Awaited<ReturnType<typeof fsp.open>>,
    buffer: Buffer,
  ): Promise<void> {
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesWritten } = await handle.write(
        buffer,
        offset,
        buffer.length - offset,
      );
      if (bytesWritten <= 0) {
        throw new Error('Local storage write made no forward progress');
      }
      offset += bytesWritten;
    }
  }

  private async downloadFileFromRemote(
    fileKey: string,
    bucket?: StorageBucketTarget,
  ): Promise<Buffer> {
    try {
      const body = await this.remote().openReadStream(fileKey, bucket);
      const streamToBuffer = (stream: Readable): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer | string) => {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          });
          stream.on('end', () => resolve(Buffer.concat(chunks)));
          stream.on('error', reject);
        });
      };

      return await streamToBuffer(body);
    } catch (err) {
      this.logger.error('文件下载失败', err);
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error'),
      });
    }
  }

  private remote(): RemoteObjectStoragePort {
    if (!this.remoteStorage) {
      throw new Error('Managed remote object storage adapter is unavailable');
    }
    return this.remoteStorage;
  }

  async onModuleDestroy() {
    this.stopTempCleanupScheduler();
  }
}
