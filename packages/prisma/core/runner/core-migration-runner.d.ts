export type CoreMigrationDialect = 'postgresql' | 'pglite';

export interface CoreMigrationResult {
  ok: true;
  applied: string[];
  dialect: CoreMigrationDialect;
}

export interface CoreMigrationOptions {
  databaseUrl?: string;
  dialect?: CoreMigrationDialect;
}

export function runCoreMigrations(
  options?: CoreMigrationOptions,
): Promise<CoreMigrationResult>;
