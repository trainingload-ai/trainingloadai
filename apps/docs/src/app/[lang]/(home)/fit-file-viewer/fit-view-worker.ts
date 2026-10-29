/// <reference lib="webworker" />

import {
  Decoder,
  Profile,
  Stream,
  type ProfileField,
  type ProfileMesg,
} from "@garmin/fitsdk";
import type {
  FitFieldDescriptor,
  FitFileHeader,
  FitFileIdentity,
  FitFileSummary,
  FitMessage,
  FitMessageGroup,
  FitPageResult,
  FitValue,
  FitViewModel,
  FitWorkerRequest,
  FitWorkerResponse,
} from "./fit-view-model";
import { buildFitVisualization } from "./fit-visualization-model";

const worker =
  typeof self === "undefined"
    ? null
    : (self as unknown as DedicatedWorkerGlobalScope);
let currentModel: FitViewModel | null = null;
let currentMessages = new Map<string, FitMessage[]>();

const MESSAGE_GROUP_ORDER = [
  "fileIdMesgs",
  "fileCreatorMesgs",
  "activityMesgs",
  "sessionMesgs",
  "lapMesgs",
  "splitSummaryMesgs",
  "splitMesgs",
  "lengthMesgs",
  "recordMesgs",
  "eventMesgs",
  "deviceInfoMesgs",
  "sportMesgs",
  "sourceMesgs",
  "gpsMetadataMesgs",
  "workoutMesgs",
  "workoutSessionMesgs",
  "workoutStepMesgs",
  "courseMesgs",
  "coursePointMesgs",
  "developerDataIdMesgs",
  "fieldDescriptionMesgs",
] as const;

const messageOrder = new Map<string, number>(
  MESSAGE_GROUP_ORDER.map((key, index) => [key, index]),
);
const profileMessagesByKey = new Map<string, ProfileMesg>(
  Object.values(Profile.messages).map((message) => [
    message.messagesKey,
    message,
  ]),
);

function post(response: FitWorkerResponse) {
  worker?.postMessage(response);
}

function safeValue(value: unknown, seen = new WeakSet<object>()): FitValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (ArrayBuffer.isView(value)) {
    return Array.from(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }
  if (Array.isArray(value)) return value.map((item) => safeValue(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result: Record<string, FitValue> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = safeValue(item, seen);
    }
    seen.delete(value);
    return result;
  }
  return String(value);
}

function asMessage(value: unknown): FitMessage {
  const safe = safeValue(value);
  return safe && typeof safe === "object" && !Array.isArray(safe)
    ? safe
    : { value: safe };
}

function displayGroupName(key: string) {
  const withoutSuffix = key.replace(/Mesgs$/, "");
  return withoutSuffix
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase())
    .replace(/\bId\b/g, "ID")
    .replace(/\bGps\b/g, "GPS");
}

function unitLabel(units: string | string[]) {
  const values = Array.isArray(units) ? units : [units];
  const present = values.filter(Boolean);
  return present.length > 0 ? [...new Set(present)].join(" / ") : null;
}

function findProfileField(
  message: ProfileMesg,
  key: string,
): { field: ProfileField; units: string | string[] } | null {
  const fields = Object.values(message.fields);
  const field = fields.find((candidate) => candidate.name === key);
  if (field) return { field, units: field.units };

  for (const candidate of fields) {
    const subField = candidate.subFields.find(
      (candidateSubField) => candidateSubField.name === key,
    );
    if (subField) return { field: candidate, units: subField.units };
  }
  return null;
}

function describeField(group: string, key: string): FitFieldDescriptor {
  const numericField = /^\d+$/.test(key) ? Number(key) : null;
  if (numericField != null) {
    return {
      key,
      number: numericField,
      units: null,
      type: null,
      source: "unknown",
    };
  }
  if (key === "developerFields") {
    return {
      key,
      number: null,
      units: null,
      type: null,
      source: "developer",
    };
  }

  const message = profileMessagesByKey.get(group);
  const match = message ? findProfileField(message, key) : null;
  if (match) {
    return {
      key,
      number: match.field.num,
      units: unitLabel(match.units),
      type: match.field.type,
      source: "profile",
    };
  }
  return {
    key,
    number: null,
    units: null,
    type: null,
    source: "derived",
  };
}

