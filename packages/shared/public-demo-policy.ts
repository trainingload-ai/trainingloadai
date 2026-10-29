/**
 * Public Demo is an anonymous, read-only guest context over one
 * server-configured data owner. These capabilities describe product surfaces,
 * not HTTP paths; controllers remain the source of truth for route access.
 */
export const PUBLIC_DEMO_TOKEN_HEADER = "X-Public-Demo-Token";
export const PUBLIC_DEMO_TOKEN_COOKIE = "trainingload.public-demo";
export const PUBLIC_DEMO_READ_ONLY_CODE = "DEMO_READ_ONLY";
export const PUBLIC_DEMO_FRAME_READY_MESSAGE = "trainingload:public-demo-ready";
export const PUBLIC_DEMO_EMBED_CONTEXT_MESSAGE =
  "trainingload:public-demo-context";

export type PublicDemoEmbedTheme = "dark" | "light";

export type PublicDemoEmbedContextMessage = {
  type: typeof PUBLIC_DEMO_EMBED_CONTEXT_MESSAGE;
  locale: string;
  theme: PublicDemoEmbedTheme;
  version: 1;
};

export function isPublicDemoEmbedContextMessage(
  value: unknown,
): value is PublicDemoEmbedContextMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<PublicDemoEmbedContextMessage>;
  return (
    message.type === PUBLIC_DEMO_EMBED_CONTEXT_MESSAGE &&
    message.version === 1 &&
    typeof message.locale === "string" &&
    (message.theme === "dark" || message.theme === "light")
  );
}

export const PUBLIC_DEMO_CAPABILITIES = {
  PROFILE_READ: "profile:read",
  INTEGRATIONS_READ: "integrations:read",
  PLANS_READ: "plans:read",
  ACTIVITIES_READ: "activities:read",
  TRAINING_READ: "training:read",
  AI_HISTORY_READ: "ai-history:read",
  AI_USAGE_READ: "ai-usage:read",
  AI_PASSIVE_GENERATION: "ai-passive-generation:execute",
  NOTIFICATIONS_READ: "notifications:read",
} as const;

export type PublicDemoCapability =
  (typeof PUBLIC_DEMO_CAPABILITIES)[keyof typeof PUBLIC_DEMO_CAPABILITIES];

export const ALL_PUBLIC_DEMO_CAPABILITIES = Object.freeze(
  Object.values(PUBLIC_DEMO_CAPABILITIES),
) as readonly PublicDemoCapability[];

export const DEFAULT_PUBLIC_DEMO_CAPABILITIES = Object.freeze([
  PUBLIC_DEMO_CAPABILITIES.PROFILE_READ,
  PUBLIC_DEMO_CAPABILITIES.PLANS_READ,
  PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ,
  PUBLIC_DEMO_CAPABILITIES.TRAINING_READ,
  PUBLIC_DEMO_CAPABILITIES.AI_HISTORY_READ,
  PUBLIC_DEMO_CAPABILITIES.AI_USAGE_READ,
  PUBLIC_DEMO_CAPABILITIES.AI_PASSIVE_GENERATION,
]) as readonly PublicDemoCapability[];

export function isPublicDemoCapability(
  value: unknown,
): value is PublicDemoCapability {
  return ALL_PUBLIC_DEMO_CAPABILITIES.includes(value as PublicDemoCapability);
}
