export const MCP_SCOPE = {
  PROFILE_READ: 'profile:read',
  TRAINING_READ: 'training:read',
  ACTIVITY_READ: 'activity:read',
  PLAN_READ: 'plan:read',
  HEALTH_READ: 'health:read',
  COMPETITION_READ: 'competition:read',
} as const;

export const MCP_READ_SCOPES = Object.values(MCP_SCOPE);
export const MCP_DEFAULT_SCOPES = MCP_READ_SCOPES.filter(
  (scope) => scope !== MCP_SCOPE.HEALTH_READ,
);

export const OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  ...MCP_READ_SCOPES,
  'activity:write',
  'plan:write',
  'review:write',
  'plan:draft',
] as const;

export const OAUTH_DEFAULT_CLIENT_SCOPES = [
  'openid',
  'profile',
  'email',
  ...MCP_DEFAULT_SCOPES,
] as const;

export const MOBILE_OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  ...MCP_READ_SCOPES,
  'activity:write',
  'plan:write',
  'review:write',
] as const;
