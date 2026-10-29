import { Injectable } from '@nestjs/common';
import type { ThirdPartyProvider } from '@prisma/client';
import { SportCatalogRepository } from './persistence/sport-catalog.repository';
import type {
  ProviderSportResolution,
  SportDefinitionRecord,
  SportFamily,
  SportMappingDirection,
} from './sport-catalog.types';

@Injectable()
export class SportCatalogService {
  constructor(private readonly catalog: SportCatalogRepository) {}

  list(options: { planning?: boolean; active?: boolean } = {}) {
    return this.catalog.findSports({
      where: {
        active: options.active ?? true,
        ...(options.planning ? { supportsPlanning: true } : {}),
      },
      orderBy: [{ family: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    }) as Promise<SportDefinitionRecord[]>;
  }

  get(code: string) {
    return this.catalog.findSportUnique({
      where: { code: this.normalizeCode(code) },
    }) as Promise<SportDefinitionRecord | null>;
  }

  defaultForFamily(family: SportFamily) {
    return this.catalog.findSportFirst({
      where: { family, active: true, isDefaultForFamily: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }) as Promise<SportDefinitionRecord | null>;
  }

  async resolve(code?: string | null, fallbackFamily?: SportFamily | null) {
    const exact = code ? await this.get(code) : null;
    if (exact?.active) return exact;
    if (fallbackFamily) {
      const fallback = await this.defaultForFamily(fallbackFamily);
      if (fallback) return fallback;
    }
    return this.get('OTHER');
  }

  async fromProvider(args: {
    provider: string;
    externalCode: string | number;
    externalSubCode?: string | number | null;
  }): Promise<ProviderSportResolution | null> {
    const externalCode = this.normalizeExternal(args.externalCode);
    const externalSubCode = this.normalizeExternal(args.externalSubCode ?? '');
    const mapping = await this.catalog.findMappingFirst({
      where: {
        provider: args.provider as ThirdPartyProvider,
        externalCode,
        externalSubCode: { in: [externalSubCode, ''] },
        direction: { in: ['IMPORT', 'BOTH'] },
        active: true,
        sport: { active: true },
      },
      include: { sport: true },
      orderBy: [
        { externalSubCode: externalSubCode ? 'desc' : 'asc' },
        { priority: 'desc' },
      ],
    });
    if (!mapping) return null;
    return {
      sport: mapping.sport,
      externalCode: mapping.externalCode,
      externalSubCode: mapping.externalSubCode,
      exact: mapping.externalSubCode === externalSubCode,
      metadata: mapping.metadata,
    };
  }

  async toProvider(args: {
    provider: string;
    subSportType?: string | null;
    sportCode?: string | null;
    family?: SportFamily | null;
    direction?: Extract<SportMappingDirection, 'EXPORT' | 'BOTH'>;
    /** 精确小类存在但 provider 无映射时，是否允许退回 family 默认映射。 */
    allowFamilyFallback?: boolean;
  }): Promise<ProviderSportResolution | null> {
    const requestedCode = args.subSportType ?? args.sportCode;
    const sport = await this.resolve(
      requestedCode,
      requestedCode && args.allowFamilyFallback === false ? null : args.family,
    );
    if (!sport) return null;
    let mapping = await this.findExportMapping(args.provider, sport.code);
    let exact = true;
    if (!mapping && sport.family && args.allowFamilyFallback !== false) {
      const fallback = await this.defaultForFamily(sport.family);
      if (fallback && fallback.code !== sport.code) {
        mapping = await this.findExportMapping(args.provider, fallback.code);
        exact = false;
      }
    }
    if (!mapping) return null;
    return {
      sport,
      externalCode: mapping.externalCode,
      externalSubCode: mapping.externalSubCode,
      exact,
      metadata: mapping.metadata,
    };
  }

  private findExportMapping(provider: string, sportCode: string) {
    return this.catalog.findMappingFirst({
      where: {
        provider: provider as ThirdPartyProvider,
        sportCode,
        direction: { in: ['EXPORT', 'BOTH'] },
        active: true,
      },
      orderBy: [{ priority: 'desc' }, { externalCode: 'asc' }],
    });
  }

  private normalizeCode(value: string) {
    return value
      .trim()
      .replace(/[\s-]+/g, '_')
      .toUpperCase();
  }

  private normalizeExternal(value: string | number) {
    return String(value)
      .trim()
      .replace(/[\s-]+/g, '_')
      .toUpperCase();
  }
}
