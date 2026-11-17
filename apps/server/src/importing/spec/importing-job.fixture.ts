import { UserQueryService } from '@/api/user/user-query.service';
import { UserIdentityRepository } from '@/api/user/persistence/user-identity.repository';
import { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import { ExternalProviderConnectionRepository } from '@/integrations/external-provider/persistence/external-provider-connection.repository';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobRepository } from '../persistence/importing-job.repository';
import type { ImportPublicationAuthorizationExtension } from '../import-publication-authorization';

/** Assemble real transaction-aware table owners for unit and database fixtures. */
export function importingJobRepository(
  prisma: PrismaService,
  extension?: ImportPublicationAuthorizationExtension,
) {
  return new ImportingJobRepository(
    prisma,
    new UserQueryService(new UserIdentityRepository(prisma)),
    new ExternalProviderConnectionService(
      prisma,
      new ExternalProviderConnectionRepository(prisma),
    ),
    extension,
  );
}
