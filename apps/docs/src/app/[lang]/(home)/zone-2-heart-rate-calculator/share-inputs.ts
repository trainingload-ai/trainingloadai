import {
  parsePositiveNumber,
  type AgeFormulaKey,
  type Zone2Method,
} from "@/lib/zone-2-heart-rate";

export type Zone2Inputs = {
  method: Zone2Method;
  maxHr: string;
  restHr: string;
  lthr: string;
  age: string;
  formula: AgeFormulaKey;
  example: boolean;
};

export const EMPTY_ZONE2_INPUTS: Zone2Inputs = {
  method: "maxHr",
  maxHr: "",
  restHr: "",
  lthr: "",
  age: "",
  formula: "tanaka",
  example: false,
};

export const ZONE2_EXAMPLE: Zone2Inputs = {
  method: "maxHr",
  maxHr: "190",
  restHr: "",
  lthr: "",
  age: "",
  formula: "tanaka",
  example: true,
};

const METHODS = new Set<Zone2Method>(["maxHr", "hrr", "lthr", "age"]);
const FORMULAS = new Set<AgeFormulaKey>(["tanaka", "fox"]);
const FIELD_LIMIT = 32;
const TOTAL_LIMIT = 180;
const ZONE2_KEYS = [
  "model",
  "method",
  "maxHr",
  "restHr",
  "lthr",
  "age",
  "formula",
  "example",
] as const;

function readField(value: string | string[] | undefined) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (text.length > FIELD_LIMIT || parsePositiveNumber(text) == null) return "";
  return text;
}

export function readZone2Inputs(
  params: Record<string, string | string[] | undefined>,
): Zone2Inputs {
  const combined = ZONE2_KEYS.map((key) =>
    typeof params[key] === "string" ? params[key] : "",
  ).join("");
  if (combined.length > TOTAL_LIMIT) return EMPTY_ZONE2_INPUTS;

  const modelRaw = typeof params.model === "string" ? params.model : "";
  const methodRaw = typeof params.method === "string" ? params.method : "";
  const formulaRaw = typeof params.formula === "string" ? params.formula : "";
  const normalizedModel = modelRaw === "karvonen" ? "hrr" : modelRaw;
  const method = METHODS.has(normalizedModel as Zone2Method)
    ? (normalizedModel as Zone2Method)
    : METHODS.has(methodRaw as Zone2Method)
      ? (methodRaw as Zone2Method)
      : EMPTY_ZONE2_INPUTS.method;
  const inputs: Zone2Inputs = {
    method,
    maxHr: readField(params.maxHr),
    restHr: readField(params.restHr),
    lthr: readField(params.lthr),
    age: readField(params.age),
    formula: FORMULAS.has(formulaRaw as AgeFormulaKey)
      ? (formulaRaw as AgeFormulaKey)
      : EMPTY_ZONE2_INPUTS.formula,
    example: params.example === "1",
  };
  const active =
    inputs.method === "maxHr"
      ? Boolean(inputs.maxHr)
      : inputs.method === "hrr"
        ? Boolean(inputs.maxHr && inputs.restHr)
        : inputs.method === "lthr"
          ? Boolean(inputs.lthr)
          : Boolean(inputs.age);
  if (!active) inputs.example = false;
  return inputs;
}

export function buildZone2ShareSearch(
  currentSearch: string,
  state: Zone2Inputs,
) {
  const params = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
  );
  for (const key of ZONE2_KEYS) params.delete(key);
  const activeValues =
    state.method === "hrr"
      ? [state.maxHr.trim(), state.restHr.trim()]
      : [
          state.method === "maxHr"
            ? state.maxHr.trim()
            : state.method === "lthr"
              ? state.lthr.trim()
              : state.age.trim(),
        ];
  if (activeValues.some((value) => parsePositiveNumber(value) == null)) {
    const query = params.toString();
    return query ? `?${query}` : "";
  }
  params.set("model", state.method);
  params.set("formula", state.formula);
  if (state.method === "maxHr" || state.method === "hrr") {
    params.set("maxHr", state.maxHr.trim());
  }
  if (state.method === "hrr") params.set("restHr", state.restHr.trim());
  if (state.method === "lthr") params.set("lthr", state.lthr.trim());
  if (state.method === "age") params.set("age", state.age.trim());
  if (state.example) params.set("example", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}
