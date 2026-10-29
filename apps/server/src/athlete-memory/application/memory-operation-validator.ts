import {
  MEMORY_CATEGORIES,
  MEMORY_DECAY_PROFILES,
  MEMORY_EPISTEMIC_STATUSES,
  MEMORY_IGNORE_REASONS,
  MEMORY_KINDS,
  MEMORY_OPERATIONS,
  MEMORY_TIME_PRECISIONS,
  type MemoryCategory,
  type MemoryFactCandidate,
  type MemoryOperation,
} from '../domain/memory-operation';
import {
  assertIanaTimezone,
  assertMemoryTimeRange,
  MemoryValidationError,
  parseMemoryInstant,
} from '../domain/memory-time';

const INSTRUCTION_LIKE = [
  /ignore\b.{0,40}\b(instructions?|rules?|prompts?)/i,
  /system\s*prompt/i,
  /tool[_ -]?call/i,
  /执行.{0,8}(命令|指令|工具)/i,
  /忽略.{0,12}(规则|指令|提示词)/i,
];
const SECRET_KEY = /(password|passwd|secret|token|api[_-]?key|credential)/i;
const SECRET_MATERIAL = [
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|pk)-[A-Za-z0-9_-]{20,}\b/,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
];

// 这里是 LLM 之后的信任边界：Judge 只负责语义判断，只有经过本文件
// 归一化并验证通过的字段才允许进入持久层。

function record(value: unknown, field = 'operation'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MemoryValidationError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new MemoryValidationError(`${field} is not supported`);
  }
  return value as T[number];
}

function boundedString(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) {
    throw new MemoryValidationError(`${field} must be 1-${max} characters`);
  }
  return text;
}

function safeJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new MemoryValidationError('value must be JSON serializable');
  }
  if (!serialized || serialized.length > 2_000) {
    throw new MemoryValidationError('value is too large');
  }
  const walk = (node: unknown): void => {
    if (
      typeof node === 'string' &&
      SECRET_MATERIAL.some((pattern) => pattern.test(node))
    ) {
      throw new MemoryValidationError('value contains credential material');
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    for (const [key, child] of Object.entries(node)) {
      if (SECRET_KEY.test(key)) {
        throw new MemoryValidationError(
          'value contains a disallowed secret field',
        );
      }
      walk(child);
    }
  };
  walk(value);
  return JSON.parse(serialized);
}

export function assertSafeMemoryClaim(value: unknown): string {
  const claim = boundedString(value, 'claim', 320);
  if (claim.includes('\u0000') || INSTRUCTION_LIKE.some((r) => r.test(claim))) {
    throw new MemoryValidationError('claim contains instruction-like content');
  }
  if (SECRET_MATERIAL.some((pattern) => pattern.test(claim))) {
    throw new MemoryValidationError('claim contains credential material');
  }
  return claim.replace(/\s+/g, ' ');
}

function optionalString(value: unknown, max: number): string | undefined {
  if (value == null || value === '') return undefined;
  return boundedString(value, 'text', max);
}

function parseCandidate(args: {
  value: unknown;
  assertedAt: Date;
  timezone: string;
}): MemoryFactCandidate {
  const value = record(args.value, 'candidate');
  const category = enumValue(
    value.category,
    MEMORY_CATEGORIES,
    'category',
  ) as MemoryCategory;
  const decayProfile = enumValue(
    value.decayProfile,
    MEMORY_DECAY_PROFILES,
    'decayProfile',
  );
  const eventStart = parseMemoryInstant(value.eventStart, 'eventStart');
  const eventEnd = parseMemoryInstant(value.eventEnd, 'eventEnd');
  const validFrom = parseMemoryInstant(value.validFrom, 'validFrom');
  const validUntil = parseMemoryInstant(value.validUntil, 'validUntil');
  const reviewAfter = parseMemoryInstant(value.reviewAfter, 'reviewAfter');
  assertMemoryTimeRange({
    eventStart,
    eventEnd,
    validFrom,
    validUntil,
    assertedAt: args.assertedAt,
  });
  if (decayProfile === 'UNTIL_DATE' && !validUntil) {
    throw new MemoryValidationError('UNTIL_DATE requires validUntil');
  }
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new MemoryValidationError('confidence must be between 0 and 1');
  }
  const timeText = optionalString(value.timeText, 120);
  return {
    kind: enumValue(value.kind, MEMORY_KINDS, 'kind'),
    category,
    claim: assertSafeMemoryClaim(value.claim),
    ...(value.value === undefined ? {} : { value: safeJsonValue(value.value) }),
    ...(eventStart ? { eventStart: eventStart.toISOString() } : {}),
    ...(eventEnd ? { eventEnd: eventEnd.toISOString() } : {}),
    ...(timeText ? { timeText } : {}),
    timePrecision: enumValue(
      value.timePrecision,
      MEMORY_TIME_PRECISIONS,
      'timePrecision',
    ),
    epistemicStatus: enumValue(
      value.epistemicStatus,
      MEMORY_EPISTEMIC_STATUSES,
      'epistemicStatus',
    ),
    confidence,
    decayProfile,
    ...(validFrom ? { validFrom: validFrom.toISOString() } : {}),
    ...(validUntil ? { validUntil: validUntil.toISOString() } : {}),
    ...(reviewAfter ? { reviewAfter: reviewAfter.toISOString() } : {}),
  };
}

