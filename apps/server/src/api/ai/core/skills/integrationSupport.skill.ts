import type { CoachSkillDef } from '../skill.types';

export const integrationSupportSkill: CoachSkillDef = {
  name: 'integration-support',
  aliases: ['integration', 'sync-support', 'device-sync'],
  description:
    'Explain third-party connections and synchronization using the product capability matrix plus the signed-in user’s effective connection and settings state.',
  whenToUse:
    'Use when the user asks how to connect, import, export, or sync activities, planned workouts, wellness, athlete settings, calendars, GPS computers, or watches with an integration enabled by this deployment.',
  suggestedTools: ['integration.status', 'docs.search', 'docs.get'],
  prompt: [
    `Resolve the athlete's actual integration question from current product capability and account state. integration.status is the authoritative source for provider support, connection, permission, settings, sync state, and device reachability; use it whenever the answer depends on those facts.`,
    `- Directions are relative to Trainingload.ai: import means provider -> Trainingload.ai; export means Trainingload.ai -> provider.`,
    `- Keep completed activities and planned workouts separate. A provider that imports completed activities does not necessarily accept planned workouts.`,
    `- Read productCapabilities for what the product supports in principle, effectiveCapabilities for permission-reduced capability, settings for the athlete's own toggles, and operations.*.*.state for what is currently usable.`,
    `- Distinguish precisely between UNSUPPORTED, INTEGRATION_DISABLED, NOT_CONNECTED, MISSING_PERMISSION, MANUAL_AVAILABLE, MANUAL_REQUIRES_CONNECTION, AUTOMATIC_DISABLED, and AUTOMATIC_ENABLED. Respect operations.*.*.requiresConnection; a manual import does not imply a persistent connection.`,
    `- Never invent an indirect bridge between providers or devices, and never claim a direct export unless the tool explicitly reports it.`,
    `- The available integration capabilities are read-only. Describe setup or the next action, but do not claim a connection, setting, sync, export, or device delivery changed without a committed write result.`,
    `- Product docs can supply navigation and documented manual procedures; they do not override live capability and account state.`,
    `- Complete the answer with the current usable state and the shortest supported next action. If the operation is unsupported, say so directly rather than offering speculative troubleshooting.`,
  ].join('\n'),
};
