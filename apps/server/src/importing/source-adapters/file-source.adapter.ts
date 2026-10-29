import { Injectable } from '@nestjs/common';
import type {
  ImportSourceAdapter,
  SourceNormalizeInput,
  SourceNormalizeResult,
} from './source-adapter.interface';
import { mapTrackSwapActivityToCanonicalPayload } from './trackswap-canonical.mapper';
import { decodeTrackFile } from '../trackswap-file';

@Injectable()
export class FileSourceAdapter implements ImportSourceAdapter {
  readonly kind = 'FILE' as const;

  async normalize(input: SourceNormalizeInput): Promise<SourceNormalizeResult> {
    if (input.kind !== this.kind || !('file' in input)) {
      throw new Error(
        `Unsupported source kind for FILE adapter: ${input.kind}`,
      );
    }
    const decoded = await decodeTrackFile(input.file.buffer, {
      filename: input.file.originalname,
    });
    const parsed = decoded.activity;
    const activities = parsed.activities ?? [];

    if (activities.length === 0) {
      throw new Error('No activities found in file');
    }

    return {
      sourceUid: input.sourceUid,
      sourceKind: this.kind,
      metadata: {
        parsedActivityCount: activities.length,
        detectedFormat: decoded.detectedFormat,
        extensionMismatch: decoded.extensionMismatch,
        originalFileName: input.file.originalname,
      },
      payloads: activities.map((activity, index) =>
        mapTrackSwapActivityToCanonicalPayload({
          kind: this.kind,
          sourceUid: input.sourceUid,
          activity,
          fileName: input.file.originalname,
          fileKey: input.fileKey,
          rawStorageKey: input.rawStorageKey,
          sourceChecksum: input.sourceChecksum,
          metadata: input.metadata,
          activityIndex: index,
          activityCount: activities.length,
        }),
      ),
    };
  }
}
