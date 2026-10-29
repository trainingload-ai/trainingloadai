export const PLAN_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'SUPERSEDED',
] as const;

export const PLAN_SOURCE_TYPES = [
  'MANUAL',
  'AI',
  'GENERATED',
  'IMPORTED',
  'TEMPLATE',
] as const;

export const PLAN_WORKOUT_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'DONE',
  'SKIPPED',
  'MOVED',
] as const;

export const PLAN_WORKOUT_ACTIVITY_LINK_SOURCES = [
  'MANUAL',
  'AUTO',
  'AI',
] as const;

export const PLAN_WORKOUT_MOVED_BY = ['USER', 'COACH'] as const;

export const PLAN_WORKOUT_ACTIVITY_LINK_ROLES = [
  'PRIMARY',
  'SECONDARY',
] as const;

export const PLAN_SPORT_TYPES = [
  'RUN',
  'CYCLING',
  'SWIM',
  'STRETCHING',
  'UNKNOWN',
] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type PlanSourceType = (typeof PLAN_SOURCE_TYPES)[number];
export type PlanWorkoutStatus = (typeof PLAN_WORKOUT_STATUSES)[number];
export type PlanWorkoutMovedBy = (typeof PLAN_WORKOUT_MOVED_BY)[number];
export type PlanWorkoutActivityLinkSource =
  (typeof PLAN_WORKOUT_ACTIVITY_LINK_SOURCES)[number];
export type PlanWorkoutActivityLinkRole =
  (typeof PLAN_WORKOUT_ACTIVITY_LINK_ROLES)[number];
export type PlanSportType = (typeof PLAN_SPORT_TYPES)[number];
