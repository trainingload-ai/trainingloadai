import {
  PersonSimpleRunIcon,
  PersonSimpleBikeIcon,
  PersonSimpleSwimIcon,
  BarbellIcon,
  PersonSimpleTaiChiIcon,
  QuestionIcon,
} from "@phosphor-icons/react";
import { SportType } from "@/api/activities";

/**
 * Get icon component for sport type
 */
export function getSportTypeIcon(
  sportType: SportType,
  className?: string,
  subSportType?: string | null,
) {
  const iconProps = { className: className || "w-3 h-3" };

  if (subSportType === "STRENGTH_TRAINING") {
    return <BarbellIcon weight="fill" {...iconProps} />;
  }
  if (subSportType === "STRETCHING" || subSportType === "YOGA") {
    return <PersonSimpleTaiChiIcon weight="fill" {...iconProps} />;
  }

  switch (sportType) {
    case "RUN":
      return <PersonSimpleRunIcon weight="fill" {...iconProps} />;
    case "CYCLING":
      return <PersonSimpleBikeIcon weight="fill" {...iconProps} />;
    case "SWIM":
      return <PersonSimpleSwimIcon weight="fill" {...iconProps} />;
    case "UNKNOWN":
    default:
      return <QuestionIcon {...iconProps} />;
  }
}

/**
 * Get color class name for sport type
 */
export function getSportTypeColor(
  sportType: SportType,
  subSportType?: string | null,
) {
  if (subSportType === "STRENGTH_TRAINING") {
    return "text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/20 dark:border-orange-800";
  }
  if (subSportType === "STRETCHING" || subSportType === "YOGA") {
    return "text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-900/20 dark:border-violet-800";
  }
  switch (sportType) {
    case "RUN":
      return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800";
    case "CYCLING":
      return "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800";
    case "SWIM":
      return "text-cyan-600 bg-cyan-50 border-cyan-200 dark:text-cyan-400 dark:bg-cyan-900/20 dark:border-cyan-800";
    case "UNKNOWN":
    default:
      return "text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900/20 dark:border-gray-800";
  }
}

/**
 * Get display label for sport type (for internationalization)
 */
export function getSportTypeLabel(
  sportType: SportType,
  t: (key: string) => string,
) {
  switch (sportType) {
    case "RUN":
      return t("sportType.run");
    case "CYCLING":
      return t("sportType.cycling");
    case "SWIM":
      return t("sportType.swim");
    case "UNKNOWN":
    default:
      return t("sportType.unknown");
  }
}
