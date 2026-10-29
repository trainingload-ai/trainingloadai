import { Global, Injectable, Module, NotFoundException } from '@nestjs/common';

import {
  EXTERNAL_PROGRAM_IMPORT,
  type ExternalProgramImporter,
} from '@/api/workout/external-program-import.port';

@Injectable()
class DisabledExternalProgramImporter implements ExternalProgramImporter {
  supports(_provider: string) {
    return false;
  }

  importProgram(_sourceText: string): never {
    throw new NotFoundException({
      code: 'EXTERNAL_INTEGRATION_NOT_AVAILABLE',
      message: 'EXTERNAL_INTEGRATION_NOT_AVAILABLE',
    });
  }
}

@Global()
@Module({
  providers: [
    DisabledExternalProgramImporter,
    {
      provide: EXTERNAL_PROGRAM_IMPORT,
      useExisting: DisabledExternalProgramImporter,
    },
  ],
  exports: [EXTERNAL_PROGRAM_IMPORT],
})
export class DisabledExternalProgramImportModule {}
