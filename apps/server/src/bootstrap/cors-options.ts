import {
  ACQUISITION_SOURCE_HEADER,
  REGISTRATION_PLATFORM_HEADER,
} from '@shared/registration-attribution';

export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'X-Region',
  'Accept',
  'x-lang',
  'baggage',
  'sentry-trace',
  'traceparent',
  'tracestate',
  'X-Client-Trace-Id',
  'x-client-trace-id',
  'Idempotency-Key',
  'X-Public-Review-Admission',
  'X-Public-Demo-Token',
  'MCP-Protocol-Version',
  'Mcp-Session-Id',
  'Last-Event-ID',
  REGISTRATION_PLATFORM_HEADER,
  ACQUISITION_SOURCE_HEADER,
] as const;
