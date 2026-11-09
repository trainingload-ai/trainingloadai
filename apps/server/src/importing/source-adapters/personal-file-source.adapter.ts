import type { ImportSourceKind } from '@prisma/client';
import { createHash } from 'crypto';
import type {
  ImportSourceAdapter,
  SourceNormalizeInput,
  SourceNormalizeResult,
} from './source-adapter.interface';
import { mapTrackSwapActivityToCanonicalPayload } from './trackswap-canonical.mapper';
import { decodeTrackFile } from '../trackswap-file';
import { garminPersonalActivity } from './garmin-personal-activity';

/** Transport-specific source identity; parsing/materialization remain shared. */
export class PersonalFileSourceAdapter implements ImportSourceAdapter {
  constructor(
    readonly kind: Extract<
      ImportSourceKind,
      'GARMIN_PERSONAL_API' | 'COROS_MCP'
    >,
  ) {}
  async normalize(input: SourceNormalizeInput): Promise<SourceNormalizeResult> {
    if (input.kind !== this.kind || !('activityFile' in input))
      throw new Error('Personal activity file missing');
    const decoded = await decodeTrackFile(input.activityFile.buffer, {
      filename: input.activityFile.originalname,
    });
    const activities = decoded.activity.activities ?? [];
    if (!activities.length)
      throw new Error('No activities found in provider file');
    return {
      sourceUid: input.sourceUid,
      sourceKind: this.kind,
      metadata: {
        detectedFormat: decoded.detectedFormat,
        parsedActivityCount: activities.length,
      },
      payloads: activities.map((activity, index) =>
        mapTrackSwapActivityToCanonicalPayload({
          kind: this.kind,
          sourceUid: input.sourceUid,
          activity:
            this.kind === 'GARMIN_PERSONAL_API'
              ? garminPersonalActivity(
                  activity,
                  input.rawPayload,
                  activities.length === 1,
                )
              : {
                  ...activity,
                  ...(typeof input.metadata?.title === 'string'
                    ? { activityName: input.metadata.title }
                    : {}),
                },
          provider: this.kind === 'GARMIN_PERSONAL_API' ? 'garmin' : 'coros',
          accountRef: input.accountRef,
          externalId: input.externalId,
          fileName: input.activityFile.originalname,
          fileKey: input.fileKey,
          rawStorageKey: input.rawStorageKey,
          // Canonical source versions include explicit provider metadata edits
          // even when the original FIT bytes remain identical. The raw file
          // SHA-256 is retained separately for file integrity and import dedup.
          sourceChecksum:
            input.sourceChecksum && input.metadata?.remoteDetail
              ? createHash('sha256')
                  .update(
                    JSON.stringify({
                      fileChecksum: input.sourceChecksum,
                      detail: input.metadata.remoteDetail,
                      title: input.metadata.title ?? null,
                    }),
                  )
                  .digest('hex')
              : input.sourceChecksum,
          metadata: {
            ...input.metadata,
            rawFileChecksum: input.sourceChecksum ?? null,
          },
          activityIndex: index,
          activityCount: activities.length,
        }),
      ),
    };
  }
}
