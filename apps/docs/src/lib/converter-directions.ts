export type ConverterFormat = "gpx" | "fit" | "tcx";

export type ConverterFormatInfo = {
  label: string;
  extension: string;
  accept: string;
  description: string;
  role: string;
};

export type ConverterDirectionFaqItem = {
  q: string;
  a?: string;
};

export type ConverterDirectionFieldRow = {
  field: string;
  detail: string;
};

export type ConverterDirectionScenario = {
  title: string;
  body: string;
};

export type ConverterDirectionPageOverride = {
  title?: string;
  metadataTitle?: string;
  metadataDescription?: string;
  subtitle?: string;
  converterDescription?: string;
  howToTitle?: string;
  linkLabel?: string;
  keywords?: string[];
  faq?: ConverterDirectionFaqItem[];
  faqExtra?: ConverterDirectionFaqItem[];
  preservedIntro?: string;
  preservedFootnote?: string;
  preserved?: ConverterDirectionFieldRow[];
  scenarios?: ConverterDirectionScenario[];
  comparison?: string;
  comparisonCourseNote?: string;
};

export type ConverterDirectionCopy = {
  labelPattern: string;
  titlePattern: string;
  metadataTitlePattern: string;
  metadataDescription: string;
  converter: string;
  keywordBase: string[];
  pages?: Partial<Record<string, ConverterDirectionPageOverride>>;
  formats: Record<ConverterFormat, { description: string; role: string }>;
  useCases: Record<string, string>;
  subtitle: string;
  converterDescription: string;
  howTo: string[];
  faq: {
    how: { q: string; a: string };
    free: { q: string; a: string };
    limits: { q: string; a: string };
    preserved: { q: string; a: string };
    privacy: { q: string; a: string };
    why: { q: string };
  };
  relatedHub: string;
  relatedFitViewer: string;
  relatedFitCourse: string;
  keywordConverterPattern: string;
  keywordConvertPattern: string;
  tools: string;
  gpxConverter: string;
  badge: string;
  primaryPattern: string;
  otherFreeTools: string;
  sourceFile: string;
  download: string;
  uploadAria: string;
  pickStrong: string;
  pickRest: string;
  supported: string;
  removeFileAria: string;
  noFile: string;
  requestFailed: string;
  network: string;
  convertFailed: string;
  converting: string;
  convertTo: string;
  convertAria: string;
  success: string;
  feedbackTitle: string;
  feedbackEmail: string;
  howToTitle: string;
  otherToolsTitle: string;
  preservedTitle: string;
  preservedField: string;
  preservedStatus: string;
  scenariosTitle: string;
  comparisonTitle: string;
  relatedSameFromTitle: string;
  relatedSameToTitle: string;
  relatedHubTitle: string;
  relatedOtherTitle: string;
  relatedFitCourseConverter: string;
  uploadNote: string;
  sourceTitle: string;
  targetTitle: string;
  faqTitle: string;
  ctaTitle: string;
  ctaSubtitle: string;
  ctaButton: string;
  trainingPlanPrompt: {
    close: string;
    eyebrow: string;
    title: string;
    body: string;
    primary: string;
    secondary: string;
    note: string;
  };
};

export type ConverterDirection = {
  slug: string;
  source: ConverterFormat;
  target: ConverterFormat;
  sourceInfo: ConverterFormatInfo;
  targetInfo: ConverterFormatInfo;
  label: string;
  title: string;
  subtitle: string;
  metadataTitle: string;
  metadataDescription: string;
  keywords: string[];
  sourceDescription: string;
  targetDescription: string;
  howTo: string[];
  faq: Array<{ question: string; answer: string }>;
  related: string[];
  preserved: {
    title: string;
    intro: string;
    fieldLabel: string;
    statusLabel: string;
    rows: ConverterDirectionFieldRow[];
    footnote: string;
  } | null;
  scenarios: {
    title: string;
    items: ConverterDirectionScenario[];
  } | null;
  comparison: {
    title: string;
    body: string;
    courseNote: string;
  } | null;
  ui: {
    tools: string;
    gpxConverter: string;
    badge: string;
    primary: string;
    secondary: string;
    sourceFile: string;
    download: string;
    converterDescription: string;
    uploadAria: string;
    pickStrong: string;
    pickRest: string;
    supported: string;
    removeFileAria: string;
    noFile: string;
    requestFailed: string;
    network: string;
    convertFailed: string;
    converting: string;
    convertTo: string;
    convertAria: string;
    success: string;
    feedbackTitle: string;
    feedbackEmail: string;
    howToTitle: string;
    linkLabel: string;
    otherToolsTitle: string;
    preservedTitle: string;
    scenariosTitle: string;
    comparisonTitle: string;
    relatedSameFromTitle: string;
    relatedSameToTitle: string;
    relatedHubTitle: string;
    relatedOtherTitle: string;
    relatedFitCourseConverter: string;
    uploadNote: string;
    sourceTitle: string;
    targetTitle: string;
    faqTitle: string;
    ctaTitle: string;
    ctaSubtitle: string;
    ctaButton: string;
    relatedHub: string;
    relatedFitViewer: string;
    relatedFitCourse: string;
    trainingPlanPrompt: ConverterDirectionCopy["trainingPlanPrompt"];
  };
};

