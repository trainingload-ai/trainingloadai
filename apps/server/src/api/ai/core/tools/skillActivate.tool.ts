import { aiToolError, buildAiTool, type AiToolDef } from '../tool.types';
import {
  getCoachSkillByName,
  getCoachSkills,
  listCoachSkillsForPrompt,
} from '../skill.registry';

type Input = {
  name: string;
  reason?: string;
};

type Output = {
  activated: boolean;
  skill?: {
    name: string;
    description: string;
    whenToUse: string;
    suggestedTools: string[];
    prompt: string;
    activatedBy: string;
  };
  availableSkills: Array<{
    name: string;
    description: string;
    whenToUse: string;
  }>;
  reason?: string;
};

// Existing stored calls can use aliases; normalize the displayed identity, not
// the caller's arguments. New model calls should use the canonical catalog.
const SKILL_NAMES = getCoachSkills().flatMap((skill) => [
  skill.name,
  ...(skill.aliases ?? []),
]);

export const skillActivateTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'skill.activate',
  description:
    'Load one named entry from the Available skills catalog and its focused capability set after identifying the current objective. Use it when specialized domain guidance helps; simple tasks may call a direct tool instead.',
  cost: 'low',
  searchHint: 'load coaching domain guidance skill',
  maxResultChars: 4_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        enum: SKILL_NAMES,
        description: 'Exact skill name from the Available skills catalog.',
      },
      reason: {
        type: 'string',
        description: 'Optional short reason for switching domain guidance.',
      },
    },
  },
  validateInput: async (_ctx, input) =>
    String(input?.name ?? '').trim()
      ? { ok: true }
      : aiToolError('Missing skill name', 'INVALID_INPUT'),
  execute: async (_ctx, input) => {
    const skill = getCoachSkillByName(input.name);
    return {
      activated: Boolean(skill),
      skill: skill ?? undefined,
      availableSkills: listCoachSkillsForPrompt(),
      reason: input.reason?.trim() || undefined,
    };
  },
});
