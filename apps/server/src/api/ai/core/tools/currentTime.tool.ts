import { buildAiTool, type AiToolDef } from '../tool.types';

type Input = Record<string, never>;

type Output = {
  unixMs: number;
  athleteTimezone: string;
  athleteLocalToday: string;
  serverTimezone: string;
  server: {
    iso: string;
    date: string;
    time: string;
    weekday: string;
    offset: string;
  };
  userTimezone: string | null;
  user: {
    iso: string;
    date: string;
    time: string;
    weekday: string;
    offset: string;
  } | null;
};

export const currentTimeTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'time.current',
  description:
    'Get the athlete-local current date and time. Use athleteLocalToday and user.date for today/yesterday/this week. Never treat server.date as the athlete’s today.',
  cost: 'low',
  searchHint: 'current date today now server time timezone',
  maxResultChars: 2_500,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  execute: async (ctx) => ctx.coachTools.currentTime(ctx),
});
