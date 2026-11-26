import { getTranslations } from "next-intl/server";
import type messages from "@trainingloadai/messages/docs/en.json";
import type {
  LactateMethodId,
  LactateReason,
} from "@trainingloadai/shared/lactate-analysis";

type LactatePresentationCopy =
  typeof messages.lactateCurveCalculator.presentation;

export type LactateCopy = BaseLactateCopy & {
  presentation: LactatePresentationCopy;
};
type BaseLactateCopy = {
  title: string;
  description: string;
  badge: string;
  privacy: string;
  inputTitle: string;
  resultTitle: string;
  empty: string;
  stale: string;
  sample: string;
  cycling: string;
  running: string;
  intensity: string;
  lactate: string;
  heartRate: string;
  stage: string;
  rest: string;
  example: string;
  clear: string;
  add: string;
  remove: string;
  analyze: string;
  calculating: string;
  paste: string;
  import: string;
  template: string;
  confirmImport: string;
  cancel: string;
  mapping: string;
  noColumn: string;
  sort: string;
  overwrite: string;
  resetSport: string;
  pasteHelp: string;
  inputHelp: string;
  method: string;
  threshold: string;
  selected: string;
  unavailable: string;
  partial: string;
  noResult: string;
  lt1: string;
  lt2: string;
  zones: string;
  zoneNames: [string, string, string];
  methodHelp: string;
  export: string;
  print: string;
  report: string;
  source: string;
  copied: string;
  copy: string;
  quality: string;
  methodsTitle: string;
  instructionsTitle: string;
  instructions: string[];
  faqTitle: string;
  faq: { question: string; answer: string }[];
  alternative: string;
  alternativeBody: string;
  related: string;
  cta: string;
  ctaBody: string;
  protocol: string;
  stageMinutes: string;
  sampleSite: string;
  notRecorded: string;
  earlobe: string;
  fingertip: string;
  other: string;
  incomplete: string;
  excluded: string;
  runtimeError: string;
  exportError: string;
  recordingError: string;
  methodNames: Record<LactateMethodId, string>;
  methodDescriptions: Record<LactateMethodId, string>;
  reasons: Record<LactateReason, string>;
};

const methodNames = {
  obla_2: "OBLA 2.0",
  obla_4: "OBLA 4.0",
  bsln_05: "Bsln + 0.5",
  bsln_10: "Bsln + 1.0",
  log_log: "Log-log",
  dmax: "Dmax",
  moddmax: "ModDmax",
  log_poly_moddmax: "Log-Poly-ModDmax",
};

export async function getLactateCopy(locale: string): Promise<LactateCopy> {
  const t = await getTranslations({ locale, namespace: "lactateCurveCalculator" });
  return buildLactateCopy({
    copy: t.raw("copy") as typeof messages.lactateCurveCalculator.copy,
    presentation: t.raw("presentation") as LactatePresentationCopy,
  });
}

export function buildLactateCopy({
  copy,
  presentation,
}: Pick<typeof messages.lactateCurveCalculator, "copy" | "presentation">): LactateCopy {
  const [belowLt1, betweenThresholds, aboveLt2] = copy.zoneNames;
  return {
    ...copy,
    zoneNames: [belowLt1, betweenThresholds, aboveLt2],
    methodNames,
    presentation,
  };
}
