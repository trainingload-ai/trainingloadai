import {
  isMaxHrFormulaKey,
  parseMaxHrAge,
  parseMeasuredMaxHr,
  type MaxHrFormulaChoice,
  type MaxHrSex,
} from "@/lib/max-heart-rate";

export type MaxHeartRateInputs = {
  age: string;
  sex: MaxHrSex;
  formula: MaxHrFormulaChoice;
  measured: string;
  measuredSource?: "observed";
  example: boolean;
};

const EMPTY: MaxHeartRateInputs = {
  age: "",
  sex: "unspecified",
  formula: "default",
  measured: "",
  example: false,
};

const VALUE_LIMIT = 32;
const TOTAL_LIMIT = 200;

function readText(value: string | string[] | undefined) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length <= VALUE_LIMIT ? text : "";
}

export function readMaxHeartRateInputs(
  params: Record<string, string | string[] | undefined>,
): MaxHeartRateInputs {
  const joined = ["age", "sex", "formula", "measured", "example", "source"]
    .map((key) => (typeof params[key] === "string" ? params[key] : ""))
    .join("");
  if (joined.length > TOTAL_LIMIT) return EMPTY;

  if (params.example === "1") {
    const formulaRaw = readText(params.formula);
    const sexRaw = readText(params.sex);
    return {
      age: "40",
      sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "unspecified",
      formula: isMaxHrFormulaKey(formulaRaw) ? formulaRaw : "default",
      measured: "",
      example: true,
    };
  }

  const age = readText(params.age);
  const measured = readText(params.measured);
  const sexRaw = readText(params.sex);
  const formulaRaw = readText(params.formula);
  const sex: MaxHrSex =
    sexRaw === "male" || sexRaw === "female" ? sexRaw : "unspecified";
  const formula: MaxHrFormulaChoice = isMaxHrFormulaKey(formulaRaw)
    ? formulaRaw
    : "default";
  const ageOk = age !== "" && parseMaxHrAge(age) != null;
  const measuredOk = measured !== "" && parseMeasuredMaxHr(measured) != null;
  if (!ageOk && !measuredOk) return EMPTY;

  return {
    age: ageOk ? age : "",
    sex,
    formula,
    measured: measuredOk ? measured : "",
    ...(measuredOk && params.source === "observed"
      ? { measuredSource: "observed" as const }
      : {}),
    example: false,
  };
}