function collectFields(group: string, rows: FitMessage[]) {
  const fields = new Set<string>();
  for (const row of rows) {
    for (const field of Object.keys(row)) fields.add(field);
  }
  return [...fields].map((field) => describeField(group, field));
}

function groupFields(group: string, fallbackRows: FitMessage[]) {
  return (
    currentModel?.groups.find((candidate) => candidate.key === group)?.fields ??
    collectFields(group, fallbackRows)
  );
}

function compareGroups(left: FitMessageGroup, right: FitMessageGroup) {
  if (left.profileDefined !== right.profileDefined) {
    return left.profileDefined ? -1 : 1;
  }
  const leftOrder = messageOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = messageOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  if (!left.profileDefined && left.messageNumber !== right.messageNumber) {
    return (
      (left.messageNumber ?? Number.MAX_SAFE_INTEGER) -
      (right.messageNumber ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return left.label.localeCompare(right.label);
}

function scalarString(value: FitValue | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function scalarNumber(value: FitValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function groupRows(key: string) {
  return currentMessages.get(key) ?? [];
}

function firstMessage(...keys: string[]): FitMessage | undefined {
  for (const key of keys) {
    const message = groupRows(key)[0];
    if (message) return message;
  }
  return undefined;
}

function parseHeader(bytes: Uint8Array): FitFileHeader {
  const headerSize = bytes[0] ?? 0;
  const protocolByte = bytes[1] ?? 0;
  const profileRaw = bytes.length >= 4 ? bytes[2] | (bytes[3] << 8) : 0;
  const dataSize =
    bytes.length >= 8
      ? new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        ).getUint32(4, true)
      : 0;
  return {
    headerSize,
    protocolVersion: `${protocolByte >> 4}.${protocolByte & 0x0f}`,
    profileVersion: `${Math.floor(profileRaw / 100)}.${profileRaw % 100}`,
    dataSize,
    signature: String.fromCharCode(...bytes.slice(8, 12)),
  };
}

function buildIdentity(): FitFileIdentity {
  const fileId = firstMessage("fileIdMesgs") ?? {};
  const session = firstMessage("sessionMesgs") ?? {};
  return {
    type: scalarString(fileId.type),
    manufacturer: scalarString(fileId.manufacturer),
    product: scalarString(fileId.garminProduct ?? fileId.product),
    serialNumber: scalarString(fileId.serialNumber),
    createdAt: scalarString(fileId.timeCreated),
    sport: scalarString(session.sport),
    subSport: scalarString(session.subSport),
  };
}

function buildSummary(): FitFileSummary {
  const session = firstMessage("sessionMesgs") ?? {};
  const activity = firstMessage("activityMesgs") ?? {};
  return {
    startedAt: scalarString(session.startTime ?? activity.timestamp),
    elapsedSeconds: scalarNumber(
      session.totalElapsedTime ?? activity.totalTimerTime,
    ),
    timerSeconds: scalarNumber(
      session.totalTimerTime ?? activity.totalTimerTime,
    ),
    distanceMeters: scalarNumber(session.totalDistance),
    calories: scalarNumber(session.totalCalories),
    averageHeartRate: scalarNumber(session.avgHeartRate),
    maxHeartRate: scalarNumber(session.maxHeartRate),
    averagePower: scalarNumber(session.avgPower),
    maxPower: scalarNumber(session.maxPower),
    laps: groupRows("lapMesgs").length,
    records: groupRows("recordMesgs").length,
    sessions: groupRows("sessionMesgs").length,
  };
}

function parseFile(
  fileName: string,
  fileSize: number,
  buffer: ArrayBuffer,
): FitViewModel {
  const bytes = new Uint8Array(buffer);
  const stream = Stream.fromArrayBuffer(buffer);
  const decoder = new Decoder(stream);
  const isFit = decoder.isFIT();
  if (!isFit) throw new Error("INVALID_FIT");

  const integrityPassed = decoder.checkIntegrity();
  let definitionCount = 0;
  let developerFieldCount = 0;
  const decoded = decoder.read({
    includeUnknownData: true,
    mesgDefinitionListener: () => {
      definitionCount += 1;
    },
    fieldDescriptionListener: () => {
      developerFieldCount += 1;
    },
  });

  currentMessages = new Map();
  const groups: FitMessageGroup[] = [];
  const decodedMessages = decoded.messages as unknown as Record<
    string,
    unknown
  >;
  for (const [key, rawRows] of Object.entries(decodedMessages)) {
    const rows = (Array.isArray(rawRows) ? rawRows : [rawRows]).map(asMessage);
    if (rows.length === 0) continue;
    const profileMessage = profileMessagesByKey.get(key);
    const rawMessageNumber = /^\d+$/.test(key) ? Number(key) : null;
    currentMessages.set(key, rows);
    groups.push({
      key,
      label: displayGroupName(key),
      messageNumber: profileMessage?.num ?? rawMessageNumber,
      profileDefined: profileMessage != null,
      count: rows.length,
      fields: collectFields(key, rows),
    });
  }
  groups.sort(compareGroups);

  const decoderErrors = decoded.errors.map((error) =>
    error instanceof Error ? error.message : String(error),
  );
  const totalMessages = groups.reduce((total, group) => total + group.count, 0);
  const model: FitViewModel = {
    fileName,
    fileSize,
    header: parseHeader(bytes),
    identity: buildIdentity(),
    summary: buildSummary(),
    visualization: buildFitVisualization(groupRows("recordMesgs")),
    diagnostics: {
      isFit,
      integrityPassed,
      decoderErrors,
      definitionCount,
      developerFieldCount,
      totalMessages,
      decodedWith: "Garmin FIT JavaScript SDK",
      sdkProfileVersion: `${Profile.version.major}.${Profile.version.minor}.${Profile.version.patch}`,
    },
    groups,
  };
  currentModel = model;
  return model;
}

function messageMatches(
  row: FitMessage,
  normalizedQuery: string,
  fields: FitFieldDescriptor[],
) {
  if (!normalizedQuery) return true;
  return fields.some((field) => {
    if (field.key.toLocaleLowerCase().includes(normalizedQuery)) return true;
    const value = row[field.key];
    return value != null
      ? JSON.stringify(value).toLocaleLowerCase().includes(normalizedQuery)
      : false;
  });
}

function getPage(
  group: string,
  query: string,
  page: number,
  pageSize: number,
  includeUnknownData = true,
): FitPageResult {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const allRows = groupRows(group);
  const fields = groupFields(group, allRows).filter(
    (field) => includeUnknownData || field.source !== "unknown",
  );
  const filtered = normalizedQuery
    ? allRows.filter((row) => messageMatches(row, normalizedQuery, fields))
    : allRows;
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  return {
    group,
    query,
    page: safePage,
    pageSize,
    total: filtered.length,
    fields,
    rows,
  };
}

function csvCell(value: FitValue | undefined) {
  let text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (typeof value === "string" && /^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function exportData(format: "csv" | "json", group?: string) {
  if (!currentModel) throw new Error("NO_FILE");
  const baseName = currentModel.fileName.replace(/\.fit$/i, "") || "fit-file";
  if (format === "json") {
    const messages = Object.fromEntries(currentMessages);
    return {
      content: JSON.stringify({ ...currentModel, messages }, null, 2),
      mimeType: "application/json;charset=utf-8",
      fileName: `${baseName}.decoded.json`,
    };
  }

  if (!group || !currentMessages.has(group)) throw new Error("NO_GROUP");
  const rows = groupRows(group);
  const fields = groupFields(group, rows);
  const lines = [
    fields.map((field) => csvCell(field.key)).join(","),
    ...rows.map((row) =>
      fields.map((field) => csvCell(row[field.key])).join(","),
    ),
  ];
  return {
    content: `\uFEFF${lines.join("\n")}`,
    mimeType: "text/csv;charset=utf-8",
    fileName: `${baseName}.${group.replace(/Mesgs$/, "")}.csv`,
  };
}

worker?.addEventListener("message", (event: MessageEvent<FitWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "parse") {
      const model = parseFile(
        request.fileName,
        request.fileSize,
        request.buffer,
      );
      post({ id: request.id, type: "parsed", model });
      return;
    }
    if (request.type === "page") {
      post({
        id: request.id,
        type: "page",
        result: getPage(
          request.group,
          request.query,
          request.page,
          request.pageSize,
          request.includeUnknownData,
        ),
      });
      return;
    }
    post({
      id: request.id,
      type: "export",
      ...exportData(request.format, request.group),
    });
  } catch (error) {
    post({
      id: request.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export {
  exportData as exportFitDataForTest,
  getPage as getFitPageForTest,
  describeField as describeFitFieldForTest,
  parseFile as parseFitFileForTest,
};