const converterDirectionSlugs = [
  "fit-to-gpx",
  "gpx-to-fit",
  "tcx-to-gpx",
  "gpx-to-tcx",
  "fit-to-tcx",
  "tcx-to-fit",
] as const;

const converterDirectionConfigs = [
  { source: "fit", target: "gpx" },
  { source: "gpx", target: "fit" },
  { source: "tcx", target: "gpx" },
  { source: "gpx", target: "tcx" },
  { source: "fit", target: "tcx" },
  { source: "tcx", target: "fit" },
] satisfies Array<{ source: ConverterFormat; target: ConverterFormat }>;

function format(template: string, values: Record<string, string | number>) {
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    values[key] == null ? "" : String(values[key]),
  );
}

function uniqueStrings(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

function faqItems(
  items: ConverterDirectionFaqItem[] | undefined,
  values: Record<string, string | number>,
) {
  if (!items?.length) return [];
  return items
    .map((item) => ({
      question: format(item.q, values),
      answer: format(item.a ?? "", values),
    }))
    .filter((item) => item.question && item.answer);
}

function mappedRows(
  items: ConverterDirectionFieldRow[] | undefined,
  values: Record<string, string | number>,
) {
  if (!items?.length) return [];
  return items
    .map((item) => ({
      field: format(item.field, values),
      detail: format(item.detail, values),
    }))
    .filter((item) => item.field && item.detail);
}

function mappedScenarios(
  items: ConverterDirectionScenario[] | undefined,
  values: Record<string, string | number>,
) {
  if (!items?.length) return [];
  return items
    .map((item) => ({
      title: format(item.title, values),
      body: format(item.body, values),
    }))
    .filter((item) => item.title && item.body);
}

export function groupRelatedConverterDirections(
  current: ConverterDirection,
  related: ConverterDirection[],
) {
  return {
    sameFrom: related.filter((item) => item.source === current.source),
    sameTo: related.filter((item) => item.target === current.target),
  };
}

export function getConverterDirectionSlugs() {
  return [...converterDirectionSlugs];
}

export function buildConverterDirection(
  slug: string,
  copy: ConverterDirectionCopy,
): ConverterDirection | null {
  const config = converterDirectionConfigs.find(
    (item) => `${item.source}-to-${item.target}` === slug,
  );
  if (!config) return null;

  const sourceInfo = {
    label: config.source.toUpperCase(),
    extension: `.${config.source}`,
    accept: `.${config.source}`,
    description: copy.formats[config.source].description,
    role: copy.formats[config.source].role,
  };
  const targetInfo = {
    label: config.target.toUpperCase(),
    extension: `.${config.target}`,
    accept: `.${config.target}`,
    description: copy.formats[config.target].description,
    role: copy.formats[config.target].role,
  };
  const label = format(copy.labelPattern, {
    source: sourceInfo.label,
    target: targetInfo.label,
  });
  const values = {
    source: sourceInfo.label,
    target: targetInfo.label,
    extension: sourceInfo.extension,
    label,
  };
  const page = copy.pages?.[slug];
  const primary = format(copy.primaryPattern, values);
  const templatedFaq = [
    {
      question: format(copy.faq.how.q, values),
      answer: format(copy.faq.how.a, values),
    },
    {
      question: format(copy.faq.free.q, values),
      answer: format(copy.faq.free.a, values),
    },
    {
      question: format(copy.faq.limits.q, values),
      answer: format(copy.faq.limits.a, values),
    },
    {
      question: format(copy.faq.preserved.q, values),
      answer: format(copy.faq.preserved.a, values),
    },
    {
      question: format(copy.faq.privacy.q, values),
      answer: format(copy.faq.privacy.a, values),
    },
    {
      question: format(copy.faq.why.q, values),
      answer: copy.useCases[slug] ?? "",
    },
  ];
  const faq = page?.faq?.length
    ? faqItems(page.faq, values)
    : [
        templatedFaq[0]!,
        ...faqItems(page?.faqExtra, values),
        ...templatedFaq.slice(1),
      ];
  const preservedRows = mappedRows(page?.preserved, values);
  const scenarioItems = mappedScenarios(page?.scenarios, values);
  const comparisonBody = page?.comparison
    ? format(page.comparison, values)
    : "";
  const comparisonCourseNote = page?.comparisonCourseNote
    ? format(page.comparisonCourseNote, values)
    : "";

  return {
    slug,
    source: config.source,
    target: config.target,
    sourceInfo,
    targetInfo,
    label,
    title: page?.title
      ? format(page.title, values)
      : format(copy.titlePattern, values),
    subtitle: page?.subtitle
      ? format(page.subtitle, values)
      : format(copy.subtitle, values),
    metadataTitle: page?.metadataTitle
      ? format(page.metadataTitle, values)
      : format(copy.metadataTitlePattern, values),
    metadataDescription: page?.metadataDescription
      ? format(page.metadataDescription, values)
      : format(copy.metadataDescription, values),
    keywords: uniqueStrings([
      ...(page?.keywords ?? []),
      label,
      format(copy.keywordConvertPattern, values),
      format(copy.keywordConverterPattern, values),
      format(copy.convertTo, values),
      `${sourceInfo.label} ${copy.converter}`,
      `${targetInfo.label} ${copy.converter}`,
      ...copy.keywordBase,
    ]),
    sourceDescription: sourceInfo.role,
    targetDescription: targetInfo.role,
    howTo: copy.howTo.map((item) => format(item, values)),
    faq,
    related: converterDirectionSlugs.filter((item) => item !== slug),
    preserved: preservedRows.length
      ? {
          title: format(copy.preservedTitle, values),
          intro: page?.preservedIntro
            ? format(page.preservedIntro, values)
            : "",
          fieldLabel: copy.preservedField,
          statusLabel: copy.preservedStatus,
          rows: preservedRows,
          footnote: page?.preservedFootnote
            ? format(page.preservedFootnote, values)
            : "",
        }
      : null,
    scenarios: scenarioItems.length
      ? {
          title: format(copy.scenariosTitle, values),
          items: scenarioItems,
        }
      : null,
    comparison: comparisonBody
      ? {
          title: format(copy.comparisonTitle, values),
          body: comparisonBody,
          courseNote: comparisonCourseNote,
        }
      : null,
    ui: {
      tools: copy.tools,
      gpxConverter: copy.gpxConverter,
      badge: copy.badge,
      primary,
      secondary: copy.otherFreeTools,
      sourceFile: copy.sourceFile,
      download: copy.download,
      converterDescription: page?.converterDescription
        ? format(page.converterDescription, values)
        : format(copy.converterDescription, values),
      uploadAria: format(copy.uploadAria, values),
      pickStrong: copy.pickStrong,
      pickRest: copy.pickRest,
      supported: format(copy.supported, values),
      removeFileAria: copy.removeFileAria,
      noFile: format(copy.noFile, values),
      requestFailed: copy.requestFailed,
      network: copy.network,
      convertFailed: copy.convertFailed,
      converting: copy.converting,
      convertTo: format(copy.convertTo, values),
      convertAria: format(copy.convertAria, values),
      success: copy.success,
      feedbackTitle: copy.feedbackTitle,
      feedbackEmail: copy.feedbackEmail,
      howToTitle: page?.howToTitle
        ? format(page.howToTitle, values)
        : format(copy.howToTitle, values),
      linkLabel: page?.linkLabel ? format(page.linkLabel, values) : primary,
      otherToolsTitle: copy.otherToolsTitle,
      preservedTitle: format(copy.preservedTitle, values),
      scenariosTitle: format(copy.scenariosTitle, values),
      comparisonTitle: format(copy.comparisonTitle, values),
      relatedSameFromTitle: format(copy.relatedSameFromTitle, values),
      relatedSameToTitle: format(copy.relatedSameToTitle, values),
      relatedHubTitle: copy.relatedHubTitle,
      relatedOtherTitle: copy.relatedOtherTitle,
      relatedFitCourseConverter: copy.relatedFitCourseConverter,
      uploadNote: copy.uploadNote,
      sourceTitle: format(copy.sourceTitle, values),
      targetTitle: format(copy.targetTitle, values),
      faqTitle: copy.faqTitle,
      ctaTitle: copy.ctaTitle,
      ctaSubtitle: copy.ctaSubtitle,
      ctaButton: copy.ctaButton,
      relatedHub: copy.relatedHub,
      relatedFitViewer: copy.relatedFitViewer,
      relatedFitCourse: copy.relatedFitCourse,
      trainingPlanPrompt: copy.trainingPlanPrompt,
    },
  };
}

export function buildConverterDirections(copy: ConverterDirectionCopy) {
  return converterDirectionSlugs
    .map((slug) => buildConverterDirection(slug, copy))
    .filter((item): item is ConverterDirection => Boolean(item));
}
