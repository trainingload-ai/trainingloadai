import type { Readable } from 'node:stream';

import type { StorageBucketTarget, StorageMultipartPart } from './storage.port';

export type RemoteObjectUpload = {
  fileKey: string;
  body: Buffer | Readable;
  contentType: string;
  contentLength?: number;
  target?: StorageBucketTarget;
};

/**
 * Private deployments may supply a remote object-store adapter. Core and
 * Self-host know only this protocol and never import a provider SDK.
 */
export interface RemoteObjectStoragePort {
  upload(input: RemoteObjectUpload): Promise<void>;
  createMultipart(input: {
    fileKey: string;
    contentType: string;
    target?: StorageBucketTarget;
  }): Promise<string>;
  uploadPart(input: {
    fileKey: string;
    uploadId: string;
    partNumber: number;
    body: Readable;
    size: number;
    target?: StorageBucketTarget;
  }): Promise<void>;
  listParts(input: {
    fileKey: string;
    uploadId: string;
    target?: StorageBucketTarget;
  }): Promise<StorageMultipartPart[]>;
  completeMultipart(input: {
    fileKey: string;
    uploadId: string;
    parts: StorageMultipartPart[];
    target?: StorageBucketTarget;
  }): Promise<void>;
  abortMultipart(input: {
    fileKey: string;
    uploadId: string;
    target?: StorageBucketTarget;
  }): Promise<void>;
  storedFileSize(
    fileKey: string,
    target?: StorageBucketTarget,
  ): Promise<number | null>;
  openReadStream(
    fileKey: string,
    target?: StorageBucketTarget,
  ): Promise<Readable>;
  delete(fileKey: string, target?: StorageBucketTarget): Promise<void>;
  publicAssetUrl(
    fileKey: string,
    target?: StorageBucketTarget,
    explicitBaseUrl?: string | null,
  ): string | null;
  objectUrl(fileKey: string, target?: StorageBucketTarget): string;
}

export const REMOTE_OBJECT_STORAGE_PORT = Symbol('REMOTE_OBJECT_STORAGE_PORT');