export function validateMemoryOperations(args: {
  raw: unknown;
  assertedAt: Date;
  timezone: string;
}): MemoryOperation[] {
  assertIanaTimezone(args.timezone);
  const root = record(args.raw, 'decision');
  const rawOperations = root.operations;
  if (!Array.isArray(rawOperations) || rawOperations.length === 0) {
    throw new MemoryValidationError('decision.operations must not be empty');
  }
  if (rawOperations.length > 6) {
    throw new MemoryValidationError('decision contains too many operations');
  }
  const operations = rawOperations.map((raw): MemoryOperation => {
    const item = record(raw);
    const operation = enumValue(item.operation, MEMORY_OPERATIONS, 'operation');
    if (operation === 'IGNORE') {
      return {
        operation,
        reasonCode: enumValue(
          item.reasonCode,
          MEMORY_IGNORE_REASONS,
          'reasonCode',
        ),
      };
    }
    if (operation === 'NEEDS_LOOKUP') {
      const lookup = record(item.lookup, 'lookup');
      const categories = Array.isArray(lookup.categories)
        ? lookup.categories.map((category) =>
            enumValue(category, MEMORY_CATEGORIES, 'lookup.categories'),
          )
        : undefined;
      if (categories && categories.length > 8) {
        throw new MemoryValidationError(
          'lookup.categories contains too many values',
        );
      }
      const eventFrom = parseMemoryInstant(
        lookup.eventFrom,
        'lookup.eventFrom',
      );
      const eventTo = parseMemoryInstant(lookup.eventTo, 'lookup.eventTo');
      if (eventFrom && eventTo && eventTo < eventFrom) {
        throw new MemoryValidationError('lookup event range is invalid');
      }
      return {
        operation,
        lookup: {
          query: boundedString(lookup.query, 'lookup.query', 200),
          ...(categories?.length ? { categories } : {}),
          ...(eventFrom ? { eventFrom: eventFrom.toISOString() } : {}),
          ...(eventTo ? { eventTo: eventTo.toISOString() } : {}),
        },
      };
    }
    const reasonCode = boundedString(item.reasonCode, 'reasonCode', 80);
    if (operation === 'CREATE') {
      return {
        operation,
        reasonCode,
        ...parseCandidate({
          value: item,
          assertedAt: args.assertedAt,
          timezone: args.timezone,
        }),
      };
    }
    const targetFactId = boundedString(item.targetFactId, 'targetFactId', 128);
    const replacement = item.replacement
      ? parseCandidate({
          value: item.replacement,
          assertedAt: args.assertedAt,
          timezone: args.timezone,
        })
      : undefined;
    if ((operation === 'REFINE' || operation === 'SUPERSEDE') && !replacement) {
      throw new MemoryValidationError(`${operation} requires replacement`);
    }
    return {
      operation,
      targetFactId,
      ...(replacement ? { replacement } : {}),
      reasonCode,
    };
  });
  if (
    operations.some((operation) => operation.operation === 'IGNORE') &&
    operations.length !== 1
  ) {
    throw new MemoryValidationError('IGNORE must be the only operation');
  }
  if (
    operations.some((operation) => operation.operation === 'NEEDS_LOOKUP') &&
    operations.length !== 1
  ) {
    throw new MemoryValidationError('NEEDS_LOOKUP must be the only operation');
  }
  return operations;
}
