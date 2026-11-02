import { ConflictException, Injectable } from '@nestjs/common';
import type {
  Prisma,
  RouteDeliveryState,
  ThirdPartyProvider,
} from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalProviderConnectionService } from '../integrations/external-provider/external-provider-connection.service';
import { ExternalProviderWebhookInboxService } from '../integrations/external-provider/external-provider-webhook-inbox.service';
const receiptMetadata = z
  .object({
    verification: z.enum(['NONE', 'RECEIPT_ONLY', 'READBACK', 'USER_ATTESTED']),
    lastTaskId: z.string().min(1).max(160),
    remoteOwnerId: z.string().min(1).max(160).optional(),
    verifiedAt: z.string().datetime().optional(),
    userAttestedAt: z.string().datetime().optional(),
  })
  .strict();
export type RouteDeliveryReceipt = {
  userId: string;
  routeId: string;
  versionId: string;
  provider: ThirdPartyProvider;
  connectionId: string;
  accountRef: string;
  externalId: string | null;
  state: RouteDeliveryState;
  intent: 'PUBLISH' | 'REMOVE';
  localChecksum: string;
  remoteChecksum?: string | null;
  metadata: z.infer<typeof receiptMetadata>;
  claim: { id: string; attempts: number; lockedAt: Date };
};
@Injectable()
export class RoutesDeliveryLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: ExternalProviderConnectionService,
    private readonly inbox: ExternalProviderWebhookInboxService,
  ) {}
  find(
    userId: string,
    routeId: string,
    provider: ThirdPartyProvider,
    accountRef: string,
  ) {
    return this.prisma.routeExternalMapping.findUnique({
      where: {
        userId_provider_accountRef_routeId: {
          userId,
          provider,
          accountRef,
          routeId,
        },
      },
    });
  }
  async record(input: RouteDeliveryReceipt) {
    const metadata = receiptMetadata.parse(input.metadata);
    if (
      metadata.lastTaskId !== input.claim.id ||
      (input.state === 'VERIFIED' && metadata.verification !== 'READBACK') ||
      (input.state === 'REMOTE_DELETED' &&
        !['READBACK', 'USER_ATTESTED'].includes(metadata.verification))
    )
      throw new ConflictException('ROUTE_DELIVERY_EVIDENCE_REQUIRED');
    return this.prisma.$transaction(async (tx) => {
      if (
        !(await this.inbox.isCurrentClaim(
          {
            ...input.claim,
            provider: input.provider,
            externalUserId: input.accountRef,
          },
          tx,
        ))
      )
        throw new ConflictException('ROUTE_DELIVERY_LEASE_LOST');
      await tx.$queryRawUnsafe(
        'SELECT id FROM t_saved_route WHERE id=$1 AND user_id=$2 FOR UPDATE',
        input.routeId,
        input.userId,
      );
      const route = await tx.savedRoute.findFirst({
        where: { id: input.routeId, userId: input.userId },
      });
      const version = await tx.savedRouteVersion.findFirst({
        where: {
          id: input.versionId,
          routeId: input.routeId,
          userId: input.userId,
          checksum: input.localChecksum,
        },
      });
      const connection = await this.connections.model(tx).findUnique({
        where: { id: input.connectionId },
        select: {
          id: true,
          userId: true,
          provider: true,
          externalAthleteId: true,
          status: true,
        },
      });
      if (
        !route ||
        !version ||
        !connection ||
        connection.userId !== input.userId ||
        connection.provider !== input.provider ||
        connection.externalAthleteId !== input.accountRef
      )
        throw new ConflictException('ROUTE_DELIVERY_OWNER_CHANGED');
      const where = {
        userId_provider_accountRef_routeId: {
          userId: input.userId,
          provider: input.provider,
          accountRef: input.accountRef,
          routeId: input.routeId,
        },
      };
      const previous = await tx.routeExternalMapping.findUnique({ where });
      if (previous && !previous.createdByApplication)
        throw new ConflictException('ROUTE_REMOTE_RESOURCE_NOT_OWNED');
      if (
        previous?.externalId &&
        previous.state !== 'REMOTE_DELETED' &&
        input.externalId !== previous.externalId
      )
        throw new ConflictException('ROUTE_REMOTE_ID_CHANGED');
      const oldMetadata = previous?.metadata as Record<string, unknown> | null;
      if (input.state === 'PENDING') {
        if (
          connection.status !== 'ACTIVE' ||
          (input.intent === 'PUBLISH' &&
            (route.deletedAt || version.revision !== route.headRevision))
        )
          throw new ConflictException('ROUTE_LOCAL_VERSION_CHANGED');
        if (
          previous?.state === 'UNKNOWN' ||
          (previous?.state === 'PENDING' &&
            oldMetadata?.lastTaskId !== input.claim.id)
        )
          throw new ConflictException('ROUTE_DELIVERY_UNRESOLVED');
      }
      const data = {
        versionId: version.id,
        connectionId: input.connectionId,
        externalId: input.externalId,
        state: input.state,
        lastLocalChecksum: input.localChecksum,
        lastRemoteChecksum: input.remoteChecksum ?? null,
        metadata: metadata as Prisma.InputJsonObject,
      };
      return tx.routeExternalMapping.upsert({
        where,
        create: {
          userId: input.userId,
          routeId: input.routeId,
          provider: input.provider,
          accountRef: input.accountRef,
          ...data,
        },
        update: data,
      });
    });
  }
}
