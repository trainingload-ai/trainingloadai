import { Injectable } from '@nestjs/common';
import type { PersonalRegion } from '@shared/personal-integrations';
import { providerFetch, providerJson } from '../personal/personal-http';
import {
  PersonalProviderError,
  record,
  requireId,
} from '../personal/personal-errors';
import { localToday } from '../personal/personal-dates';

export type GarminCredential = {
  apiKey: string;
  token?: string;
  expiresAt?: number;
};
export const GARMIN_ORIGINS = {
  global: 'https://personal.connectapi.garmin.com',
  cn: 'https://personal.connectapi.garmin.cn',
} as const;

@Injectable()
export class GarminPersonalClient {
  origin(region: PersonalRegion): string {
    if (region !== 'global' && region !== 'cn')
      throw new PersonalProviderError(
        'PROVIDER_REGION_INVALID',
        undefined,
        400,
      );
    return GARMIN_ORIGINS[region];
  }
  async exchange(
    region: PersonalRegion,
    apiKey: string,
  ): Promise<GarminCredential> {
    const { bytes } = await providerFetch(
      new URL(
        '/personalapitoken-service/personal-api/personal-api-key/token',
        this.origin(region),
      ),
      {
        method: 'POST',
        headers: { Authorization: `ApiKey ${apiKey}`, Accept: 'text/plain' },
      },
      32_768,
    );
    const token = bytes.toString('utf8').trim();
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
      throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
    let exp: number;
    try {
      exp =
        Number(
          JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
            .exp,
        ) * 1000;
    } catch {
      throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
    }
    if (!Number.isFinite(exp) || exp <= Date.now())
      throw new PersonalProviderError('PROVIDER_AUTH_REQUIRED', undefined, 401);
    // exp only schedules renewal. The profile request below verifies actual authorization.
    return { apiKey, token, expiresAt: Math.min(exp, Date.now() + 86400_000) };
  }
  async get(
    region: PersonalRegion,
    token: string,
    path: string,
    query: Record<string, string | number> = {},
  ) {
    const url = new URL(path, this.origin(region));
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      url.origin !== this.origin(region) ||
      url.username ||
      url.password
    )
      throw new PersonalProviderError(
        'PROVIDER_RESOURCE_UNKNOWN',
        undefined,
        400,
      );
    Object.entries(query).forEach(([key, value]) =>
      url.searchParams.set(key, String(value)),
    );
    return providerJson(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  }
  async profile(region: PersonalRegion, token: string, timezone = 'UTC') {
    const profile = record(
      await this.get(
        region,
        token,
        '/userprofile-service/userprofile/settings',
      ),
    );
    // UserSettingsDTO has no user ID. Read an authenticated daily summary for
    // its documented stable userProfileId; never invent identity from displayName
    // or unverified JWT claims. This also works on days without recorded exercise.
    const identity = record(
      await this.get(region, token, '/usersummary-service/usersummary/daily', {
        calendarDate: localToday(timezone),
      }),
    );
    const accountId = requireId(identity.userProfileId);
    return { accountId, profile };
  }
  async activities(
    region: PersonalRegion,
    token: string,
    startDate: string,
    endDate: string,
    offset: number,
  ) {
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new PersonalProviderError(
        'PROVIDER_ARGUMENTS_INVALID',
        undefined,
        400,
      );
    const response = await this.get(
      region,
      token,
      '/activitylist-service/activities/search/activities',
      { start: offset, limit: 99, startDate, endDate, sortOrder: 'asc' },
    );
    if (!Array.isArray(response))
      throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
    return response.map((value) => {
      const item = record(value);
      const local =
        typeof item.startTimeLocal === 'string'
          ? item.startTimeLocal
          : typeof item.startTimeGMT === 'string'
            ? item.startTimeGMT
            : '';
      const day = /^(\d{4}-\d{2}-\d{2})/.exec(local)?.[1];
      return {
        id: requireId(item.activityId),
        title:
          typeof item.activityName === 'string'
            ? item.activityName.slice(0, 500)
            : undefined,
        ...(day ? { day } : {}),
      };
    });
  }
  async download(region: PersonalRegion, token: string, id: string) {
    if (!/^\d+$/.test(id))
      throw new PersonalProviderError(
        'PROVIDER_ACTIVITY_ID_INVALID',
        undefined,
        400,
      );
    return (
      await providerFetch(
        new URL(`/download-service/files/activity/${id}`, this.origin(region)),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            // Garmin 406s on Accept: application/zip alone; match Personal/Python clients.
            Accept:
              'application/zip, application/x-zip-compressed, application/octet-stream',
          },
        },
        64 * 1024 * 1024,
      )
    ).bytes;
  }
}
