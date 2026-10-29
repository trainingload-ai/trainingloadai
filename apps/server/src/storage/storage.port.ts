import type { Readable } from 'node:stream';

import type { CreateFileResponseDto } from './dto/dto';

export type StorageVisibility = 'public' | 'private';

export type StorageBucketTarget =
  | StorageVisibility
  | {
      visibility?: StorageVisibility;
      bucketName?: string;
      configKey?: string;
      publicBaseUrl?: string;
    };

export type StorageMultipartPart = {
  partNumber: number;
  size: number;
  etag?: string;
};

/** Durable object/file operations required by Core. */
export interface StoragePort {
  uploadFile(
    file: Express.Multer.File,
    bucket?: StorageBucketTarget,
    req?: unknown,
  ): Promise<CreateFileResponseDto>;
  uploadFiles(
    files: Express.Multer.File[],
    bucket?: StorageBucketTarget,
  ): Promise<CreateFileResponseDto[]>;
  uploadFileFromPath(
    file: Pick<
      Express.Multer.File,
      'path' | 'originalname' | 'mimetype' | 'size'
    >,
    bucket?: StorageBucketTarget,
    req?: unknown,
  ): Promise<CreateFileResponseDto>;
  uploadFileWithCustomKey(
    file: Express.Multer.File,
    customKey: string,
    bucket?: StorageBucketTarget,
    req?: unknown,
  ): Promise<CreateFileResponseDto>;
  createMultipartUpload(
    originalName: string,
    bucket?: StorageBucketTarget,
  ): Promise<{ fileKey: string; uploadId: string }>;
  uploadMultipartPartFromPath(args: {
    fileKey: string;
    uploadId: string;
    partNumber: number;
    filePath: string;
    size: number;
    bucket?: StorageBucketTarget;
  }): Promise<void>;
  listMultipartParts(args: {
    fileKey: string;
    uploadId: string;
    bucket?: StorageBucketTarget;
  }): Promise<StorageMultipartPart[]>;
  completeMultipartUpload(args: {
    fileKey: string;
    uploadId: string;
    parts: StorageMultipartPart[];
    bucket?: StorageBucketTarget;
  }): Promise<void>;
  abortMultipartUpload(args: {
    fileKey: string;
    uploadId: string;
    bucket?: StorageBucketTarget;
  }): Promise<void>;
  storedFileSize(
    fileKey: string,
    bucket?: StorageBucketTarget,
  ): Promise<number | null>;
  copyFileToPath(
    fileKey: string,
    destinationPath: string,
    bucket?: StorageBucketTarget,
  ): Promise<void>;
  openReadStream(
    fileKey: string,
    bucket?: StorageBucketTarget,
  ): Promise<Readable>;
  getFileWithKey(key: string, bucket?: StorageBucketTarget): Promise<Buffer>;
  getFilesWithKey(
    keys: string[],
    bucket?: StorageBucketTarget,
  ): Promise<Buffer[]>;
  deleteFile(fileKey: string, bucket?: StorageBucketTarget): Promise<void>;
  deleteFiles(fileKeys: string[], bucket?: StorageBucketTarget): Promise<void>;
  publicAssetUrl(fileKey: string, baseUrl?: string | null): string | null;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
