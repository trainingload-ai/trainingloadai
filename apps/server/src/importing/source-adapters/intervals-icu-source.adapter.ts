import { Injectable } from '@nestjs/common';
import type {
  ImportSourceAdapter,
  SourceNormalizeInput,
  SourceNormalizeResult,
} from './source-adapter.interface';
import { mapTrackSwapActivityToCanonicalPayload } from './trackswap-canonical.mapper';
import { decodeTrackFile } from '../trackswap-file';

@Injectable()
export class IntervalsIcuSourceAdapter implements ImportSourceAdapter {
  readonly kind = 'INTERVALS_ICU' as const;

  async normalize(input: SourceNormalizeInput): Promise<SourceNormalizeResult> {
    if (input.kind !== this.kind || !('activityFile' in input)) {
      throw new Error(`Intervals.icu 适配器不支持该来源类型：${input.kind}`);
    }

    const decoded = await decodeTrackFile(input.activityFile.buffer, {
      filename: input.activityFile.originalname,
    });
    const parsed = decoded.activity;
    const activities = parsed.activities ?? [];

    if (activities.length === 0) {
      throw new Error('Intervals.icu 活动文件中没有找到活动');
    }

    return {
      sourceUid: input.sourceUid,
      sourceKind: this.kind,
      metadata: {
        ...(input.metadata ?? {}),
        parsedActivityCount: activities.length,
        detectedFormat: decoded.detectedFormat,
        extensionMismatch: decoded.extensionMismatch,
        originalFileName: input.activityFile.originalname,
      },
      payloads: activities.map((activity, index) =>
        mapTrackSwapActivityToCanonicalPayload({
          kind: this.kind,
          sourceUid: input.sourceUid,
          activity,
          provider: input.provider ?? 'intervals_icu',
          accountRef: input.accountRef,
          externalId: input.externalId,
          fileName: input.activityFile.originalname,
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
