import {
  LactateInputError,
  validateLactateInput,
  type LactateAnalysis,
  type LactateSport,
  type LactateStage,
} from "@trainingloadai/shared/lactate-analysis";

export type LactateUnit = "watts" | "kmh" | "pace_km" | "pace_mile";
export type LactateDraft = {
  intensity: string;
  lactate: string;
  heartRate: string;
};
export type LactateRecording = {
  headers: string[];
  rows: string[][];
  suggested: { intensity: number; lactate: number; heartRate: number };
};
export const LACTATE_FILE_BYTES = 256 * 1024;
export const LACTATE_TEMPLATE =
  "intensity,lactate,heart_rate\n100,1.0,110\n125,1.1,120\n150,1.3,130\n175,1.8,140\n200,2.6,150\n225,4.2,160\n250,6.8,170\n";

export class RecordingError extends Error {
  constructor(
    public readonly code:
      | "file_too_large"
      | "parse_failed"
      | "invalid_input"
      | "too_many_rows"
      | "column_mapping",
    public readonly row?: number,
  ) {
    super(code);
    this.name = "RecordingError";
  }
}

/** Parse quoted CSV/TSV without executing or logging any cell content. */
export function parseLactateRecording(text: string): LactateRecording {
  if (new TextEncoder().encode(text).length > LACTATE_FILE_BYTES)
    throw new RecordingError("file_too_large");
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (raw.split("\n").length > 100) throw new RecordingError("too_many_rows");
  const separator = raw.split("\n", 1)[0]!.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  const pushCell = () => {
    row.push(cell.trim());
    cell = "";
    closedQuote = false;
    if (row.length > 16) throw new RecordingError("parse_failed");
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (quoted) {
      if (char === '"' && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else cell += char;
    } else if (char === separator) pushCell();
    else if (char === "\n") pushRow();
    else if (char === '"' && !cell && !closedQuote) quoted = true;
    else if (closedQuote && char.trim())
      throw new RecordingError("parse_failed");
    else cell += char;
  }
  if (quoted) throw new RecordingError("parse_failed");
  if (cell || row.length) pushRow();
  if (!rows.length || rows.some((line) => line.length !== rows[0]!.length))
    throw new RecordingError("parse_failed");
  const first = rows[0]!;
  const hasHeader =
    first.some((value) => /[a-df-zA-DF-Z\u3400-\u9fff]/.test(value)) &&
    !first.some((value) =>
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$|^\d+:[0-5]\d(?:\.\d+)?$/i.test(
        value,
      ),
    );
  const headers = hasHeader ? first : first.map((_, i) => String(i + 1));
  const data = hasHeader ? rows.slice(1) : rows;
  if (!data.length) throw new RecordingError("invalid_input");
  const find = (pattern: RegExp, fallback: number) => {
    const index = headers.findIndex((value) => pattern.test(value));
    return index < 0 ? fallback : index;
  };
  return {
    headers,
    rows: data,
    suggested: {
      intensity: find(/intensity|power|speed|pace|功率|速度|配速/i, 0),
      lactate: find(/lactate|乳酸/i, 1),
      heartRate: find(/heart|^hr$|心率/i, headers.length > 2 ? 2 : -1),
    },
  };
}

export function mapLactateRecording(
  recording: LactateRecording,
  mapping: LactateRecording["suggested"],
): LactateDraft[] {
  const required = [mapping.intensity, mapping.lactate];
  const selected = [
    ...required,
    ...(mapping.heartRate < 0 ? [] : [mapping.heartRate]),
  ];
  if (
    selected.some(
      (index) =>
        !Number.isInteger(index) ||
        index < 0 ||
        index >= recording.headers.length,
    ) ||
    new Set(selected).size !== selected.length
  )
    throw new RecordingError("column_mapping");
  return recording.rows.map((row) => ({
    intensity: row[mapping.intensity]!,
    lactate: row[mapping.lactate]!,
    heartRate: mapping.heartRate < 0 ? "" : row[mapping.heartRate]!,
  }));
}

function numberFromText(value: string) {
  const raw = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) return NaN;
  return Number(raw);
}

