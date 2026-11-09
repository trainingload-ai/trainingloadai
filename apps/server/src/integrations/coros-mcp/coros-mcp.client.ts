import { Injectable } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Ajv from 'ajv';
import type { PersonalRegion } from '@shared/personal-integrations';
import { providerJson } from '../personal/personal-http';
import { PersonalProviderError, record } from '../personal/personal-errors';

export const COROS_ORIGINS = {
  global: 'https://mcp.coros.com',
  cn: 'https://mcpcn.coros.com',
  eu: 'https://mcpeu.coros.com',
  us: 'https://mcpus.coros.com',
} as const;
export const COROS_READ_TOOLS = [
  'querySportRecords',
  'getActivityDetail',
  'queryActivityLapData',
  'queryCustomActivityLapData',
  'queryActivityFitFileDownloadUrls',
  'queryDailyHealthData',
  'querySleepOverview',
  'querySleepHrv',
  'queryAvgHeartRate',
  'queryRestingHeartRate',
  'queryStressLevel',
  'queryStressTimeSeries',
  'queryHealthCheckTimeSeries',
  'queryRecoveryStatus',
  'queryFitnessAssessmentOverview',
  'queryTrainingLoadAssessment',
  'queryUserInfo',
  'queryDevices',
  'queryTrainingSchedule',
  'queryTrainingPlanLibrary',
  'queryTrainingPlanDetails',
  'queryWorkoutLibrary',
  'queryWorkoutDetails',
  'queryScheduledWorkoutDetails',
] as const;
export const COROS_WRITE_TOOLS = [
  'createSingleWorkout',
  'updateWorkoutDetails',
  'scheduleWorkout',
  'createScheduledWorkout',
  'updateScheduledWorkout',
  'createTrainingPlan',
  'updateTrainingPlan',
  'uploadRouteFile',
] as const;
export type CorosCredential = {
  clientId: string;
  clientSecret?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};
export type CorosTool = { name: string; inputSchema: Record<string, unknown> };

/** The published record window defaults to 20 and has no documented cursor. */
export function corosRecordPageLimit(
  tools: CorosTool[],
  requested = 20,
): number {
  const tool = tools.find((entry) => entry.name === 'querySportRecords');
  const limit = record(record(tool?.inputSchema.properties).limit);
  if (!['integer', 'number'].includes(limit.type))
    throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
  const maximum = limit.maximum ?? 1000;
  const minimum = limit.minimum ?? 1;
  if (
    !Number.isInteger(maximum) ||
    !Number.isInteger(minimum) ||
    minimum < 0 ||
    maximum < minimum ||
    minimum > 20
  )
    throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
  return Math.min(requested, maximum, 1000);
}

/** Only machine-readable content is admitted to the ingest pipeline. */
export function corosStructuredResult(value: unknown): unknown {
  const result = record(value);
  if (result.isError) throw new PersonalProviderError('PROVIDER_TOOL_FAILED');
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = Array.isArray(result.content)
    ? result.content
        .filter((block) => block?.type === 'text')
        .map((block) => block.text)
        .join('\n')
    : '';
  try {
    return JSON.parse(text);
  } catch {
    throw new PersonalProviderError('PROVIDER_STRUCTURED_RESULT_UNAVAILABLE');
  }
}

