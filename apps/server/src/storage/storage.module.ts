import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { STORAGE_PORT } from './storage.port';

@Module({
  providers: [
    StorageService,
    { provide: STORAGE_PORT, useExisting: StorageService },
  ],
  exports: [StorageService, STORAGE_PORT],
})
export class StorageModule {}
