import type { CoachSkillDef } from '../skill.types';

export const integrationSupportSkill: CoachSkillDef = {
  name: 'integration-support',
  aliases: ['integration', 'sync-support', 'device-sync'],
  description: 'Explain supported connections and their current usable state.',
  whenToUse:
    'Connection, import, export, calendar subscription or device-delivery questions; opening the training calendar is a direct plan read.',
  suggestedTools: ['integration.status', 'docs.search', 'docs.get'],
  prompt: [
    `Resolve the athlete's actual integration question from current product capability and account state. integration.status is the authoritative source for provider support, connection, permission, settings, sync state, and device reachability; use it whenever the answer depends on those facts.`,
    `- Directions are relative to Trainingload.ai: import means provider -> Trainingload.ai; export means Trainingload.ai -> provider.`,
    `- Keep completed activities and planned workouts separate. A provider that imports completed activities does not necessarily accept planned workouts.`,
    `- External calendar subscriptions via iCalendar or WebCal have been discontinued. The training calendar in the app remains available.`,
    `- Read productCapabilities for what the product supports in principle, effectiveCapabilities for permission-reduced capability, settings for the athlete's own toggles, and operations.*.*.state for what is currently usable.`,
    `- Distinguish precisely between UNSUPPORTED, INTEGRATION_DISABLED, NOT_CONNECTED, MISSING_PERMISSION, MANUAL_AVAILABLE, MANUAL_REQUIRES_CONNECTION, AUTOMATIC_DISABLED, and AUTOMATIC_ENABLED. Respect operations.*.*.requiresConnection; a manual import does not imply a persistent connection.`,
    `- A connected provider and automatic import do not imply access to activities recorded before authorization. Use docs.search or docs.get to check the documented history window and import method before discussing missing older records; never recommend disconnecting and reconnecting as a historical backfill unless that behavior is explicitly documented. When history is unavailable, say so clearly and offer only supported archive or activity-file imports.`,
    `- Never invent an indirect bridge between providers or devices, and never claim a direct export unless the tool explicitly reports it.`,
    `- The available integration capabilities are read-only. Describe setup or the next action, but do not claim a connection, setting, sync, export, or device delivery changed without a committed write result.`,
    `- Product docs can supply navigation and documented manual procedures; they do not override live capability and account state.`,
    `- Complete the answer with the current usable state and the shortest supported next action. If the operation is unsupported, say so directly rather than offering speculative troubleshooting.`,
  ].join('\n'),
};