@Injectable()
export class CorosMcpClient {
  origin(region: PersonalRegion) {
    const origin = COROS_ORIGINS[region];
    if (!origin)
      throw new PersonalProviderError(
        'PROVIDER_REGION_INVALID',
        undefined,
        400,
      );
    return origin;
  }
  async discover(region: PersonalRegion) {
    // Select a concrete region. The global endpoint may redirect to one; never send credentials across it.
    const resolved = region === 'global' ? 'us' : region;
    const origin = this.origin(resolved);
    const metadata = record(
      await providerJson(
        new URL('/.well-known/oauth-authorization-server', origin),
      ),
    );
    const endpoints = [
      'authorization_endpoint',
      'token_endpoint',
      'registration_endpoint',
      'revocation_endpoint',
    ];
    if (
      metadata.issuer !== origin ||
      !Array.isArray(metadata.code_challenge_methods_supported) ||
      !metadata.code_challenge_methods_supported.includes('S256')
    )
      throw new PersonalProviderError('PROVIDER_OAUTH_METADATA_INVALID');
    for (const key of endpoints) {
      if (key === 'revocation_endpoint' && !metadata[key]) continue;
      if (
        typeof metadata[key] !== 'string' ||
        new URL(metadata[key]).origin !== origin
      )
        throw new PersonalProviderError('PROVIDER_OAUTH_METADATA_INVALID');
    }
    return { region: resolved as PersonalRegion, origin, metadata };
  }
  async register(region: PersonalRegion, redirectUri: string) {
    const discovered = await this.discover(region);
    const registered = record(
      await providerJson(new URL(discovered.metadata.registration_endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Trainingload.ai Self-host',
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      }),
    );
    if (typeof registered.client_id !== 'string')
      throw new PersonalProviderError('PROVIDER_OAUTH_REGISTRATION_FAILED');
    if (
      registered.token_endpoint_auth_method &&
      registered.token_endpoint_auth_method !== 'none'
    )
      throw new PersonalProviderError('PROVIDER_OAUTH_REGISTRATION_FAILED');
    return { ...discovered, clientId: registered.client_id as string };
  }
  async token(
    region: PersonalRegion,
    clientId: string,
    grant: Record<string, string>,
  ): Promise<CorosCredential> {
    const { origin, metadata } = await this.discover(region);
    const result = record(
      await providerJson(new URL(metadata.token_endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          resource: `${origin}/mcp`,
          ...grant,
        }).toString(),
      }),
    );
    if (
      typeof result.access_token !== 'string' ||
      result.token_type?.toLowerCase() !== 'bearer' ||
      !Number.isFinite(Number(result.expires_in)) ||
      Number(result.expires_in) <= 0
    )
      throw new PersonalProviderError('PROVIDER_OAUTH_TOKEN_INVALID');
    return {
      clientId,
      accessToken: result.access_token,
      refreshToken:
        typeof result.refresh_token === 'string'
          ? result.refresh_token
          : undefined,
      expiresAt: Date.now() + Number(result.expires_in) * 1000,
    };
  }
  async revoke(region: PersonalRegion, credentials: CorosCredential) {
    const { metadata } = await this.discover(region);
    if (!metadata.revocation_endpoint) return false;
    await providerJson(new URL(metadata.revocation_endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        token: credentials.refreshToken ?? credentials.accessToken,
        token_type_hint: credentials.refreshToken
          ? 'refresh_token'
          : 'access_token',
      }).toString(),
    });
    return true;
  }
  private async session<T>(
    region: PersonalRegion,
    token: string,
    work: (client: Client) => Promise<T>,
  ) {
    const origin = this.origin(region === 'global' ? 'us' : region);
    const client = new Client({
      name: 'trainingloadai-selfhost',
      version: '1.1.16',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL('/mcp', origin),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
        },
        reconnectionOptions: {
          maxRetries: 0,
          initialReconnectionDelay: 1000,
          maxReconnectionDelay: 1000,
          reconnectionDelayGrowFactor: 1,
        },
        fetch: async (input, init) => {
          const url = new URL(input);
          if (url.origin !== origin || url.pathname !== '/mcp')
            throw new PersonalProviderError('PROVIDER_ENDPOINT_REJECTED');
          const response = await fetch(input, {
            ...init,
            redirect: 'error',
            signal: AbortSignal.any([
              ...(init?.signal ? [init.signal] : []),
              AbortSignal.timeout(30_000),
            ]),
          });
          let received = 0;
          const bounded = response.body?.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                received += chunk.byteLength;
                if (received > 8 * 1024 * 1024)
                  throw new PersonalProviderError(
                    'PROVIDER_RESPONSE_TOO_LARGE',
                  );
                controller.enqueue(chunk);
              },
            }),
          );
          return new Response(bounded, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        },
      },
    );
    try {
      await client.connect(transport, { timeout: 30_000 });
      return await work(client);
    } catch (error) {
      if (error instanceof PersonalProviderError) throw error;
      const status = record(error).code;
      throw new PersonalProviderError(
        status === 401 || status === 403
          ? 'PROVIDER_AUTH_REQUIRED'
          : status === 429
            ? 'PROVIDER_RATE_LIMITED'
            : 'PROVIDER_MCP_FAILED',
        status === 429 ? 60_000 : undefined,
      );
    } finally {
      await client.close().catch(() => undefined);
    }
  }
  async tools(region: PersonalRegion, token: string): Promise<CorosTool[]> {
    return this.session(region, token, async (client) => {
      const tools: CorosTool[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        const result = await client.listTools(cursor ? { cursor } : undefined, {
          timeout: 30_000,
        });
        tools.push(
          ...result.tools
            .filter((tool) =>
              [...COROS_READ_TOOLS, ...COROS_WRITE_TOOLS].includes(
                tool.name as never,
              ),
            )
            .map((tool) => ({
              name: tool.name,
              inputSchema: tool.inputSchema,
            })),
        );
        cursor = result.nextCursor;
        if (!cursor) return tools;
      }
      throw new PersonalProviderError('PROVIDER_WINDOW_INCOMPLETE');
    });
  }
  async call(
    region: PersonalRegion,
    token: string,
    tool: CorosTool,
    args: Record<string, unknown>,
  ) {
    if (
      ![...COROS_READ_TOOLS, ...COROS_WRITE_TOOLS].includes(tool.name as never)
    )
      throw new PersonalProviderError(
        'PROVIDER_TOOL_NOT_ALLOWED',
        undefined,
        400,
      );
    const ajv = new Ajv({
      strict: false,
      allErrors: false,
      validateFormats: false,
    });
    let valid = false;
    try {
      valid = Boolean(ajv.validate(tool.inputSchema, args));
    } catch {
      throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
    }
    if (!valid)
      throw new PersonalProviderError(
        'PROVIDER_ARGUMENTS_INVALID',
        undefined,
        400,
      );
    return this.session(region, token, async (client) =>
      corosStructuredResult(
        await client.callTool({ name: tool.name, arguments: args }, undefined, {
          timeout: 30_000,
        }),
      ),
    );
  }
}
