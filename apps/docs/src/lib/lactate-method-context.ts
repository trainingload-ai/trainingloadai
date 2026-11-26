import { getTranslations } from "next-intl/server";
import type { LactateMethodId } from "@trainingloadai/shared/lactate-analysis";

export const LACTATE_REFERENCES = {
  kindermann: {
    author: "Kindermann et al. (1979)",
    title:
      "The significance of the aerobic-anaerobic transition for the determination of work load intensities during endurance training",
    journal: "European Journal of Applied Physiology · 42:25–34",
    url: "https://doi.org/10.1007/BF00421101",
  },
  heck: {
    author: "Heck et al. (1985)",
    title: "Justification of the 4-mmol/l lactate threshold",
    journal: "International Journal of Sports Medicine · 6:117–130",
    url: "https://doi.org/10.1055/s-2008-1025824",
  },
  berg: {
    author: "Berg et al. (1990)",
    title: "[Current aspects of modern ergometry]",
    journal: "Pneumologie · 44:2–13 · PMID 2408033",
    url: "https://pubmed.ncbi.nlm.nih.gov/2408033/",
  },
  zoladz: {
    author: "Zoladz et al. (1995)",
    title:
      "Non-linear relationship between O2 uptake and power output at high intensities of exercise in humans",
    journal: "The Journal of Physiology · 488:211–217",
    url: "https://doi.org/10.1113/jphysiol.1995.sp020959",
  },
  beaver: {
    author: "Beaver et al. (1985)",
    title:
      "Improved detection of lactate threshold during exercise using a log-log transformation",
    journal: "Journal of Applied Physiology · 59:1936–1940",
    url: "https://doi.org/10.1152/jappl.1985.59.6.1936",
  },
  cheng: {
    author: "Cheng et al. (1992)",
    title:
      "A new approach for the determination of ventilatory and lactate thresholds",
    journal: "International Journal of Sports Medicine · 13:518–522",
    url: "https://doi.org/10.1055/s-2007-1021309",
  },
  bishop: {
    author: "Bishop et al. (1998)",
    title:
      "The relationship between plasma lactate parameters, Wpeak and 1-h cycling performance in women",
    journal: "Medicine & Science in Sports & Exercise · 30:1270–1275",
    url: "https://doi.org/10.1097/00005768-199808000-00014",
  },
  jamnick: {
    author: "Jamnick et al. (2018)",
    title:
      "Manipulating graded exercise test variables affects the validity of the lactate threshold and V̇O2peak",
    journal: "PLOS ONE · 13:e0199794",
    url: "https://doi.org/10.1371/journal.pone.0199794",
  },
  heuberger: {
    author: "Heuberger et al. (2018)",
    title:
      "Repeatability and predictive value of lactate threshold concepts in endurance sports",
    journal: "PLOS ONE · 13:e0206846",
    url: "https://doi.org/10.1371/journal.pone.0206846",
  },
} as const;

type MethodContext = {
  origin: string;
  interpretation: string;
};
type MethodContextCopy = {
  originLabel: string;
  interpretationLabel: string;
  referencesTitle: string;
  introduction: string;
  implementation: string;
  methods: Record<LactateMethodId, MethodContext>;
};

export async function getLactateMethodContext(
  locale: string,
): Promise<MethodContextCopy> {
  const t = await getTranslations({ locale, namespace: "lactateCurveCalculator" });
  return t.raw("methodContext") as MethodContextCopy;
}