export function intensityFromText(value: string, unit: LactateUnit) {
  if (unit === "watts" || unit === "kmh") return numberFromText(value);
  if (value.trim() === "0") return 0;
  const match = /^(\d+):([0-5]\d(?:\.\d+)?)$/.exec(value.trim());
  const seconds = match
    ? Number(match[1]) * 60 + Number(match[2])
    : numberFromText(value) * 60;
  return seconds > 0
    ? (unit === "pace_mile" ? 3600 * 1.609344 : 3600) / seconds
    : NaN;
}

export function intensityToText(value: number, unit: LactateUnit) {
  if (value === 0) return "0";
  if (unit === "watts") return value.toFixed(0);
  if (unit === "kmh") return Number(value.toFixed(6)).toString();
  const seconds = Number(
    ((unit === "pace_mile" ? 3600 * 1.609344 : 3600) / value).toFixed(6),
  );
  const remainder = Number((seconds % 60).toFixed(6));
  return `${Math.floor(seconds / 60)}:${remainder < 10 ? "0" : ""}${remainder}`;
}

export function stagesFromDraft(
  rows: LactateDraft[],
  sport: LactateSport,
  unit: LactateUnit,
): LactateStage[] {
  if ((sport === "cycling") !== (unit === "watts"))
    throw new RecordingError("invalid_input");
  const stages = rows.map((row, index) => {
    const intensity = intensityFromText(row.intensity, unit);
    const lactate = numberFromText(row.lactate);
    const heartRate = row.heartRate.trim()
      ? numberFromText(row.heartRate)
      : undefined;
    if (
      !Number.isFinite(intensity) ||
      !Number.isFinite(lactate) ||
      (heartRate !== undefined && !Number.isFinite(heartRate))
    )
      throw new LactateInputError("invalid_value", index);
    return {
      intensity,
      lactate,
      ...(heartRate === undefined ? {} : { heartRate }),
    };
  });
  validateLactateInput({ sport, stages });
  return stages;
}

export function lactateExample(sport: LactateSport): LactateStage[] {
  const intensity =
    sport === "cycling"
      ? [0, 75, 100, 125, 150, 175, 200, 225, 250]
      : [0, 8, 10, 12, 14, 16, 18];
  const lactate =
    sport === "cycling"
      ? [0.9, 1, 1.1, 1.3, 1.7, 2.4, 3.5, 5.2, 7.5]
      : [1, 1.1, 1.2, 1.6, 2.6, 4.6, 8];
  return intensity.map((value, index) => ({
    intensity: value,
    lactate: lactate[index]!,
    heartRate: 90 + index * 11,
  }));
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[,"\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function lactateResultCsv(analysis: LactateAnalysis) {
  const rows: unknown[][] = [
    ["schema_version", analysis.schemaVersion],
    ["engine_version", analysis.engineVersion],
    ["reference_commit", analysis.referenceCommit],
    ["analysis_status", analysis.status],
    ["sport", analysis.sport],
    ["intensity_unit", analysis.sport === "cycling" ? "W" : "km/h"],
    ["lt1_method", analysis.selectedPair?.lt1Method],
    ["lt2_method", analysis.selectedPair?.lt2Method],
    ["warnings", analysis.warnings.join(";")],
    [],
    ["stage_intensity", "lactate_mmol_l", "heart_rate_bpm"],
    ...analysis.stages.map((row) => [
      row.intensity,
      row.lactate,
      row.heartRate,
    ]),
    [],
    [
      "method",
      "status",
      "intensity",
      "lactate_mmol_l",
      "heart_rate_bpm",
      "reason_codes",
    ],
    ...analysis.methods.map((method) => [
      method.methodId,
      method.status,
      method.intensity,
      method.lactate,
      method.heartRate,
      method.reasonCodes.join(";"),
    ]),
    [],
    ["zone", "from_intensity", "to_intensity"],
    ...analysis.zones.map((zone) => [zone.zone, zone.from, zone.to]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
