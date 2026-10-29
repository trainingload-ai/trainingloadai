-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "enum_sport_type" AS ENUM ('RUN', 'CYCLING', 'SWIM', 'STRETCHING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "enum_sport_cadence_unit" AS ENUM ('SPM', 'RPM');

-- CreateEnum
CREATE TYPE "enum_workout_structure_kind" AS ENUM ('ENDURANCE', 'STRENGTH', 'FREEFORM');

-- CreateEnum
CREATE TYPE "enum_strength_set_type" AS ENUM ('WARMUP', 'WORK');

-- CreateEnum
CREATE TYPE "enum_strength_prescription_type" AS ENUM ('REPS', 'TIME');

-- CreateEnum
CREATE TYPE "enum_strength_load_type" AS ENUM ('OPEN', 'ABSOLUTE', 'PERCENT_1RM', 'BODYWEIGHT', 'BODYWEIGHT_OFFSET');

-- CreateEnum
CREATE TYPE "enum_strength_load_unit" AS ENUM ('KG', 'LB', 'PERCENT');

-- CreateEnum
CREATE TYPE "enum_strength_bodyweight_offset_direction" AS ENUM ('ADDED', 'ASSISTED');

-- CreateEnum
CREATE TYPE "enum_activity_strength_set_source" AS ENUM ('APP', 'FIT', 'MANUAL');

-- CreateEnum
CREATE TYPE "enum_provider_sport_mapping_direction" AS ENUM ('IMPORT', 'EXPORT', 'BOTH');

-- CreateEnum
CREATE TYPE "enum_peak_type" AS ENUM ('power', 'pace', 'hr');

-- CreateEnum
CREATE TYPE "enum_scale_type" AS ENUM ('TIME', 'DISTANCE');

-- CreateEnum
CREATE TYPE "enum_mapping_type" AS ENUM ('EXACT', 'FUZZY', 'MANUAL');

-- CreateEnum
CREATE TYPE "enum_sync_status" AS ENUM ('PENDING', 'SYNCING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "enum_third_party_provider" AS ENUM ('intervals_icu', 'upload', 'unknown');

-- CreateEnum
CREATE TYPE "enum_import_source_kind" AS ENUM ('FILE', 'INTERVALS_ICU', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "enum_import_source_resolution_status" AS ENUM ('IMPORTABLE', 'ROUTING', 'BLOCKED', 'RESOLVED', 'NOT_FOUND', 'DISMISSED');

-- CreateEnum
CREATE TYPE "enum_import_source_resolution_reason" AS ENUM ('UPSTREAM_DATA_UNAVAILABLE', 'ORIGIN_CONNECTION_REQUIRED', 'ORIGIN_IMPORT_DISABLED', 'ORIGIN_REAUTH_REQUIRED', 'ORIGIN_SCOPE_REQUIRED', 'ORIGIN_SYNC_PENDING', 'ORIGIN_SYNC_FAILED', 'ORIGIN_ACTIVITY_NOT_FOUND', 'ORIGIN_ACTIVITY_AMBIGUOUS');

-- CreateEnum
CREATE TYPE "enum_origin_activity_sync_request_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "enum_chart_type" AS ENUM ('LINE', 'BAR', 'PIE', 'SCATTER', 'HEATMAP', 'AREA', 'HISTOGRAM');

-- CreateEnum
CREATE TYPE "enum_data_source" AS ENUM ('ACTIVITIES', 'HEARTRATE', 'POWER', 'SPEED', 'CADENCE', 'ELEVATION', 'TEMPERATURE');

-- CreateEnum
CREATE TYPE "enum_display_location" AS ENUM ('DASHBOARD', 'ACTIVITIES', 'PERFORMANCE', 'HEARTRATE', 'POWER', 'ANALYSIS');

-- CreateEnum
CREATE TYPE "enum_storage_strategy" AS ENUM ('LOCAL');

-- CreateEnum
CREATE TYPE "enum_enum_category" AS ENUM ('DISTANCE_UNIT', 'SPEED_UNIT', 'THEME', 'WEIGHT_UNIT', 'HEIGHT_UNIT');

-- CreateEnum
CREATE TYPE "enum_setting_category" AS ENUM ('UNIT_SYSTEM', 'POWER_UNIT', 'THEME', 'CHART_XAXIS', 'TIME_FORMAT', 'FITNESS_STATUS_LAYOUT', 'AI_REVIEW_MODE', 'AI_DATA_CONSENT', 'ATHLETE_MEMORY');

-- CreateEnum
CREATE TYPE "enum_default_vdot_source" AS ENUM ('HEARTRATE', 'FACTOR', 'STANDARD');

-- CreateEnum
CREATE TYPE "AltitudeOptimizationModel" AS ENUM ('NOSMOOTHING', 'THRESHOLDMETHOD', 'DOUGLASPEUCKERALGORITHM');

-- CreateEnum
CREATE TYPE "enum_fatigue_risk_level" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "enum_recovery_status" AS ENUM ('RECOVERED', 'RECOVERING', 'FATIGUED', 'OVERREACHED');

-- CreateEnum
CREATE TYPE "enum_metric_source" AS ENUM ('AUTO', 'ESTIMATED', 'MANUAL', 'SNAPSHOT');

-- CreateEnum
CREATE TYPE "enum_body_metric_type" AS ENUM ('WEIGHT', 'HEIGHT', 'BIRTHDAY', 'GENDER', 'TIMEZONE');

-- CreateEnum
CREATE TYPE "enum_health_data_provider" AS ENUM ('INTERVALS_ICU', 'HEALTH_CONNECT', 'MANUAL');

-- CreateEnum
CREATE TYPE "enum_health_metric_type" AS ENUM ('BODY_MASS_KG', 'RESTING_HEART_RATE_BPM', 'HRV_SDNN_MS', 'VO2_MAX', 'STEP_COUNT', 'DAILY_ACTIVITY_GOAL_PERCENT', 'ACTIVE_DURATION_SECONDS', 'SEDENTARY_DURATION_SECONDS', 'LIGHT_ACTIVITY_SECONDS', 'MODERATE_ACTIVITY_SECONDS', 'VIGOROUS_ACTIVITY_SECONDS', 'ACTIVE_ENERGY_KCAL', 'TOTAL_ENERGY_KCAL', 'WALKING_RUNNING_DISTANCE_M', 'SLEEP_IN_BED_SECONDS', 'SLEEP_ASLEEP_SECONDS', 'SLEEP_AWAKE_SECONDS', 'SLEEP_CORE_SECONDS', 'SLEEP_DEEP_SECONDS', 'SLEEP_REM_SECONDS', 'SLEEP_SCORE', 'SLEEP_AVG_HEART_RATE_BPM', 'HEART_RATE_MIN_BPM', 'HEART_RATE_MAX_BPM', 'HEART_RATE_AVG_BPM', 'HEART_RATE_SAMPLE_BPM', 'STRESS_LEVEL_AVG', 'STRESS_LEVEL_MAX', 'STRESS_DURATION_SECONDS', 'REST_STRESS_DURATION_SECONDS', 'RESPIRATION_RATE_AVG_BPM', 'RESPIRATION_RATE_MIN_BPM', 'RESPIRATION_RATE_MAX_BPM', 'SPO2_AVG_PERCENT', 'SPO2_MIN_PERCENT', 'BODY_BATTERY_LATEST', 'BODY_BATTERY_MIN', 'BODY_BATTERY_MAX', 'BODY_BATTERY_CHARGED', 'BODY_BATTERY_DRAINED', 'HRV_RMSSD_MS', 'HRV_RMSSD_5_MIN_HIGH_MS', 'HRV_RMSSD_WEEKLY_AVG_MS', 'FLOORS_ASCENDED', 'FLOORS_DESCENDED');

-- CreateEnum
CREATE TYPE "enum_health_series_value_type" AS ENUM ('POINT', 'INTERVAL');

-- CreateEnum
CREATE TYPE "enum_external_health_session_type" AS ENUM ('SLEEP', 'NAP', 'HEALTH_SNAPSHOT', 'AUTO_ACTIVITY');

-- CreateEnum
CREATE TYPE "PMCExtremeType" AS ENUM ('ATL', 'CTL', 'TSB');

-- CreateEnum
CREATE TYPE "enum_activity_status" AS ENUM ('PADDING', 'PARSING', 'FINISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "enum_activity_processing_status" AS ENUM ('RECEIVED', 'NORMALIZED', 'DEDUPED', 'MATERIALIZED', 'PARQUET_READY', 'ANALYZING', 'READY', 'PARTIAL_FAILED', 'FAILED');

-- CreateEnum
CREATE TYPE "enum_activity_weather_status" AS ENUM ('PENDING', 'PROCESSING', 'AVAILABLE', 'NOT_APPLICABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "enum_activity_weather_unavailable_reason" AS ENUM ('INDOOR_ACTIVITY', 'MISSING_TRACK_TIME', 'MISSING_MIDPOINT_LOCATION', 'INVALID_MIDPOINT_LOCATION', 'PROVIDER_HISTORY_UNAVAILABLE', 'PROVIDER_NO_MATCHING_SAMPLE', 'PROVIDER_REJECTED', 'RETRY_EXHAUSTED');

-- CreateEnum
CREATE TYPE "enum_gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "enum_calculation_method" AS ENUM ('POWER_TEST_20MIN', 'POWER_TEST_5MIN', 'HEART_RATE_ANALYSIS', 'ACTIVITY_ANALYSIS', 'AGE_FORMULA', 'STATISTICAL_MODEL', 'MACHINE_LEARNING');

-- CreateEnum
CREATE TYPE "enum_change_source" AS ENUM ('USER_MANUAL', 'SYSTEM_CALCULATED', 'SYSTEM_IMPORTED');

-- CreateEnum
CREATE TYPE "enum_sync_direction" AS ENUM ('IMPORT', 'EXPORT', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "enum_plan_status" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "enum_plan_proposal_mode" AS ENUM ('ADAPT', 'SUPERSEDE');

-- CreateEnum
CREATE TYPE "enum_competition_importance" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "enum_competition_goal_type" AS ENUM ('FINISH', 'TARGET_TIME', 'PERFORMANCE', 'EXPERIENCE');

-- CreateEnum
CREATE TYPE "enum_competition_status" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "enum_competition_event_source" AS ENUM ('MANUAL', 'AI', 'IMPORTED');

-- CreateEnum
CREATE TYPE "enum_competition_revision_action" AS ENUM ('CREATED', 'UPDATED', 'CANCELLED', 'RESTORED', 'DELETED');

-- CreateEnum
CREATE TYPE "enum_competition_assessment_status" AS ENUM ('SUCCESS', 'FALLBACK', 'FAILED');

-- CreateEnum
CREATE TYPE "enum_plan_source_type" AS ENUM ('MANUAL', 'AI', 'GENERATED', 'IMPORTED', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "enum_plan_share_visibility" AS ENUM ('UNLISTED', 'CATALOG');

-- CreateEnum
CREATE TYPE "enum_plan_share_status" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "enum_plan_share_origin" AS ENUM ('USER_SHARE', 'OFFICIAL');

-- CreateEnum
CREATE TYPE "enum_plan_workout_external_origin" AS ENUM ('LOCAL', 'REMOTE');

-- CreateEnum
CREATE TYPE "enum_plan_workout_external_sync_state" AS ENUM ('SYNCED', 'LOCAL_CHANGED', 'REMOTE_CHANGED', 'CONFLICT', 'LOCAL_DELETED', 'REMOTE_DELETED', 'FAILED');

-- CreateEnum
CREATE TYPE "enum_plan_workout_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'MOVED');

-- CreateEnum
CREATE TYPE "enum_prescription_resolution_mode" AS ENUM ('LEGACY_SNAPSHOT', 'DYNAMIC_ZONE', 'FIXED_VALUE', 'EFFORT_ONLY');

-- CreateEnum
CREATE TYPE "enum_plan_workout_moved_by" AS ENUM ('USER', 'COACH');

-- CreateEnum
CREATE TYPE "enum_plan_workout_activity_link_source" AS ENUM ('MANUAL', 'AUTO', 'AI');

-- CreateEnum
CREATE TYPE "enum_plan_workout_activity_link_role" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "enum_plan_load_source" AS ENUM ('POWER', 'HR', 'PACE', 'RPE', 'SESSION_RPE', 'NONE');

-- CreateEnum
CREATE TYPE "enum_plan_workout_step_type" AS ENUM ('WORK', 'REST', 'REPEAT');

-- CreateEnum
CREATE TYPE "enum_plan_workout_step_intensity" AS ENUM ('ACTIVE', 'REST', 'WARMUP', 'COOLDOWN', 'RECOVERY', 'INTERVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "enum_plan_workout_step_duration_type" AS ENUM ('TIME', 'DISTANCE', 'OPEN', 'CALORIES', 'HR_LESS_THAN', 'HR_GREATER_THAN', 'POWER_LESS_THAN', 'POWER_GREATER_THAN', 'CADENCE_LESS_THAN', 'CADENCE_GREATER_THAN', 'REPEAT_COUNT', 'REPEAT_UNTIL_TIME', 'REPEAT_UNTIL_DISTANCE', 'REPEAT_UNTIL_CALORIES', 'REPEAT_UNTIL_HR_LESS_THAN', 'REPEAT_UNTIL_HR_GREATER_THAN', 'REPEAT_UNTIL_POWER_LESS_THAN', 'REPEAT_UNTIL_POWER_GREATER_THAN', 'REPEAT_UNTIL_CADENCE_LESS_THAN', 'REPEAT_UNTIL_CADENCE_GREATER_THAN');

-- CreateEnum
CREATE TYPE "enum_plan_workout_step_target_type" AS ENUM ('OPEN', 'POWER', 'HEART_RATE', 'CADENCE', 'SPEED', 'GRADE');

-- CreateEnum
CREATE TYPE "enum_plan_workout_value_unit" AS ENUM ('SECONDS', 'METERS', 'CALORIES', 'COUNT', 'WATTS', 'PERCENT', 'BPM', 'RPM', 'KMH', 'DEGREE');

-- CreateEnum
CREATE TYPE "enum_zone_type" AS ENUM ('HEART_RATE', 'POWER', 'PACE');

-- CreateEnum
CREATE TYPE "enum_heart_rate_zone_model" AS ENUM ('MHR', 'FRIEL', 'KARVONEN');

-- CreateEnum
CREATE TYPE "enum_pace_zone_model" AS ENUM ('FRIEL', 'DANIELS');

-- CreateEnum
CREATE TYPE "PowerZoneModel" AS ENUM ('FRIEL', 'VANCE', 'STRYD');

-- CreateEnum
CREATE TYPE "enum_zone_base" AS ENUM ('MHR', 'HRR', 'LTHR', 'CP', 'TP', 'FTP', 'CS', 'CSS', 'VO2MAX', 'CUSTOM');

-- CreateEnum
CREATE TYPE "enum_user_fitness_metric_type" AS ENUM ('CP', 'W_PRIME', 'FTP', 'MAX_HR', 'RESTING_HR', 'LTHR', 'AET_HR', 'CS', 'TP', 'AET_PACE', 'VO2_MAX', 'P_MAX');

-- CreateEnum
CREATE TYPE "UserRegistrationPlatform" AS ENUM ('UNKNOWN', 'WEB', 'IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "UserRegistrationMethod" AS ENUM ('UNKNOWN', 'EMAIL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "UserAcquisitionSource" AS ENUM ('UNKNOWN', 'DIRECT', 'ORGANIC', 'PAID', 'REFERRAL', 'EMAIL', 'CAMPAIGN', 'DOCS', 'DOCS_TOOL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "SelfHostInitializationState" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "enum_ai_coach_message_role" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "enum_ai_coach_session_type" AS ENUM ('CHAT', 'REVIEW');

-- CreateEnum
CREATE TYPE "enum_ai_coach_review_scope" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "enum_athlete_memory_kind" AS ENUM ('OBSERVATION', 'PREFERENCE', 'GOAL', 'CONSTRAINT', 'EVENT', 'PROFILE');

-- CreateEnum
CREATE TYPE "enum_athlete_memory_status" AS ENUM ('ACTIVE', 'SUPERSEDED', 'RESOLVED', 'RETRACTED');

-- CreateEnum
CREATE TYPE "enum_athlete_memory_epistemic_status" AS ENUM ('USER_ASSERTED', 'USER_CONFIRMED', 'MODEL_INFERRED', 'SYSTEM_DERIVED');

-- CreateEnum
CREATE TYPE "enum_athlete_memory_time_precision" AS ENUM ('EXACT', 'DAY', 'APPROXIMATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "enum_athlete_memory_decay_profile" AS ENUM ('ACUTE_RECOVERY', 'TRANSIENT_CONTEXT', 'UNTIL_RESOLVED', 'UNTIL_DATE', 'STABLE', 'EPISODIC');

-- CreateEnum
CREATE TYPE "enum_athlete_memory_source_type" AS ENUM ('AI_COACH_MESSAGE');

-- CreateEnum
CREATE TYPE "enum_athlete_memory_event_operation" AS ENUM ('CREATE', 'REFINE', 'CORROBORATE', 'SUPERSEDE', 'REACTIVATE', 'RESOLVE', 'RETRACT', 'USER_CORRECT');

-- CreateEnum
CREATE TYPE "enum_ai_coach_memory_extraction_job_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "enum_athlete_state_status" AS ENUM ('STABLE', 'STRAINED', 'UNDER_RECOVERED', 'HIGH_CONCERN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "enum_athlete_state_decision_readiness" AS ENUM ('SUFFICIENT', 'NEEDS_USER_INPUT', 'WAITING_FOR_SYNC', 'INSUFFICIENT_BUT_SAFE');

-- CreateEnum
CREATE TYPE "enum_coach_assessment_case_status" AS ENUM ('OPEN', 'ASSESSING', 'WAITING_FOR_DATA', 'WAITING_FOR_USER', 'DECISION_READY', 'RESOLVED', 'SUPERSEDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "enum_coach_assessment_question_status" AS ENUM ('PENDING', 'ANSWERED', 'SKIPPED', 'SUPERSEDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "enum_ai_usage_kind" AS ENUM ('COACH_CHAT', 'ACTIVITY_ANALYSIS', 'PLAN_GENERATION', 'PLAN_ADJUSTMENT', 'REVIEW_DAILY', 'REVIEW_WEEKLY', 'REVIEW_MONTHLY', 'CONTEXT_COMPRESS', 'OTHER');

-- CreateEnum
CREATE TYPE "enum_ai_model_purpose" AS ENUM ('DEFAULT', 'REASONING');

-- CreateEnum
CREATE TYPE "enum_ai_operation_status" AS ENUM ('STARTED', 'RUNNING', 'COMPLETED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "enum_ai_usage_status" AS ENUM ('SUCCESS', 'FAILED', 'RETRY');

-- CreateEnum
CREATE TYPE "enum_coach_action_type" AS ENUM ('PLAN_WORKOUT_ADD', 'PLAN_WORKOUT_UPDATE', 'PLAN_WORKOUT_STATUS', 'PLAN_SHIFT', 'PLAN_LIFECYCLE', 'ACTIVITY_LINK', 'ACTIVITY_UNLINK', 'ACTIVITY_META_UPDATE', 'ACTIVITY_SESSION_RPE', 'ACTIVITY_DELETE', 'USER_THRESHOLD_UPDATE', 'USER_BODY_METRIC_UPDATE', 'COMPETITION_EVENT_MUTATION');

-- CreateEnum
CREATE TYPE "enum_coach_action_risk_tier" AS ENUM ('LOW', 'HIGH');

-- CreateEnum
CREATE TYPE "enum_coach_context_status" AS ENUM ('SCHEDULED', 'ACTIVE', 'SUPERSEDED', 'FINALIZED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "enum_coach_event_type" AS ENUM ('WORKOUT_COMPLETED', 'WORKOUT_LINKED', 'INCIDENT_REPORTED', 'ADAPTATION_APPLIED', 'REVIEW_DAILY', 'REVIEW_WEEKLY', 'REVIEW_MONTHLY', 'CONTEXT_FINALIZED', 'CONTEXT_SUPERSEDED');

-- CreateEnum
CREATE TYPE "enum_coach_progress_label" AS ENUM ('UP', 'STABLE', 'DOWN');

-- CreateEnum
CREATE TYPE "enum_coach_thread_kind" AS ENUM ('MAIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "enum_coach_flow_status" AS ENUM ('OPEN', 'SQUASHED', 'REBASE_REQUIRED', 'APPLIED', 'CLOSED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "enum_coach_decision_state" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'REJECTED', 'APPLIED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "enum_coach_decision_risk_tier" AS ENUM ('LOW', 'HIGH');

-- CreateEnum
CREATE TYPE "enum_coach_apply_result" AS ENUM ('APPLIED', 'CONFLICT', 'REBASE_REQUIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "enum_review_digest_type" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "enum_review_job_status" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "enum_activity_ai_review_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'SKIPPED');

-- CreateEnum
CREATE TYPE "enum_activity_ai_review_trigger" AS ENUM ('IMPORT', 'RECOMPUTE', 'MANUAL', 'BACKFILL');

-- CreateEnum
CREATE TYPE "enum_notification_kind" AS ENUM ('FITNESS_ASSESSMENT', 'REVIEW_DIGEST', 'IMPORT_BATCH_COMPLETED', 'IMPORT_BATCH_PARTIAL_FAILED', 'THIRD_PARTY_EXPORT_FAILED', 'PLAN_ACTIVATION_BLOCKED', 'PLAN_ZONE_REASSESSMENT_REQUIRED');

-- CreateEnum
CREATE TYPE "enum_import_batch_job_status" AS ENUM ('QUEUED', 'RUNNING', 'POST_PROCESSING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "enum_import_item_job_status" AS ENUM ('QUEUED', 'NORMALIZING', 'DEDUPING', 'MATERIALIZING', 'PARQUET_BUILDING', 'ANALYZING', 'DONE', 'SKIPPED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "enum_user_post_process_job_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "enum_account_deletion_job_status" AS ENUM ('QUEUED', 'REVOKING_PROVIDERS', 'DELETING_STORAGE', 'PURGING_DATABASE', 'RETRY_WAIT', 'MANUAL_REVIEW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "enum_account_deletion_job_stage" AS ENUM ('REVOKING_PROVIDERS', 'DELETING_STORAGE', 'PURGING_DATABASE');

-- CreateEnum
CREATE TYPE "enum_user_data_export_job_status" AS ENUM ('QUEUED', 'SNAPSHOTTING', 'PACKAGING', 'UPLOADING', 'READY', 'RETRY_WAIT', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "enum_user_data_export_mode" AS ENUM ('FULL_BACKUP', 'AI_ANALYSIS');

-- CreateEnum
CREATE TYPE "enum_user_data_export_location_privacy" AS ENUM ('EXACT', 'REDACT_FREQUENT_LOCATIONS', 'REMOVE_GPS');

-- CreateEnum
CREATE TYPE "enum_activity_recompute_job_status" AS ENUM ('SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "enum_activity_map_thumb_job_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "enum_import_event_level" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "enum_import_pipeline_stage" AS ENUM ('BATCH_CREATED', 'SOURCE_REGISTERED', 'NORMALIZING', 'DEDUPING', 'MATERIALIZING', 'PARQUET_BUILDING', 'ANALYZING', 'POST_PROCESSING', 'NOTIFYING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PublicAiReviewReservationStatus" AS ENUM ('RESERVED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "t_sport_definition" (
    "code" TEXT NOT NULL,
    "family" "enum_sport_type" NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "zone_family" "enum_sport_type",
    "pace_basis_meters" INTEGER,
    "cadence_unit" "enum_sport_cadence_unit",
    "default_workout_structure_kind" "enum_workout_structure_kind",
    "fit_sport" TEXT,
    "fit_sub_sport" TEXT,
    "is_default_for_family" BOOLEAN NOT NULL DEFAULT false,
    "supports_planning" BOOLEAN NOT NULL DEFAULT false,
    "supports_structured_workout" BOOLEAN NOT NULL DEFAULT false,
    "supports_distance" BOOLEAN NOT NULL DEFAULT false,
    "supports_pace" BOOLEAN NOT NULL DEFAULT false,
    "supports_speed" BOOLEAN NOT NULL DEFAULT false,
    "supports_power" BOOLEAN NOT NULL DEFAULT false,
    "supports_cadence" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_sport_definition_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "t_provider_sport_mapping" (
    "id" TEXT NOT NULL,
    "provider" "enum_third_party_provider" NOT NULL,
    "external_code" TEXT NOT NULL,
    "external_sub_code" TEXT NOT NULL DEFAULT '',
    "direction" "enum_provider_sport_mapping_direction" NOT NULL DEFAULT 'BOTH',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "sport_code" TEXT NOT NULL,
    "metadata" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_provider_sport_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_zone_setting" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "sport_type" "enum_sport_type" NOT NULL,
    "zone_type" "enum_zone_type" NOT NULL,
    "zone_base" "enum_zone_base",
    "change_source" "enum_change_source",
    "origin_provider" "enum_third_party_provider",
    "origin_external_id" TEXT,
    "origin_checksum" TEXT,
    "origin_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_user_zone_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_zones" (
    "id" SERIAL NOT NULL,
    "user_zone_setting_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT,
    "min" INTEGER,
    "max" INTEGER,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_user_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_auto_update_config" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "metric" "enum_user_fitness_metric_type" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_user_auto_update_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_fitness_metric" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sport" "enum_sport_type" NOT NULL DEFAULT 'UNKNOWN',
    "type" "enum_user_fitness_metric_type" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "value2" DOUBLE PRECISION,
    "source" "enum_metric_source" NOT NULL DEFAULT 'MANUAL',
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_source" "enum_change_source",
    "origin_provider" "enum_third_party_provider",
    "origin_external_id" TEXT,
    "origin_checksum" TEXT,
    "origin_payload" JSONB,
    "origin_synced_at" TIMESTAMP(3),

    CONSTRAINT "t_user_fitness_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_zone_setting_version" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sport_type" "enum_sport_type" NOT NULL,
    "zone_type" "enum_zone_type" NOT NULL,
    "zone_base" "enum_zone_base",
    "zones" JSONB NOT NULL,
    "change_source" "enum_change_source" NOT NULL,
    "origin_provider" "enum_third_party_provider",
    "origin_external_id" TEXT,
    "origin_checksum" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_user_zone_setting_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL,
    "image" TEXT,
    "preferred_locale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "registration_platform" "UserRegistrationPlatform" NOT NULL DEFAULT 'UNKNOWN',
    "registration_method" "UserRegistrationMethod" NOT NULL DEFAULT 'UNKNOWN',
    "acquisition_source" "UserAcquisitionSource" NOT NULL DEFAULT 'UNKNOWN',
    "is_new_user" BOOLEAN NOT NULL DEFAULT true,
    "account_deletion_requested_at" TIMESTAMP(3),

    CONSTRAINT "t_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_self_host_instance" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "state" "SelfHostInitializationState" NOT NULL DEFAULT 'PENDING',
    "bootstrap_token_hash" TEXT,
    "bootstrap_token_expires_at" TIMESTAMP(3),
    "owner_user_id" TEXT,
    "ai_provider" TEXT,
    "ai_base_url" TEXT,
    "ai_default_model" TEXT,
    "ai_default_model_context_tokens" INTEGER,
    "ai_reasoning_model" TEXT,
    "ai_reasoning_model_context_tokens" INTEGER,
    "ai_web_search_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ai_api_key_encrypted" TEXT,
    "ai_config_updated_at" TIMESTAMP(3),
    "telemetry_consent_granted" BOOLEAN,
    "telemetry_consent_version" TEXT,
    "telemetry_consent_source" TEXT,
    "telemetry_consent_updated_at" TIMESTAMP(3),
    "initialized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_self_host_instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_competition_event" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sport_type" "enum_sport_type" NOT NULL,
    "sport_definition_code" TEXT,
    "distance_meters" DOUBLE PRECISION,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "start_time_minute" INTEGER,
    "timezone" TEXT,
    "importance" "enum_competition_importance" NOT NULL DEFAULT 'HIGH',
    "goal_type" "enum_competition_goal_type" NOT NULL,
    "target_time_seconds" INTEGER,
    "location" TEXT,
    "notes" TEXT,
    "status" "enum_competition_status" NOT NULL DEFAULT 'PLANNED',
    "source" "enum_competition_event_source" NOT NULL DEFAULT 'MANUAL',
    "idempotency_key" TEXT,
    "idempotency_hash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_competition_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_competition_event_revision" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_version" INTEGER NOT NULL,
    "action" "enum_competition_revision_action" NOT NULL,
    "actor_type" TEXT NOT NULL,
    "request_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_competition_event_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_competition_impact_assessment" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_start_date" DATE NOT NULL,
    "scope_end_date" DATE NOT NULL,
    "anchor_date" DATE NOT NULL,
    "input_hash" TEXT NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "result" JSONB,
    "status" "enum_competition_assessment_status" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "model" TEXT,
    "provider" TEXT,
    "prompt_version" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "fallback_version" TEXT,
    "duration_ms" INTEGER,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "t_competition_impact_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_external_provider_connection" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "enum_third_party_provider" NOT NULL,
    "external_athlete_id" TEXT,
    "credential_ciphertext" TEXT NOT NULL,
    "credential_last4" TEXT,
    "credential_fingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_sync_started_at" TIMESTAMP(3),
    "last_sync_completed_at" TIMESTAMP(3),
    "last_synced_activity_at" TIMESTAMP(3),
    "sync_activities" BOOLEAN NOT NULL DEFAULT true,
    "sync_scheduled_activities" BOOLEAN NOT NULL DEFAULT true,
    "sync_wellness" BOOLEAN NOT NULL DEFAULT false,
    "export_activities" BOOLEAN NOT NULL DEFAULT false,
    "export_wellness" BOOLEAN NOT NULL DEFAULT false,
    "sync_sport_settings" BOOLEAN NOT NULL DEFAULT false,
    "export_sport_settings" BOOLEAN NOT NULL DEFAULT false,
    "last_error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_external_provider_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_external_oauth_state" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "enum_third_party_provider" NOT NULL,
    "state_hash" TEXT NOT NULL,
    "payload" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_external_oauth_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_external_provider_webhook_event" (
    "id" TEXT NOT NULL,
    "provider" "enum_third_party_provider" NOT NULL,
    "event_type" TEXT NOT NULL,
    "external_user_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "raw_checksum" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_external_provider_webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_calendar_subscription" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ACTIVE_PLAN',
    "last_accessed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "t_calendar_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_ai_coach_session" (
    "user_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "type" "enum_ai_coach_session_type" NOT NULL DEFAULT 'CHAT',
    "review_scope" "enum_ai_coach_review_scope",
    "title" TEXT,
    "lang" TEXT,
    "summary" TEXT,
    "next_sequence" INTEGER NOT NULL DEFAULT 1,
    "pinned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_ai_coach_session_pkey" PRIMARY KEY ("user_id","id")
);

-- CreateTable
CREATE TABLE "t_ai_coach_message" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "enum_ai_coach_message_role" NOT NULL,
    "content" TEXT NOT NULL,
    "message" JSONB,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_ai_coach_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_athlete_memory_fact" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "enum_athlete_memory_kind" NOT NULL,
    "category" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "value" JSONB,
    "status" "enum_athlete_memory_status" NOT NULL DEFAULT 'ACTIVE',
    "epistemic_status" "enum_athlete_memory_epistemic_status" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "event_start" TIMESTAMPTZ(3),
    "event_end" TIMESTAMPTZ(3),
    "time_text" TEXT,
    "time_precision" "enum_athlete_memory_time_precision" NOT NULL,
    "timezone" TEXT NOT NULL,
    "valid_from" TIMESTAMPTZ(3),
    "valid_until" TIMESTAMPTZ(3),
    "decay_profile" "enum_athlete_memory_decay_profile" NOT NULL,
    "relevance_anchor_at" TIMESTAMPTZ(3) NOT NULL,
    "review_after" TIMESTAMPTZ(3),
    "superseded_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "t_athlete_memory_fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_athlete_memory_evidence" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fact_id" TEXT NOT NULL,
    "source_type" "enum_athlete_memory_source_type" NOT NULL,
    "source_message_id" TEXT NOT NULL,
    "asserted_at" TIMESTAMPTZ(3) NOT NULL,
    "source_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_athlete_memory_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_athlete_memory_event" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fact_id" TEXT NOT NULL,
    "evidence_id" TEXT,
    "job_id" TEXT,
    "operation" "enum_athlete_memory_event_operation" NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "reason_code" TEXT NOT NULL,
    "model" TEXT,
    "policy_version" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_athlete_memory_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_ai_coach_memory_extraction_job" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "source_message_id" TEXT NOT NULL,
    "status" "enum_ai_coach_memory_extraction_job_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMPTZ(3),
    "model" TEXT,
    "policy_version" TEXT NOT NULL,
    "decision_json" JSONB,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "t_ai_coach_memory_extraction_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_athlete_state_assessment" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "as_of" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "state" "enum_athlete_state_status" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "decision_readiness" "enum_athlete_state_decision_readiness" NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "model" TEXT,
    "evidence_snapshot" JSONB NOT NULL,
    "dimensions" JSONB NOT NULL,
    "hypotheses" JSONB NOT NULL,
    "evidence_requests" JSONB NOT NULL,
    "safety_flags" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "latest_source_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "superseded_at" TIMESTAMPTZ(3),
    "superseded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_athlete_state_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_assessment_case" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "enum_coach_assessment_case_status" NOT NULL DEFAULT 'OPEN',
    "trigger_type" TEXT NOT NULL,
    "trigger_ref" TEXT,
    "as_of" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "assessment_id" TEXT NOT NULL,
    "context_id" TEXT,
    "branch_id" TEXT,
    "decision_id" TEXT,
    "session_id" TEXT,
    "plan_execution_fact_hash" TEXT,
    "current_outcome" JSONB,
    "cooldown_until" TIMESTAMPTZ(3),
    "follow_up_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_coach_assessment_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_assessment_question" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "status" "enum_coach_assessment_question_status" NOT NULL DEFAULT 'PENDING',
    "evidence_kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decision_impact" TEXT NOT NULL,
    "question" JSONB NOT NULL,
    "answer" JSONB,
    "event_start" TIMESTAMPTZ(3),
    "event_end" TIMESTAMPTZ(3),
    "prompt_message_id" TEXT,
    "answer_message_id" TEXT,
    "asked_at" TIMESTAMPTZ(3),
    "answered_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_coach_assessment_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_run" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "origin_user_message_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "active_attempt_id" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "pending_interaction" JSONB,
    "execution_ms" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "t_coach_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_run_attempt" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "input_message_id" TEXT NOT NULL,
    "parent_attempt_id" TEXT,
    "interaction_id" TEXT,
    "submission_id" TEXT,
    "answers_hash" TEXT,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "completion_reason" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "operation_id" TEXT NOT NULL,
    "cancel_requested_at" TIMESTAMP(3),
    "owner_id" TEXT NOT NULL,
    "heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "mutation_started" BOOLEAN NOT NULL DEFAULT false,
    "unresolved_tools" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "t_coach_run_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_import_batch_job" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_kind" "enum_import_source_kind" NOT NULL,
    "status" "enum_import_batch_job_status" NOT NULL DEFAULT 'QUEUED',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "request_context" JSONB,
    "summary" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notification_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_import_batch_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_import_source_object" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_kind" "enum_import_source_kind" NOT NULL,
    "provider" "enum_third_party_provider",
    "source_uid" TEXT NOT NULL,
    "account_ref" TEXT,
    "external_id" TEXT,
    "object_type" TEXT NOT NULL DEFAULT 'activity',
    "file_name" TEXT,
    "file_key" TEXT,
    "raw_storage_key" TEXT,
    "raw_checksum" TEXT,
    "raw_payload" JSONB,
    "metadata" JSONB,
    "timeline_title" TEXT,
    "timeline_start_time" TIMESTAMP(3),
    "discovered_at" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "origin_provider" "enum_third_party_provider",
    "resolution_status" "enum_import_source_resolution_status" NOT NULL DEFAULT 'IMPORTABLE',
    "resolution_reason" "enum_import_source_resolution_reason",
    "suggested_provider" "enum_third_party_provider",
    "resolved_activity_id" INTEGER,
    "resolved_at" TIMESTAMP(3),
    "origin_sync_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_import_source_object_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_origin_activity_sync_request" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "enum_third_party_provider" NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" "enum_origin_activity_sync_request_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error_code" TEXT,
    "last_error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "lock_token" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_origin_activity_sync_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_canonical_activity_snapshot" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "batch_job_id" TEXT,
    "item_job_id" TEXT NOT NULL,
    "source_object_id" TEXT,
    "schema_version" TEXT NOT NULL DEFAULT 'v1',
    "payload" JSONB NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "sport_type" "enum_sport_type",
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "timezone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_canonical_activity_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_import_item_job" (
    "id" TEXT NOT NULL,
    "batch_job_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_object_id" TEXT NOT NULL,
    "activity_id" INTEGER,
    "source_kind" "enum_import_source_kind" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "enum_import_item_job_status" NOT NULL DEFAULT 'QUEUED',
    "source_ref" JSONB,
    "source_uid" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "outcome" TEXT,
    "analysis_required" BOOLEAN NOT NULL DEFAULT true,
    "last_error_code" TEXT,
    "last_error" TEXT,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "lock_token" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_import_item_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_source" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "batch_job_id" TEXT,
    "source_object_id" TEXT,
    "canonical_snapshot_id" TEXT,
    "source_kind" "enum_import_source_kind" NOT NULL,
    "provider" "enum_third_party_provider",
    "source_uid" TEXT NOT NULL,
    "account_ref" TEXT,
    "external_id" TEXT,
    "file_name" TEXT,
    "file_key" TEXT,
    "dedupe_key" TEXT,
    "source_checksum" TEXT,
    "metadata" JSONB,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_imported_at" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_activity_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_import_draft" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_object_id" TEXT,
    "source_kind" "enum_import_source_kind" NOT NULL DEFAULT 'FILE',
    "source_uid" TEXT NOT NULL,
    "file_name" TEXT,
    "file_key" TEXT,
    "raw_storage_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "idempotency_key" TEXT,
    "idempotency_hash" TEXT,
    "payload" JSONB NOT NULL,
    "summary" JSONB,
    "session_rpe" DOUBLE PRECISION,
    "committed_activity_id" INTEGER,
    "committed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_activity_import_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_post_process_job" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "batch_job_id" TEXT NOT NULL,
    "status" "enum_user_post_process_job_status" NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "lock_token" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "recompute_from" TIMESTAMP(3),
    "recompute_to" TIMESTAMP(3),
    "affected_sport_types" JSONB,
    "summary" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_user_post_process_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_account_deletion_job" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "subject_hash" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "enum_account_deletion_job_status" NOT NULL DEFAULT 'QUEUED',
    "resume_stage" "enum_account_deletion_job_stage" NOT NULL DEFAULT 'REVOKING_PROVIDERS',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 10,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_expires_at" TIMESTAMP(3),
    "lock_token" TEXT,
    "storage_manifest" JSONB NOT NULL,
    "provider_manifest" JSONB NOT NULL,
    "extension_snapshot" JSONB NOT NULL,
    "notification_email_ciphertext" TEXT NOT NULL,
    "notification_locale" TEXT NOT NULL DEFAULT 'en',
    "last_error_code" TEXT,
    "last_error_detail" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_account_deletion_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_data_export_job" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "mode" "enum_user_data_export_mode" NOT NULL,
    "location_privacy" "enum_user_data_export_location_privacy" NOT NULL,
    "include_original_files" BOOLEAN NOT NULL DEFAULT true,
    "status" "enum_user_data_export_job_status" NOT NULL DEFAULT 'QUEUED',
    "schema_version" TEXT NOT NULL DEFAULT 'trainingload-export/v1',
    "data_cutoff_at" TIMESTAMP(3) NOT NULL,
    "progress_stage" TEXT,
    "progress_current" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "artifact_storage_key" TEXT,
    "artifact_file_name" TEXT,
    "artifact_size_bytes" BIGINT,
    "artifact_sha256" TEXT,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_expires_at" TIMESTAMP(3),
    "lock_token" TEXT,
    "last_error_code" TEXT,
    "last_error_detail" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_user_data_export_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_recompute_job" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'FITNESS_METRIC_CHANGED',
    "metric_type" TEXT NOT NULL,
    "sport_type" "enum_sport_type",
    "affected_pipelines" JSONB,
    "recompute_from" TIMESTAMP(3) NOT NULL,
    "recompute_to" TIMESTAMP(3) NOT NULL,
    "lookback_days" INTEGER NOT NULL,
    "status" "enum_activity_recompute_job_status" NOT NULL DEFAULT 'SCHEDULED',
    "available_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "trigger_source" TEXT,
    "trigger_payload" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_activity_recompute_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_map_thumb_job" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "activity_hash_id" TEXT NOT NULL,
    "polyline_fingerprint" TEXT NOT NULL,
    "render_version" INTEGER NOT NULL DEFAULT 1,
    "map_style" TEXT NOT NULL DEFAULT 'mapbox/outdoors-v12',
    "width" INTEGER NOT NULL DEFAULT 320,
    "height" INTEGER NOT NULL DEFAULT 180,
    "status" "enum_activity_map_thumb_job_status" NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_expires_at" TIMESTAMP(3),
    "lock_token" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "r2_key" TEXT,
    "r2_url" TEXT,
    "r2_dark_key" TEXT,
    "r2_dark_url" TEXT,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_activity_map_thumb_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_import_event_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "batch_job_id" TEXT,
    "item_job_id" TEXT,
    "post_process_job_id" TEXT,
    "level" "enum_import_event_level" NOT NULL DEFAULT 'INFO',
    "stage" "enum_import_pipeline_stage" NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_import_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_review_schedule" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "enum_review_digest_type" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "send_at_local_time" TEXT NOT NULL DEFAULT '05:00',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_review_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_review_job" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "enum_review_digest_type" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "enum_review_job_status" NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_review_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_review_digest" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "enum_review_digest_type" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "input_schema_version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT,
    "ai_summary_markdown" TEXT,
    "model" TEXT,
    "prompt_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "job_id" TEXT,

    CONSTRAINT "t_review_digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_review_digest_snapshot" (
    "id" TEXT NOT NULL,
    "digest_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT,
    "total_sessions" INTEGER,
    "total_duration_sec" INTEGER,
    "total_distance_m" DOUBLE PRECISION,
    "total_tss" DOUBLE PRECISION,
    "total_load" DOUBLE PRECISION,
    "run_total_sessions" INTEGER,
    "run_total_duration_sec" INTEGER,
    "run_total_distance_m" DOUBLE PRECISION,
    "run_total_tss" DOUBLE PRECISION,
    "run_total_load" DOUBLE PRECISION,
    "cycling_total_sessions" INTEGER,
    "cycling_total_duration_sec" INTEGER,
    "cycling_total_distance_m" DOUBLE PRECISION,
    "cycling_total_tss" DOUBLE PRECISION,
    "cycling_total_load" DOUBLE PRECISION,
    "swim_total_sessions" INTEGER,
    "swim_total_duration_sec" INTEGER,
    "swim_total_distance_m" DOUBLE PRECISION,
    "swim_total_tss" DOUBLE PRECISION,
    "swim_total_load" DOUBLE PRECISION,
    "delta_sessions" INTEGER,
    "delta_duration_sec" INTEGER,
    "delta_distance_m" DOUBLE PRECISION,
    "delta_tss" DOUBLE PRECISION,
    "delta_load" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_review_digest_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_review_digest_totals_by_sport" (
    "id" TEXT NOT NULL,
    "digest_id" TEXT NOT NULL,
    "sport_type" "enum_sport_type" NOT NULL,
    "sessions" INTEGER,
    "duration_sec" INTEGER,
    "distance_m" DOUBLE PRECISION,
    "tss" DOUBLE PRECISION,

    CONSTRAINT "t_review_digest_totals_by_sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_review_digest_highlight_activity" (
    "id" TEXT NOT NULL,
    "digest_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "activity_id" INTEGER,
    "sport_type" "enum_sport_type",
    "start_time" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "distance_m" DOUBLE PRECISION,
    "tss" DOUBLE PRECISION,
    "title" TEXT,

    CONSTRAINT "t_review_digest_highlight_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_review_digest_trend_point" (
    "id" TEXT NOT NULL,
    "digest_id" TEXT NOT NULL,
    "point_date" TIMESTAMP(3) NOT NULL,
    "sessions" INTEGER,
    "duration_sec" INTEGER,
    "distance_m" DOUBLE PRECISION,
    "tss" DOUBLE PRECISION,

    CONSTRAINT "t_review_digest_trend_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_review_digest_warning" (
    "id" TEXT NOT NULL,
    "digest_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT,
    "message" TEXT,

    CONSTRAINT "t_review_digest_warning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "enum_notification_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "body_markdown" TEXT,
    "data" JSONB,
    "digest_id" TEXT,
    "import_batch_job_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_sessions" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "t_user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_accounts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_user_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "t_user_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_auth_rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "t_auth_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_oauth_client" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "skip_consent" BOOLEAN,
    "enable_end_session" BOOLEAN,
    "subject_type" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tos" TEXT,
    "policy" TEXT,
    "software_id" TEXT,
    "software_version" TEXT,
    "software_statement" TEXT,
    "redirect_uris" TEXT[],
    "post_logout_redirect_uris" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "token_endpoint_auth_method" TEXT,
    "grant_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "response_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "public" BOOLEAN,
    "type" TEXT,
    "require_pkce" BOOLEAN,
    "reference_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "t_oauth_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_oauth_refresh_token" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "session_id" TEXT,
    "user_id" TEXT NOT NULL,
    "reference_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" TIMESTAMP(3),
    "auth_time" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "t_oauth_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_oauth_access_token" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "session_id" TEXT,
    "user_id" TEXT,
    "reference_id" TEXT,
    "refresh_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "t_oauth_access_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_oauth_consent" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT,
    "reference_id" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_oauth_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_jwks" (
    "id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "t_jwks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "hash_id" TEXT NOT NULL,
    "file_key" TEXT,
    "file_type" TEXT,
    "file_name" TEXT,
    "file_size" INTEGER,
    "file_link" TEXT,
    "user_id" TEXT NOT NULL,
    "created_by_batch_job_id" TEXT,
    "index" INTEGER,
    "activity_name" TEXT,
    "sport_type" "enum_sport_type",
    "sport_definition_code" TEXT,
    "sub_sport" INTEGER,
    "description" TEXT,
    "session_rpe" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3),
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "timezone" TEXT,
    "sample_sec" DOUBLE PRECISION,
    "start_lat" DOUBLE PRECISION,
    "start_lng" DOUBLE PRECISION,
    "end_lat" DOUBLE PRECISION,
    "end_lng" DOUBLE PRECISION,
    "timer_time" INTEGER,
    "elapsed_time" INTEGER,
    "distance" DOUBLE PRECISION,
    "ascent" DOUBLE PRECISION,
    "descent" DOUBLE PRECISION,
    "pool_length" DOUBLE PRECISION,
    "pool_length_unit" TEXT,
    "num_laps" INTEGER,
    "num_lengths" INTEGER,
    "num_active_lengths" INTEGER,
    "enhanced_ascent" DOUBLE PRECISION,
    "enhanced_descent" DOUBLE PRECISION,
    "enhanced_min_elevation" DOUBLE PRECISION,
    "enhanced_max_elevation" DOUBLE PRECISION,
    "max_speed" DOUBLE PRECISION,
    "avg_speed" DOUBLE PRECISION,
    "min_power" DOUBLE PRECISION,
    "max_power" DOUBLE PRECISION,
    "avg_power" DOUBLE PRECISION,
    "avg_cadence" DOUBLE PRECISION,
    "max_cadence" DOUBLE PRECISION,
    "avg_heart_rate" INTEGER,
    "max_heart_rate" INTEGER,
    "min_heart_rate" INTEGER,
    "cycles" INTEGER,
    "work" INTEGER,
    "strokes" INTEGER,
    "calories" INTEGER,
    "fat_calories" INTEGER,
    "ae_power" DOUBLE PRECISION,
    "re" DOUBLE PRECISION,
    "ei" DOUBLE PRECISION,
    "aerobic_decoupling_pw_hr" DOUBLE PRECISION,
    "aerobic_decoupling_pa_hr" DOUBLE PRECISION,
    "avg_left_right_balance" DOUBLE PRECISION,
    "max_hr_drop" INTEGER,
    "avg_aerobic_efficiency" DOUBLE PRECISION,
    "avg_gap" DOUBLE PRECISION,
    "effective_distance" DOUBLE PRECISION,
    "ngp" DOUBLE PRECISION,
    "x_pace" DOUBLE PRECISION,
    "x_gap" DOUBLE PRECISION,
    "vi_pace" DOUBLE PRECISION,
    "vi_gap" DOUBLE PRECISION,
    "third_party_provider" "enum_third_party_provider",
    "third_party_activity_id" TEXT,
    "synced_at" TIMESTAMP(3),
    "e_ftp" DOUBLE PRECISION,
    "e_cp" DOUBLE PRECISION,
    "e_w_prime" DOUBLE PRECISION,
    "e_pmax" DOUBLE PRECISION,
    "state" INTEGER NOT NULL DEFAULT 1,
    "status" "enum_activity_status" NOT NULL DEFAULT 'PADDING',
    "processing_status" "enum_activity_processing_status" DEFAULT 'RECEIVED',
    "processing_updated_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "merged_into_activity_id" INTEGER,

    CONSTRAINT "t_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_weather_snapshot" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "enum_activity_weather_status" NOT NULL DEFAULT 'PENDING',
    "unavailable_reason" "enum_activity_weather_unavailable_reason",
    "sample_latitude_e3" INTEGER,
    "sample_longitude_e3" INTEGER,
    "query_recorded_at" TIMESTAMP(3),
    "sampled_at" TIMESTAMP(3),
    "source" VARCHAR(32),
    "source_modified" BOOLEAN NOT NULL DEFAULT true,
    "attribution_service_name" VARCHAR(64),
    "attribution_legal_url" VARCHAR(512),
    "input_fingerprint" VARCHAR(64),
    "condition_code" VARCHAR(32),
    "source_condition_code" VARCHAR(64),
    "temperature_c" DOUBLE PRECISION,
    "apparent_temperature_c" DOUBLE PRECISION,
    "dew_point_c" DOUBLE PRECISION,
    "wind_chill_c" DOUBLE PRECISION,
    "heat_index_c" DOUBLE PRECISION,
    "wind_speed_kph" DOUBLE PRECISION,
    "wind_gust_kph" DOUBLE PRECISION,
    "wind_direction_deg" INTEGER,
    "humidity_pct" INTEGER,
    "cloud_cover_pct" INTEGER,
    "pressure_hpa" DOUBLE PRECISION,
    "normalization_version" INTEGER NOT NULL DEFAULT 1,
    "fetched_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" VARCHAR(64),
    "lease_expires_at" TIMESTAMP(3),
    "lock_token" VARCHAR(64),

    CONSTRAINT "t_activity_weather_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_merge_audit" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "survivor_activity_id" INTEGER NOT NULL,
    "loser_activity_ids" JSONB NOT NULL,
    "source_checksum" TEXT NOT NULL,
    "matcher_version" TEXT NOT NULL DEFAULT 'historical-exact-v1',
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "snapshot" JSONB NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolled_back_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_activity_merge_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_fitness_metrics_snapshot" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "sport" "enum_sport_type" NOT NULL DEFAULT 'UNKNOWN',
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution_version" INTEGER NOT NULL DEFAULT 2,
    "provenance" JSONB,
    "ftp_value" DOUBLE PRECISION,
    "ftp_value2" DOUBLE PRECISION,
    "cp_value" DOUBLE PRECISION,
    "cp_value2" DOUBLE PRECISION,
    "max_hr_value" DOUBLE PRECISION,
    "lthr_value" DOUBLE PRECISION,
    "rest_hr_value" DOUBLE PRECISION,
    "cs_value" DOUBLE PRECISION,
    "cs_value2" DOUBLE PRECISION,

    CONSTRAINT "t_activity_fitness_metrics_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_bike_score" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "sport" "enum_sport_type",
    "x_power" DOUBLE PRECISION,
    "variability_index" DOUBLE PRECISION,
    "relative_intensity" DOUBLE PRECISION,
    "bike_score" DOUBLE PRECISION,
    "response_index" DOUBLE PRECISION,
    "aerobic_tiss" DOUBLE PRECISION,
    "anaerobic_tiss" DOUBLE PRECISION,
    "tiss_aerobicity" DOUBLE PRECISION,
    "algorithm_version" INTEGER,
    "duration_sec" DOUBLE PRECISION,
    "covered_seconds" DOUBLE PRECISION,
    "coverage_ratio" DOUBLE PRECISION,
    "parameters" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_bike_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_coggan" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "sport" "enum_sport_type",
    "isopower" DOUBLE PRECISION,
    "variability_index" DOUBLE PRECISION,
    "intensity_factor" DOUBLE PRECISION,
    "bike_stress" DOUBLE PRECISION,
    "tss_per_hour" DOUBLE PRECISION,
    "efficiency_factor" DOUBLE PRECISION,
    "algorithm_version" INTEGER,
    "power_source" TEXT,
    "duration_sec" DOUBLE PRECISION,
    "covered_seconds" DOUBLE PRECISION,
    "coverage_ratio" DOUBLE PRECISION,
    "parameters" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_coggan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_metric_distribution" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "metric" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "average" DOUBLE PRECISION,
    "active_average" DOUBLE PRECISION,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "q25" DOUBLE PRECISION,
    "median" DOUBLE PRECISION,
    "q75" DOUBLE PRECISION,
    "standard_deviation" DOUBLE PRECISION,
    "sample_count" INTEGER NOT NULL,
    "covered_seconds" DOUBLE PRECISION NOT NULL,
    "activity_seconds" DOUBLE PRECISION NOT NULL,
    "coverage_ratio" DOUBLE PRECISION NOT NULL,
    "algorithm_version" INTEGER NOT NULL,
    "parameters" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_metric_distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_terrain_summary" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "uphill_seconds" DOUBLE PRECISION NOT NULL,
    "flat_seconds" DOUBLE PRECISION NOT NULL,
    "downhill_seconds" DOUBLE PRECISION NOT NULL,
    "uphill_distance_m" DOUBLE PRECISION NOT NULL,
    "flat_distance_m" DOUBLE PRECISION NOT NULL,
    "downhill_distance_m" DOUBLE PRECISION NOT NULL,
    "uphill_avg_speed_mps" DOUBLE PRECISION,
    "flat_avg_speed_mps" DOUBLE PRECISION,
    "downhill_avg_speed_mps" DOUBLE PRECISION,
    "uphill_avg_cadence" DOUBLE PRECISION,
    "flat_avg_cadence" DOUBLE PRECISION,
    "downhill_avg_cadence" DOUBLE PRECISION,
    "ascent_speed_m_per_hour" DOUBLE PRECISION,
    "profile" TEXT NOT NULL,
    "grade_covered_seconds" DOUBLE PRECISION NOT NULL,
    "activity_seconds" DOUBLE PRECISION NOT NULL,
    "grade_coverage_ratio" DOUBLE PRECISION NOT NULL,
    "algorithm_version" INTEGER NOT NULL,
    "parameters" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_terrain_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_swim_score" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "sport" "enum_sport_type",
    "swim_score" DOUBLE PRECISION,
    "algorithm_version" INTEGER,
    "threshold_speed_mps" DOUBLE PRECISION,
    "x_power" DOUBLE PRECISION,
    "duration_sec" DOUBLE PRECISION,
    "covered_seconds" DOUBLE PRECISION,
    "coverage_ratio" DOUBLE PRECISION,
    "parameters" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_swim_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_govss" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "sport" "enum_sport_type",
    "govss" DOUBLE PRECISION,
    "algorithm_version" INTEGER,
    "grade_mode" TEXT,
    "covered_seconds" DOUBLE PRECISION,
    "grade_coverage_ratio" DOUBLE PRECISION,
    "parameters" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_govss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_calculated_power" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "sport" "enum_sport_type" NOT NULL,
    "model" TEXT NOT NULL,
    "model_version" INTEGER NOT NULL,
    "avg_power" DOUBLE PRECISION,
    "max_power" DOUBLE PRECISION,
    "sample_count" INTEGER NOT NULL,
    "parameters" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_calculated_power_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_trimp" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "sport" "enum_sport_type",
    "trimp" DOUBLE PRECISION,
    "trimp_zonal_points" DOUBLE PRECISION,
    "trimp_100" DOUBLE PRECISION,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_trimp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_vo2max" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "sport" "enum_sport_type",
    "vo2max_vdot_by_race" DOUBLE PRECISION,
    "vo2max_vdot_by_hr" DOUBLE PRECISION,
    "vo2max_by_factor" DOUBLE PRECISION,
    "vo2max_correction_factor" DOUBLE PRECISION,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_vo2max_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_training_effect" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "sport" "enum_sport_type",
    "epoc" DOUBLE PRECISION,
    "training_effect" DOUBLE PRECISION,
    "recovery_hours" DOUBLE PRECISION,
    "aerobic_epoc" DOUBLE PRECISION,
    "anaerobic_epoc" DOUBLE PRECISION,
    "aerobic_training_effect" DOUBLE PRECISION,
    "anaerobic_training_effect" DOUBLE PRECISION,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_training_effect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_peak_metric" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "sport" "enum_sport_type" NOT NULL,
    "type" "enum_peak_type" NOT NULL,
    "scale_type" "enum_scale_type" NOT NULL,
    "scale_value" INTEGER NOT NULL,
    "value" DOUBLE PRECISION,
    "start_elapsed_sec" DOUBLE PRECISION,
    "end_elapsed_sec" DOUBLE PRECISION,
    "start_distance_m" DOUBLE PRECISION,
    "end_distance_m" DOUBLE PRECISION,
    "covered_seconds" DOUBLE PRECISION,
    "coverage_ratio" DOUBLE PRECISION,
    "algorithm_version" INTEGER,
    "parameters" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_peak_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_lthr_observation" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "sport" "enum_sport_type" NOT NULL,
    "candidate_bpm" DOUBLE PRECISION NOT NULL,
    "raw_mean_bpm" DOUBLE PRECISION NOT NULL,
    "window_start_sec" DOUBLE PRECISION NOT NULL,
    "window_end_sec" DOUBLE PRECISION NOT NULL,
    "measure_start_sec" DOUBLE PRECISION NOT NULL,
    "measure_end_sec" DOUBLE PRECISION NOT NULL,
    "full_coverage_ratio" DOUBLE PRECISION NOT NULL,
    "tail_coverage_ratio" DOUBLE PRECISION NOT NULL,
    "max_gap_seconds" DOUBLE PRECISION NOT NULL,
    "paused_seconds" DOUBLE PRECISION,
    "pause_evidence" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "sample_seconds" DOUBLE PRECISION NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'OBSERVED',
    "quality_tier" TEXT NOT NULL DEFAULT 'SINGLE_HIGH_QUALITY',
    "algorithm_version" INTEGER NOT NULL,
    "checks" JSONB NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_lthr_observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_performance_tt" (
    "id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "sport" "enum_sport_type" NOT NULL,
    "target_scale_type" "enum_scale_type" NOT NULL,
    "target_scale_value" INTEGER NOT NULL,
    "result_time_sec" DOUBLE PRECISION,
    "result_distance_m" DOUBLE PRECISION,
    "start_elapsed_sec" DOUBLE PRECISION,
    "end_elapsed_sec" DOUBLE PRECISION,
    "start_distance_m" DOUBLE PRECISION,
    "end_distance_m" DOUBLE PRECISION,
    "covered_seconds" DOUBLE PRECISION,
    "coverage_ratio" DOUBLE PRECISION,
    "algorithm_version" INTEGER,
    "parameters" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_activity_performance_tt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_best_metric" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "activity_id" INTEGER,
    "sport" "enum_sport_type" NOT NULL,
    "type" "enum_peak_type" NOT NULL,
    "scale_type" "enum_scale_type" NOT NULL,
    "scale_value" INTEGER NOT NULL,
    "value" DOUBLE PRECISION,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_user_best_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_best_tt" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "activity_id" INTEGER,
    "sport" "enum_sport_type" NOT NULL,
    "target_scale_type" "enum_scale_type" NOT NULL,
    "target_scale_value" INTEGER NOT NULL,
    "result_time_sec" DOUBLE PRECISION,
    "result_distance_m" DOUBLE PRECISION,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_user_best_tt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_lap" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "index" INTEGER,
    "activity_name" TEXT,
    "sport_type" TEXT,
    "description" TEXT,
    "timestamp" TIMESTAMP(3),
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "start_lat" DOUBLE PRECISION,
    "start_lng" DOUBLE PRECISION,
    "end_lat" DOUBLE PRECISION,
    "end_lng" DOUBLE PRECISION,
    "timer_time" INTEGER,
    "elapsed_time" INTEGER,
    "distance" DOUBLE PRECISION,
    "ascent" DOUBLE PRECISION,
    "descent" DOUBLE PRECISION,
    "enhanced_ascent" DOUBLE PRECISION,
    "enhanced_descent" DOUBLE PRECISION,
    "enhanced_min_elevation" DOUBLE PRECISION,
    "enhanced_max_elevation" DOUBLE PRECISION,
    "cycles" INTEGER,
    "work" INTEGER,
    "strokes" INTEGER,
    "max_speed" DOUBLE PRECISION,
    "avg_speed" DOUBLE PRECISION,
    "avg_power" DOUBLE PRECISION,
    "max_power" DOUBLE PRECISION,
    "normalized_power" DOUBLE PRECISION,
    "threshold_power" DOUBLE PRECISION,
    "avg_cadence" DOUBLE PRECISION,
    "max_cadence" DOUBLE PRECISION,
    "avg_heart_rate" INTEGER,
    "max_heart_rate" INTEGER,
    "tts" DOUBLE PRECISION,
    "if" DOUBLE PRECISION,
    "calories" INTEGER,
    "fat_calories" INTEGER,
    "avg_temperature" DOUBLE PRECISION,
    "max_temperature" DOUBLE PRECISION,
    "avg_grade_adjusted_speed" DOUBLE PRECISION,
    "avg_ground_contact_time" DOUBLE PRECISION,
    "avg_stride_length" DOUBLE PRECISION,
    "avg_vertical_oscillation" DOUBLE PRECISION,
    "avg_vertical_ratio" DOUBLE PRECISION,

    CONSTRAINT "t_activity_lap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_parquet_file" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "parquet_path" TEXT NOT NULL,
    "file_size" INTEGER,
    "point_count" INTEGER NOT NULL,
    "type" TEXT DEFAULT 'record',
    "storage_strategy" "enum_storage_strategy" NOT NULL DEFAULT 'LOCAL',
    "checksum" TEXT,
    "is_compressed" BOOLEAN NOT NULL DEFAULT false,
    "compression_ratio" DOUBLE PRECISION,

    CONSTRAINT "t_activity_parquet_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_storage_object_garbage" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activity_id" INTEGER,
    "object_key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'default',
    "reason" TEXT NOT NULL,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "t_storage_object_garbage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_enum" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "category" "enum_enum_category" NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "t_enum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_setting" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "enum_setting_category" NOT NULL,
    "value" TEXT,

    CONSTRAINT "t_user_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_ai_operation" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "kind" "enum_ai_usage_kind" NOT NULL,
    "purpose" "enum_ai_model_purpose" NOT NULL DEFAULT 'DEFAULT',
    "actual_purposes" "enum_ai_model_purpose"[] DEFAULT ARRAY[]::"enum_ai_model_purpose"[],
    "status" "enum_ai_operation_status" NOT NULL DEFAULT 'STARTED',
    "result_ref" JSONB,
    "error_code" TEXT,
    "metadata" JSONB,

    CONSTRAINT "t_ai_operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_ai_usage_event" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "operation_id" TEXT,
    "kind" "enum_ai_usage_kind" NOT NULL,
    "call_key" TEXT NOT NULL,
    "provider_request_id" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "purpose" "enum_ai_model_purpose" NOT NULL DEFAULT 'DEFAULT',
    "status" "enum_ai_usage_status" NOT NULL DEFAULT 'SUCCESS',
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "uncached_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "sid" TEXT,
    "entity_id" TEXT,

    CONSTRAINT "t_ai_usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_ai_model_health_state" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "consecutive_anomalies" INTEGER NOT NULL DEFAULT 0,
    "suspended_at" TIMESTAMP(3),
    "last_anomaly_at" TIMESTAMP(3),
    "last_healthy_at" TIMESTAMP(3),
    "last_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_ai_model_health_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_ai_today_suggestion" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "date" TEXT NOT NULL,
    "signature_hash" TEXT NOT NULL,
    "key_context" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_ai_today_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_ai_plan_execution_advice" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "cache_key" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "anchor_date" TEXT,
    "plan_id" TEXT,
    "plan_workout_id" TEXT,
    "activity_id" TEXT,
    "signature_hash" TEXT NOT NULL,
    "key_context" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_ai_plan_execution_advice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_action" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "type" "enum_coach_action_type" NOT NULL,
    "risk_tier" "enum_coach_action_risk_tier" NOT NULL,
    "summary" TEXT NOT NULL,
    "forward_data" JSONB NOT NULL,
    "reverse_data" JSONB NOT NULL,
    "message_id" TEXT,
    "sid" TEXT,
    "undo_until" TIMESTAMP(3),
    "undone_at" TIMESTAMP(3),

    CONSTRAINT "t_coach_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_profile" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "load_sources" TEXT,
    "preferred_sports" TEXT,
    "altitude_optimization_model" "AltitudeOptimizationModel" NOT NULL DEFAULT 'THRESHOLDMETHOD',
    "altitude_threshold" DOUBLE PRECISION,
    "default_vdot_source" "enum_default_vdot_source" NOT NULL DEFAULT 'FACTOR',
    "vo2max_correction_factor" DOUBLE PRECISION DEFAULT 1.0,
    "heart_rate_zone_model" "enum_heart_rate_zone_model" NOT NULL DEFAULT 'MHR',
    "pace_zone_model" "enum_pace_zone_model" NOT NULL DEFAULT 'DANIELS',
    "power_zone_model" "PowerZoneModel" NOT NULL DEFAULT 'FRIEL',

    CONSTRAINT "t_user_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_body_metric" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "enum_body_metric_type" NOT NULL,
    "value_text" TEXT NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_source" "enum_change_source",
    "origin_provider" "enum_third_party_provider",
    "origin_external_id" TEXT,
    "origin_checksum" TEXT,
    "origin_payload" JSONB,
    "origin_synced_at" TIMESTAMP(3),

    CONSTRAINT "t_user_body_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_external_health_sample" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "enum_health_data_provider" NOT NULL,
    "connection_id" TEXT,
    "source_object_id" TEXT,
    "snapshot_id" TEXT,
    "daily_metric_id" TEXT,
    "source_namespace" TEXT,
    "metric_type" "enum_health_metric_type" NOT NULL,
    "external_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "local_date" DATE NOT NULL,
    "timezone" TEXT,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "source_name" TEXT,
    "source_priority" INTEGER,
    "aggregation" TEXT,
    "source_updated_at" TIMESTAMP(3),
    "project_to_daily" BOOLEAN NOT NULL DEFAULT true,
    "raw_payload" JSONB,
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "t_external_health_sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_daily_health_metric" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timezone" TEXT,
    "metric_type" "enum_health_metric_type" NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "selected_provider" "enum_health_data_provider",
    "source_breakdown" JSONB,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_user_daily_health_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_canonical_health_snapshot" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_job_id" TEXT NOT NULL,
    "source_object_id" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL DEFAULT 'v1',
    "parser_name" TEXT NOT NULL DEFAULT 'trackswap',
    "parser_version" TEXT NOT NULL,
    "fit_profile_version" TEXT,
    "primary_kind" TEXT NOT NULL,
    "detected_kinds" JSONB NOT NULL,
    "observed_start" TIMESTAMP(3),
    "observed_end" TIMESTAMP(3),
    "local_date_start" DATE,
    "local_date_end" DATE,
    "timezone_strategy" TEXT,
    "point_count" INTEGER NOT NULL DEFAULT 0,
    "interval_count" INTEGER NOT NULL DEFAULT 0,
    "session_count" INTEGER NOT NULL DEFAULT 0,
    "summary_count" INTEGER NOT NULL DEFAULT 0,
    "manifest" JSONB NOT NULL,
    "diagnostics" JSONB,
    "canonical_checksum" TEXT NOT NULL,

    CONSTRAINT "t_canonical_health_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_health_series_file" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "provider" "enum_health_data_provider" NOT NULL,
    "source_namespace" TEXT NOT NULL,
    "metric_code" TEXT NOT NULL,
    "value_type" "enum_health_series_value_type" NOT NULL,
    "unit" TEXT NOT NULL,
    "local_date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "offset_seconds" INTEGER,
    "timezone" TEXT,
    "part" INTEGER NOT NULL DEFAULT 0,
    "point_count" INTEGER NOT NULL,
    "valid_point_count" INTEGER NOT NULL,
    "min_value" DOUBLE PRECISION,
    "max_value" DOUBLE PRECISION,
    "parquet_path" TEXT NOT NULL,
    "parquet_schema_version" TEXT NOT NULL,
    "file_size" INTEGER,
    "checksum" TEXT NOT NULL,
    "storage_strategy" "enum_storage_strategy" NOT NULL DEFAULT 'LOCAL',
    "metadata" JSONB,

    CONSTRAINT "t_health_series_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_canonical_health_session" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_type" "enum_external_health_session_type" NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "calendar_date" DATE,
    "timezone" TEXT,
    "duration_seconds" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "summary" JSONB,
    "selected_provider" "enum_health_data_provider",
    "selected_source_id" TEXT,
    "source_breakdown" JSONB,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "t_canonical_health_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_external_health_session" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "snapshot_id" TEXT,
    "canonical_session_id" TEXT,
    "connection_id" TEXT,
    "provider" "enum_health_data_provider" NOT NULL,
    "source_namespace" TEXT NOT NULL,
    "session_type" "enum_external_health_session_type" NOT NULL,
    "external_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "start_offset_seconds" INTEGER,
    "end_offset_seconds" INTEGER,
    "timezone" TEXT,
    "calendar_date" DATE,
    "duration_seconds" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "summary" JSONB,
    "source_updated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "t_external_health_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_external_health_session_segment" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "segment_type" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "source_message" TEXT,
    "source_index" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "t_external_health_session_segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_zone" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "zone_type" "enum_zone_type" NOT NULL,
    "type" TEXT,
    "order" INTEGER NOT NULL,
    "duration" INTEGER,
    "percent" DOUBLE PRECISION,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "avg" DOUBLE PRECISION,
    "color" TEXT,

    CONSTRAINT "t_activity_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_pmc_data" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tsb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cycling_value" DOUBLE PRECISION DEFAULT 0,
    "running_value" DOUBLE PRECISION DEFAULT 0,
    "swimming_value" DOUBLE PRECISION DEFAULT 0,
    "other_value" DOUBLE PRECISION DEFAULT 0,
    "activity_count" INTEGER NOT NULL DEFAULT 0,
    "total_duration" INTEGER NOT NULL DEFAULT 0,
    "version" TEXT DEFAULT '1.0',

    CONSTRAINT "t_user_pmc_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PMCExtreme" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value_type" "PMCExtremeType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PMCExtreme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_ai_review" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "enum_activity_ai_review_status" NOT NULL DEFAULT 'PENDING',
    "trigger" "enum_activity_ai_review_trigger" NOT NULL DEFAULT 'IMPORT',
    "language" TEXT NOT NULL DEFAULT 'zh',
    "prompt_version" TEXT NOT NULL DEFAULT 'activity_ai_review_v1',
    "evidence_version" TEXT NOT NULL DEFAULT 'activity_review_evidence_v1',
    "evidence_hash" TEXT NOT NULL,
    "evidence" JSONB,
    "content" JSONB,
    "verdict" TEXT,
    "summary" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "billable_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "weighted_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micro_yuan" BIGINT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "generated_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "metadata" JSONB,

    CONSTRAINT "t_activity_ai_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_polyline" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "polyline" TEXT NOT NULL,

    CONSTRAINT "t_activity_polyline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_polyline_segment" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "segment_index" INTEGER NOT NULL,
    "polyline" TEXT NOT NULL,

    CONSTRAINT "t_activity_polyline_segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_third_party_activity" (
    "id" SERIAL NOT NULL,
    "provider" "enum_third_party_provider" NOT NULL,
    "external_id" TEXT NOT NULL,
    "external_user_id" TEXT,
    "raw_data" JSONB NOT NULL,
    "data_version" TEXT NOT NULL DEFAULT '1.0',
    "activity_name" TEXT,
    "activity_type" "enum_sport_type",
    "sport_type" "enum_sport_type",
    "description" TEXT,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "timezone" TEXT,
    "start_latitude" DOUBLE PRECISION,
    "start_longitude" DOUBLE PRECISION,
    "end_latitude" DOUBLE PRECISION,
    "end_longitude" DOUBLE PRECISION,
    "distance" DOUBLE PRECISION,
    "elapsed_time" INTEGER,
    "moving_time" INTEGER,
    "ascent" DOUBLE PRECISION,
    "descent" DOUBLE PRECISION,
    "max_speed" DOUBLE PRECISION,
    "avg_speed" DOUBLE PRECISION,
    "avg_heart_rate" INTEGER,
    "max_heart_rate" INTEGER,
    "avg_power" DOUBLE PRECISION,
    "max_power" DOUBLE PRECISION,
    "normalized_power" DOUBLE PRECISION,
    "avg_cadence" DOUBLE PRECISION,
    "max_cadence" DOUBLE PRECISION,
    "calories" INTEGER,
    "is_private" BOOLEAN,
    "is_manual" BOOLEAN,
    "device_name" TEXT,
    "gear_id" TEXT,
    "sync_status" "enum_sync_status" NOT NULL DEFAULT 'PENDING',
    "synced_at" TIMESTAMP(3),
    "last_sync_attempt" TIMESTAMP(3),
    "sync_error_message" TEXT,
    "sync_retry_count" INTEGER NOT NULL DEFAULT 0,
    "state" INTEGER NOT NULL DEFAULT 1,
    "data_checksum" TEXT,
    "is_data_valid" BOOLEAN NOT NULL DEFAULT true,
    "validation_errors" JSONB,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_third_party_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_third_party_mapping" (
    "id" SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "third_party_activity_id" INTEGER NOT NULL,
    "mapping_type" "enum_mapping_type" NOT NULL DEFAULT 'EXACT',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "matching_fields" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sync_direction" "enum_sync_direction" NOT NULL DEFAULT 'IMPORT',
    "last_synced_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_activity_third_party_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT,
    "source_type" "enum_plan_source_type" NOT NULL DEFAULT 'MANUAL',
    "status" "enum_plan_status" NOT NULL DEFAULT 'DRAFT',
    "generation_metadata" JSONB,
    "period_weeks" INTEGER NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "activated_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "supersedes_plan_id" TEXT,
    "scheduled_activation_at" TIMESTAMP(3),
    "activation_timezone" TEXT,
    "activation_blocked_at" TIMESTAMP(3),
    "activation_block_reason" TEXT,
    "current_week_index" INTEGER,
    "current_day_index" INTEGER,
    "derived_from_share_id" TEXT,
    "derived_from_lineage_id" TEXT,
    "root_lineage_id" TEXT,

    CONSTRAINT "t_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_proposal_preview" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" "enum_plan_proposal_mode" NOT NULL,
    "source_plan_id" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "proposal" JSONB NOT NULL,
    "presentation" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "applied_at" TIMESTAMP(3),
    "decision_id" TEXT,
    "applied_decision_id" TEXT,
    "created_plan_id" TEXT,

    CONSTRAINT "t_plan_proposal_preview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_import_draft" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "token_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "consumed_by_user_id" TEXT,

    CONSTRAINT "t_plan_import_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_template_preview" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "template_version" TEXT NOT NULL,
    "template_content_hash" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "normalized_input" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_plan_id" TEXT,

    CONSTRAINT "t_plan_template_preview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_share_lineage" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "public_id" CHAR(12) NOT NULL,
    "owner_user_id" TEXT,
    "parent_lineage_id" TEXT,
    "root_lineage_id" TEXT NOT NULL,
    "visibility" "enum_plan_share_visibility" NOT NULL,
    "status" "enum_plan_share_status" NOT NULL DEFAULT 'ACTIVE',
    "origin" "enum_plan_share_origin" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT,
    "sport_types" "enum_sport_type"[],
    "locale" TEXT NOT NULL DEFAULT 'en',
    "head_share_id" TEXT,
    "head_plan_id" TEXT,
    "catalog_slug" TEXT,
    "catalog_tags" TEXT[],
    "published_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "t_plan_share_lineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_share" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "public_id" CHAR(12) NOT NULL,
    "lineage_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source_plan_id" TEXT,
    "status" "enum_plan_share_status" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT,
    "period_weeks" INTEGER NOT NULL,
    "sport_types" "enum_sport_type"[],
    "workout_count" INTEGER NOT NULL,
    "training_days_per_week" INTEGER,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "payload_hash" TEXT NOT NULL,
    "payload_version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_bytes" INTEGER NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "t_plan_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_context" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "enum_coach_context_status" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE,
    "end_date" DATE,
    "closed_at" TIMESTAMP(3),
    "head_event_seq" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_coach_context_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_event" (
    "id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" "enum_coach_event_type" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "dedupe_key" TEXT,
    "payload" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "decision_id" TEXT,
    "branch_id" TEXT,
    "commit_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_coach_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_summary" (
    "id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "period_start" DATE,
    "period_end" DATE,
    "adherence_score" DOUBLE PRECISION,
    "progress_label" "enum_coach_progress_label",
    "key_drivers" JSONB,
    "risk_flags" JSONB,
    "next_cycle_suggestion" JSONB,
    "markdown" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_coach_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_thread" (
    "id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "kind" "enum_coach_thread_kind" NOT NULL DEFAULT 'MAIN',
    "status" "enum_coach_flow_status" NOT NULL DEFAULT 'OPEN',
    "head_msg_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_coach_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_branch" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "status" "enum_coach_flow_status" NOT NULL DEFAULT 'OPEN',
    "base_event_seq" INTEGER NOT NULL,
    "base_commit_id" TEXT,
    "opened_by" TEXT,
    "open_reason" TEXT,
    "head_msg_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "t_coach_branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_branch_message" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "msg_seq" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "tool_calls" JSONB,
    "tool_results" JSONB,
    "parent_msg_id" TEXT,
    "token_in" INTEGER,
    "token_out" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_coach_branch_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_branch_compaction" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "from_seq" INTEGER NOT NULL,
    "to_seq" INTEGER NOT NULL,
    "summary_json" JSONB,
    "summary_text" TEXT,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_coach_branch_compaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_decision" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "state" "enum_coach_decision_state" NOT NULL DEFAULT 'DRAFT',
    "risk_tier" "enum_coach_decision_risk_tier" NOT NULL DEFAULT 'HIGH',
    "decision_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "rationale" TEXT,
    "confidence" DOUBLE PRECISION,
    "created_by" TEXT,
    "approved_by" TEXT,
    "base_event_seq" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "superseded_by_decision_id" TEXT,

    CONSTRAINT "t_coach_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_decision_option" (
    "id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "option_key" TEXT NOT NULL,
    "title" TEXT,
    "pros" JSONB,
    "cons" JSONB,
    "impact" JSONB,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_coach_decision_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_apply_attempt" (
    "id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "base_event_seq" INTEGER,
    "head_event_seq" INTEGER,
    "result" "enum_coach_apply_result" NOT NULL,
    "error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_coach_apply_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_coach_commit" (
    "id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "parent_commit_id" TEXT,
    "decision_id" TEXT,
    "event_from_seq" INTEGER,
    "event_to_seq" INTEGER,
    "commit_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_coach_commit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_workout" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "day_offset" INTEGER NOT NULL,
    "session_index" INTEGER NOT NULL DEFAULT 1,
    "scheduled_date" DATE,
    "sport_type" "enum_sport_type" NOT NULL,
    "sport_definition_code" TEXT,
    "name" TEXT,
    "text" TEXT NOT NULL,
    "notes" TEXT,
    "structure_kind" "enum_workout_structure_kind" NOT NULL DEFAULT 'ENDURANCE',
    "dsl_version" INTEGER NOT NULL DEFAULT 1,
    "planned_duration_seconds" INTEGER,
    "planned_session_rpe" DOUBLE PRECISION,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "enum_plan_workout_status" NOT NULL DEFAULT 'PLANNED',
    "completed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "moved_from_workout_id" TEXT,
    "moved_by" "enum_plan_workout_moved_by",
    "estimated_load" DOUBLE PRECISION,
    "estimated_load_source" "enum_plan_load_source",
    "estimated_load_inputs" JSONB,
    "estimated_load_computed_at" TIMESTAMP(3),

    CONSTRAINT "t_plan_workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_workout_exercise" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workout_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "exercise_code" TEXT,
    "name" TEXT NOT NULL,
    "equipment_code" TEXT,
    "notes" TEXT,

    CONSTRAINT "t_plan_workout_exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_workout_set_group" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "set_type" "enum_strength_set_type" NOT NULL,
    "set_count" INTEGER NOT NULL,
    "prescription_type" "enum_strength_prescription_type" NOT NULL,
    "reps_min" INTEGER,
    "reps_max" INTEGER,
    "duration_seconds" INTEGER,
    "amrap" BOOLEAN NOT NULL DEFAULT false,
    "load_type" "enum_strength_load_type" NOT NULL,
    "load_value" DOUBLE PRECISION,
    "load_unit" "enum_strength_load_unit",
    "bodyweight_offset_direction" "enum_strength_bodyweight_offset_direction",
    "target_rpe" DOUBLE PRECISION,
    "target_rir" DOUBLE PRECISION,
    "rest_seconds" INTEGER,

    CONSTRAINT "t_plan_workout_set_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_strength_exercise" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "order_index" INTEGER NOT NULL,
    "exercise_code" TEXT,
    "name" TEXT NOT NULL,
    "equipment_code" TEXT,
    "notes" TEXT,

    CONSTRAINT "t_activity_strength_exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_activity_strength_set" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "planned_set_group_id" TEXT,
    "set_index" INTEGER NOT NULL,
    "set_type" "enum_strength_set_type" NOT NULL,
    "completed_reps" INTEGER,
    "completed_duration_seconds" INTEGER,
    "load_type" "enum_strength_load_type" NOT NULL,
    "load_value" DOUBLE PRECISION,
    "load_unit" "enum_strength_load_unit",
    "bodyweight_offset_direction" "enum_strength_bodyweight_offset_direction",
    "actual_rpe" DOUBLE PRECISION,
    "actual_rir" DOUBLE PRECISION,
    "completed_at" TIMESTAMP(3),
    "source" "enum_activity_strength_set_source" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "t_activity_strength_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_workout_step" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workout_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "order_index" INTEGER NOT NULL,
    "step_type" "enum_plan_workout_step_type" NOT NULL,
    "name" TEXT,
    "notes" TEXT,
    "intensity" "enum_plan_workout_step_intensity",
    "duration_type" "enum_plan_workout_step_duration_type" NOT NULL,
    "duration_value" DOUBLE PRECISION,
    "duration_unit" "enum_plan_workout_value_unit",
    "target_type" "enum_plan_workout_step_target_type",
    "target_value_low" DOUBLE PRECISION,
    "target_value_high" DOUBLE PRECISION,
    "target_unit" "enum_plan_workout_value_unit",
    "target_zone_index" INTEGER,
    "target_zone_label" TEXT,
    "target_zone_system" TEXT,
    "target_zone_source" TEXT,
    "target_zone_basis" JSONB,
    "intensity_intent" JSONB,
    "target_resolution_mode" "enum_prescription_resolution_mode" NOT NULL DEFAULT 'LEGACY_SNAPSHOT',
    "target_zone_system_key" TEXT,
    "target_zone_fingerprint" TEXT,

    CONSTRAINT "t_plan_workout_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_workout_activity_link" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "plan_workout_id" TEXT NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "source" "enum_plan_workout_activity_link_source" NOT NULL DEFAULT 'MANUAL',
    "role" "enum_plan_workout_activity_link_role" NOT NULL DEFAULT 'PRIMARY',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinked_at" TIMESTAMP(3),
    "auto_marked_workout_done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "t_plan_workout_activity_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_plan_workout_external_mapping" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "enum_third_party_provider" NOT NULL,
    "connection_id" TEXT,
    "plan_workout_id" TEXT,
    "external_event_id" TEXT,
    "external_uid" TEXT,
    "external_source_key" TEXT,
    "external_athlete_id" TEXT,
    "origin" "enum_plan_workout_external_origin" NOT NULL DEFAULT 'LOCAL',
    "sync_state" "enum_plan_workout_external_sync_state" NOT NULL DEFAULT 'SYNCED',
    "last_local_checksum" TEXT,
    "last_remote_checksum" TEXT,
    "last_synced_checksum" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "last_pulled_at" TIMESTAMP(3),
    "last_pushed_at" TIMESTAMP(3),
    "last_conflict_at" TIMESTAMP(3),
    "local_deleted_at" TIMESTAMP(3),
    "remote_deleted_at" TIMESTAMP(3),
    "last_error" TEXT,
    "raw_remote" JSONB,
    "metadata" JSONB,

    CONSTRAINT "t_plan_workout_external_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_public_ai_review_reservation" (
    "id" TEXT NOT NULL,
    "visitor_hash" TEXT NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "activity_hash" TEXT NOT NULL,
    "admission_nonce" TEXT NOT NULL,
    "status" "PublicAiReviewReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "reserved_wt" INTEGER NOT NULL,
    "actual_wt" INTEGER,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "t_public_ai_review_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_fitness_assessment_task" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "request" JSONB NOT NULL,
    "facts" JSONB NOT NULL DEFAULT '{}',
    "stage" TEXT NOT NULL DEFAULT 'EVIDENCE',
    "last_calculation_id" TEXT,
    "linked_workout_id" TEXT,
    "tracking" BOOLEAN NOT NULL DEFAULT false,
    "tracking_expires_at" TIMESTAMP(3),
    "last_processed_evidence_hash" TEXT,
    "next_check_at" TIMESTAMP(3),
    "lease_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_fitness_assessment_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_fitness_calculation" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "task_revision" INTEGER NOT NULL,
    "method_id" TEXT NOT NULL,
    "method_version" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "input_hash" TEXT NOT NULL,
    "selection_hash" TEXT NOT NULL,
    "baseline_hash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PREPARED',
    "result" JSONB,
    "result_hash" TEXT,
    "presented_at" TIMESTAMP(3),
    "presented_message_id" TEXT,
    "apply_expires_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "applied_option_id" TEXT,
    "applied_action_id" TEXT,
    "receipt" JSONB,
    "notification_pending" BOOLEAN NOT NULL DEFAULT false,
    "notification_key" TEXT,
    "post_process_state" TEXT NOT NULL DEFAULT 'NONE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "t_fitness_calculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_fitness_evidence_revision" (
    "user_id" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "lease_until" TIMESTAMP(3),
    "lease_owner" TEXT,

    CONSTRAINT "t_fitness_evidence_revision_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "t_mcp_capability_audit" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_fingerprint" VARCHAR(64) NOT NULL,
    "client_fingerprint" VARCHAR(64) NOT NULL,
    "tool_name" VARCHAR(100) NOT NULL,
    "outcome" VARCHAR(40) NOT NULL,
    "error_code" VARCHAR(80),
    "duration_ms" INTEGER NOT NULL,
    "output_bytes" INTEGER NOT NULL,
    "input_fingerprint" VARCHAR(64) NOT NULL,
    "request_id" VARCHAR(128),

    CONSTRAINT "t_mcp_capability_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "t_sport_definition_family_active_sort_order_idx" ON "t_sport_definition"("family", "active", "sort_order");

-- CreateIndex
CREATE INDEX "t_sport_definition_supports_planning_active_sort_order_idx" ON "t_sport_definition"("supports_planning", "active", "sort_order");

-- CreateIndex
CREATE INDEX "t_provider_sport_mapping_provider_sport_code_direction_acti_idx" ON "t_provider_sport_mapping"("provider", "sport_code", "direction", "active");

-- CreateIndex
CREATE UNIQUE INDEX "t_provider_sport_mapping_provider_external_code_external_su_key" ON "t_provider_sport_mapping"("provider", "external_code", "external_sub_code", "direction");

-- CreateIndex
CREATE INDEX "t_user_zone_setting_user_id_idx" ON "t_user_zone_setting"("user_id");

-- CreateIndex
CREATE INDEX "t_user_zone_setting_origin_provider_origin_external_id_idx" ON "t_user_zone_setting"("origin_provider", "origin_external_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_zone_setting_user_id_sport_type_zone_type_key" ON "t_user_zone_setting"("user_id", "sport_type", "zone_type");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_zones_user_zone_setting_id_order_key" ON "t_user_zones"("user_zone_setting_id", "order");

-- CreateIndex
CREATE INDEX "t_user_auto_update_config_user_id_idx" ON "t_user_auto_update_config"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_auto_update_config_user_id_metric_key" ON "t_user_auto_update_config"("user_id", "metric");

-- CreateIndex
CREATE INDEX "t_user_fitness_metric_user_id_type_source_sport_recorded_at_idx" ON "t_user_fitness_metric"("user_id", "type", "source", "sport", "recorded_at");

-- CreateIndex
CREATE INDEX "t_user_fitness_metric_origin_provider_origin_external_id_idx" ON "t_user_fitness_metric"("origin_provider", "origin_external_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_fitness_metric_user_id_type_source_sport_recorded_at_key" ON "t_user_fitness_metric"("user_id", "type", "source", "sport", "recorded_at");

-- CreateIndex
CREATE INDEX "t_user_zone_setting_version_user_id_sport_type_zone_type_cr_idx" ON "t_user_zone_setting_version"("user_id", "sport_type", "zone_type", "created_at");

-- CreateIndex
CREATE INDEX "t_user_zone_setting_version_origin_provider_origin_external_idx" ON "t_user_zone_setting_version"("origin_provider", "origin_external_id");

-- CreateIndex
CREATE INDEX "t_user_last_login_at_idx" ON "t_user"("last_login_at");

-- CreateIndex
CREATE INDEX "t_user_registration_platform_created_at_idx" ON "t_user"("registration_platform", "created_at");

-- CreateIndex
CREATE INDEX "t_user_registration_method_created_at_idx" ON "t_user"("registration_method", "created_at");

-- CreateIndex
CREATE INDEX "t_user_acquisition_source_created_at_idx" ON "t_user"("acquisition_source", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_email_key" ON "t_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "t_self_host_instance_owner_user_id_key" ON "t_self_host_instance"("owner_user_id");

-- CreateIndex
CREATE INDEX "t_competition_event_user_id_start_date_idx" ON "t_competition_event"("user_id", "start_date");

-- CreateIndex
CREATE INDEX "t_competition_event_user_id_status_start_date_idx" ON "t_competition_event"("user_id", "status", "start_date");

-- CreateIndex
CREATE INDEX "t_competition_event_user_id_deleted_at_start_date_idx" ON "t_competition_event"("user_id", "deleted_at", "start_date");

-- CreateIndex
CREATE INDEX "t_competition_event_sport_definition_code_idx" ON "t_competition_event"("sport_definition_code");

-- CreateIndex
CREATE UNIQUE INDEX "t_competition_event_user_id_idempotency_key_key" ON "t_competition_event"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "t_competition_event_revision_user_id_created_at_idx" ON "t_competition_event_revision"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_competition_event_revision_event_id_event_version_key" ON "t_competition_event_revision"("event_id", "event_version");

-- CreateIndex
CREATE INDEX "t_competition_impact_assessment_user_id_scope_type_scope_st_idx" ON "t_competition_impact_assessment"("user_id", "scope_type", "scope_start_date", "scope_end_date");

-- CreateIndex
CREATE INDEX "t_competition_impact_assessment_user_id_created_at_idx" ON "t_competition_impact_assessment"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_competition_impact_assessment_user_id_input_hash_prompt_v_key" ON "t_competition_impact_assessment"("user_id", "input_hash", "prompt_version", "schema_version");

-- CreateIndex
CREATE INDEX "t_external_provider_connection_provider_status_idx" ON "t_external_provider_connection"("provider", "status");

-- CreateIndex
CREATE INDEX "t_external_provider_connection_provider_external_athlete_id_idx" ON "t_external_provider_connection"("provider", "external_athlete_id", "status");

-- CreateIndex
CREATE INDEX "t_external_provider_connection_user_id_status_idx" ON "t_external_provider_connection"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "t_external_provider_connection_user_id_provider_key" ON "t_external_provider_connection"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "t_external_oauth_state_state_hash_key" ON "t_external_oauth_state"("state_hash");

-- CreateIndex
CREATE INDEX "t_external_oauth_state_provider_expires_at_idx" ON "t_external_oauth_state"("provider", "expires_at");

-- CreateIndex
CREATE INDEX "t_external_provider_webhook_event_provider_status_available_idx" ON "t_external_provider_webhook_event"("provider", "status", "available_at");

-- CreateIndex
CREATE INDEX "t_external_provider_webhook_event_provider_external_user_id_idx" ON "t_external_provider_webhook_event"("provider", "external_user_id", "received_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_external_provider_webhook_event_provider_dedupe_key_key" ON "t_external_provider_webhook_event"("provider", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "t_calendar_subscription_token_key" ON "t_calendar_subscription"("token");

-- CreateIndex
CREATE INDEX "t_calendar_subscription_user_id_revoked_at_idx" ON "t_calendar_subscription"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "t_ai_coach_session_user_id_updated_at_idx" ON "t_ai_coach_session"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "t_ai_coach_session_user_id_pinned_at_idx" ON "t_ai_coach_session"("user_id", "pinned_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_ai_coach_message_user_id_session_id_sequence_key" ON "t_ai_coach_message"("user_id", "session_id", "sequence");

-- CreateIndex
CREATE INDEX "t_athlete_memory_fact_user_id_status_category_idx" ON "t_athlete_memory_fact"("user_id", "status", "category");

-- CreateIndex
CREATE INDEX "t_athlete_memory_fact_user_id_event_start_idx" ON "t_athlete_memory_fact"("user_id", "event_start" DESC);

-- CreateIndex
CREATE INDEX "t_athlete_memory_fact_user_id_relevance_anchor_at_idx" ON "t_athlete_memory_fact"("user_id", "relevance_anchor_at" DESC);

-- CreateIndex
CREATE INDEX "t_athlete_memory_fact_user_id_kind_status_idx" ON "t_athlete_memory_fact"("user_id", "kind", "status");

-- CreateIndex
CREATE INDEX "idx_memory_fact_user_created" ON "t_athlete_memory_fact"("user_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_memory_fact_superseded_by" ON "t_athlete_memory_fact"("superseded_by_id");

-- CreateIndex
CREATE INDEX "t_athlete_memory_evidence_user_id_source_message_id_idx" ON "t_athlete_memory_evidence"("user_id", "source_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_memory_evidence_source" ON "t_athlete_memory_evidence"("fact_id", "source_message_id", "source_hash");

-- CreateIndex
CREATE UNIQUE INDEX "t_athlete_memory_event_idempotency_key_key" ON "t_athlete_memory_event"("idempotency_key");

-- CreateIndex
CREATE INDEX "t_athlete_memory_event_user_id_fact_id_created_at_idx" ON "t_athlete_memory_event"("user_id", "fact_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_memory_event_fact" ON "t_athlete_memory_event"("fact_id");

-- CreateIndex
CREATE INDEX "idx_memory_event_job" ON "t_athlete_memory_event"("job_id");

-- CreateIndex
CREATE INDEX "t_ai_coach_memory_extraction_job_status_next_retry_at_idx" ON "t_ai_coach_memory_extraction_job"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "t_ai_coach_memory_extraction_job_user_id_created_at_idx" ON "t_ai_coach_memory_extraction_job"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_memory_job_session" ON "t_ai_coach_memory_extraction_job"("user_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_memory_job_source_policy" ON "t_ai_coach_memory_extraction_job"("source_message_id", "policy_version");

-- CreateIndex
CREATE INDEX "t_athlete_state_assessment_user_id_as_of_idx" ON "t_athlete_state_assessment"("user_id", "as_of" DESC);

-- CreateIndex
CREATE INDEX "t_athlete_state_assessment_user_id_expires_at_idx" ON "t_athlete_state_assessment"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "t_athlete_state_assessment_superseded_by_id_idx" ON "t_athlete_state_assessment"("superseded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_athlete_state_assessment_user_id_evidence_hash_policy_ver_key" ON "t_athlete_state_assessment"("user_id", "evidence_hash", "policy_version", "prompt_version");

-- CreateIndex
CREATE INDEX "t_coach_assessment_case_user_id_status_updated_at_idx" ON "t_coach_assessment_case"("user_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_assessment_case_user_id_dedupe_key_idx" ON "t_coach_assessment_case"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "t_coach_assessment_case_assessment_id_idx" ON "t_coach_assessment_case"("assessment_id");

-- CreateIndex
CREATE INDEX "t_coach_assessment_case_context_id_idx" ON "t_coach_assessment_case"("context_id");

-- CreateIndex
CREATE INDEX "t_coach_assessment_case_branch_id_idx" ON "t_coach_assessment_case"("branch_id");

-- CreateIndex
CREATE INDEX "t_coach_assessment_case_decision_id_idx" ON "t_coach_assessment_case"("decision_id");

-- CreateIndex
CREATE INDEX "t_coach_assessment_case_user_id_session_id_idx" ON "t_coach_assessment_case"("user_id", "session_id");

-- CreateIndex
CREATE INDEX "t_coach_assessment_case_status_follow_up_at_idx" ON "t_coach_assessment_case"("status", "follow_up_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_assessment_question_prompt_message_id_key" ON "t_coach_assessment_question"("prompt_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_assessment_question_answer_message_id_key" ON "t_coach_assessment_question"("answer_message_id");

-- CreateIndex
CREATE INDEX "t_coach_assessment_question_case_id_status_created_at_idx" ON "t_coach_assessment_question"("case_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "t_coach_assessment_question_status_expires_at_idx" ON "t_coach_assessment_question"("status", "expires_at");

-- CreateIndex
CREATE INDEX "t_coach_run_user_id_session_id_idx" ON "t_coach_run"("user_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_run_attempt_message_id_key" ON "t_coach_run_attempt"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_run_attempt_interaction_id_key" ON "t_coach_run_attempt"("interaction_id");

-- CreateIndex
CREATE INDEX "t_coach_run_attempt_run_id_started_at_idx" ON "t_coach_run_attempt"("run_id", "started_at");

-- CreateIndex
CREATE INDEX "t_coach_run_attempt_status_heartbeat_at_idx" ON "t_coach_run_attempt"("status", "heartbeat_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_run_attempt_user_id_request_id_key" ON "t_coach_run_attempt"("user_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_run_attempt_user_id_operation_id_key" ON "t_coach_run_attempt"("user_id", "operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_run_attempt_user_id_submission_id_key" ON "t_coach_run_attempt"("user_id", "submission_id");

-- CreateIndex
CREATE INDEX "t_import_batch_job_user_id_created_at_idx" ON "t_import_batch_job"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_import_batch_job_user_id_status_idx" ON "t_import_batch_job"("user_id", "status");

-- CreateIndex
CREATE INDEX "t_import_batch_job_status_created_at_idx" ON "t_import_batch_job"("status", "created_at" ASC);

-- CreateIndex
CREATE INDEX "t_import_source_object_user_id_source_kind_created_at_idx" ON "t_import_source_object"("user_id", "source_kind", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_import_source_object_provider_external_id_idx" ON "t_import_source_object"("provider", "external_id");

-- CreateIndex
CREATE INDEX "t_import_source_object_source_kind_external_id_idx" ON "t_import_source_object"("source_kind", "external_id");

-- CreateIndex
CREATE INDEX "t_import_source_object_user_id_resolution_status_last_seen__idx" ON "t_import_source_object"("user_id", "resolution_status", "last_seen_at" DESC);

-- CreateIndex
CREATE INDEX "t_import_source_object_user_id_resolution_status_timeline_s_idx" ON "t_import_source_object"("user_id", "resolution_status", "timeline_start_time" DESC);

-- CreateIndex
CREATE INDEX "t_import_source_object_origin_provider_resolution_status_idx" ON "t_import_source_object"("origin_provider", "resolution_status");

-- CreateIndex
CREATE INDEX "t_import_source_object_resolved_activity_id_idx" ON "t_import_source_object"("resolved_activity_id");

-- CreateIndex
CREATE INDEX "t_import_source_object_origin_sync_request_id_idx" ON "t_import_source_object"("origin_sync_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_import_source_object_user_id_source_kind_source_uid_key" ON "t_import_source_object"("user_id", "source_kind", "source_uid");

-- CreateIndex
CREATE UNIQUE INDEX "t_origin_activity_sync_request_dedupe_key_key" ON "t_origin_activity_sync_request"("dedupe_key");

-- CreateIndex
CREATE INDEX "t_origin_activity_sync_request_status_available_at_lease_ex_idx" ON "t_origin_activity_sync_request"("status", "available_at", "lease_expires_at");

-- CreateIndex
CREATE INDEX "t_origin_activity_sync_request_user_id_provider_created_at_idx" ON "t_origin_activity_sync_request"("user_id", "provider", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_canonical_activity_snapshot_item_job_id_key" ON "t_canonical_activity_snapshot"("item_job_id");

-- CreateIndex
CREATE INDEX "t_canonical_activity_snapshot_user_id_dedupe_key_idx" ON "t_canonical_activity_snapshot"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "t_canonical_activity_snapshot_start_time_idx" ON "t_canonical_activity_snapshot"("start_time");

-- CreateIndex
CREATE INDEX "t_canonical_activity_snapshot_batch_job_id_idx" ON "t_canonical_activity_snapshot"("batch_job_id");

-- CreateIndex
CREATE INDEX "t_import_item_job_batch_job_id_status_idx" ON "t_import_item_job"("batch_job_id", "status");

-- CreateIndex
CREATE INDEX "t_import_item_job_status_available_at_lease_expires_at_idx" ON "t_import_item_job"("status", "available_at", "lease_expires_at");

-- CreateIndex
CREATE INDEX "t_import_item_job_user_id_status_idx" ON "t_import_item_job"("user_id", "status");

-- CreateIndex
CREATE INDEX "t_import_item_job_source_kind_source_uid_idx" ON "t_import_item_job"("source_kind", "source_uid");

-- CreateIndex
CREATE INDEX "t_import_item_job_batch_job_id_status_analysis_required_idx" ON "t_import_item_job"("batch_job_id", "status", "analysis_required");

-- CreateIndex
CREATE UNIQUE INDEX "t_import_item_job_batch_job_id_position_key" ON "t_import_item_job"("batch_job_id", "position");

-- CreateIndex
CREATE INDEX "t_activity_source_activity_id_is_active_is_primary_idx" ON "t_activity_source"("activity_id", "is_active", "is_primary");

-- CreateIndex
CREATE INDEX "t_activity_source_user_id_source_kind_idx" ON "t_activity_source"("user_id", "source_kind");

-- CreateIndex
CREATE INDEX "t_activity_source_user_id_source_checksum_idx" ON "t_activity_source"("user_id", "source_checksum");

-- CreateIndex
CREATE INDEX "t_activity_source_provider_external_id_idx" ON "t_activity_source"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_source_user_id_source_kind_source_uid_key" ON "t_activity_source"("user_id", "source_kind", "source_uid");

-- CreateIndex
CREATE INDEX "t_activity_import_draft_user_id_status_created_at_idx" ON "t_activity_import_draft"("user_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_activity_import_draft_source_object_id_idx" ON "t_activity_import_draft"("source_object_id");

-- CreateIndex
CREATE INDEX "t_activity_import_draft_committed_activity_id_idx" ON "t_activity_import_draft"("committed_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_import_draft_user_id_idempotency_key_key" ON "t_activity_import_draft"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "t_user_post_process_job_status_available_at_lease_expires_a_idx" ON "t_user_post_process_job"("status", "available_at", "lease_expires_at");

-- CreateIndex
CREATE INDEX "t_user_post_process_job_user_id_status_idx" ON "t_user_post_process_job"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_post_process_job_batch_job_id_key" ON "t_user_post_process_job"("batch_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_account_deletion_job_user_id_key" ON "t_account_deletion_job"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_account_deletion_job_idempotency_key_key" ON "t_account_deletion_job"("idempotency_key");

-- CreateIndex
CREATE INDEX "t_account_deletion_job_status_available_at_idx" ON "t_account_deletion_job"("status", "available_at");

-- CreateIndex
CREATE INDEX "t_account_deletion_job_subject_hash_idx" ON "t_account_deletion_job"("subject_hash");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_data_export_job_idempotency_key_key" ON "t_user_data_export_job"("idempotency_key");

-- CreateIndex
CREATE INDEX "t_user_data_export_job_user_id_requested_at_idx" ON "t_user_data_export_job"("user_id", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "t_user_data_export_job_status_available_at_idx" ON "t_user_data_export_job"("status", "available_at");

-- CreateIndex
CREATE INDEX "t_user_data_export_job_status_expires_at_idx" ON "t_user_data_export_job"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_recompute_job_dedupe_key_key" ON "t_activity_recompute_job"("dedupe_key");

-- CreateIndex
CREATE INDEX "t_activity_recompute_job_status_available_at_idx" ON "t_activity_recompute_job"("status", "available_at");

-- CreateIndex
CREATE INDEX "t_activity_recompute_job_user_id_status_idx" ON "t_activity_recompute_job"("user_id", "status");

-- CreateIndex
CREATE INDEX "t_activity_recompute_job_metric_window_idx" ON "t_activity_recompute_job"("user_id", "metric_type", "sport_type", "recompute_from", "recompute_to");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_map_thumb_job_activity_id_key" ON "t_activity_map_thumb_job"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_map_thumb_job_status_available_idx" ON "t_activity_map_thumb_job"("status", "available_at");

-- CreateIndex
CREATE INDEX "t_activity_map_thumb_job_user_status_idx" ON "t_activity_map_thumb_job"("user_id", "status");

-- CreateIndex
CREATE INDEX "t_activity_map_thumb_job_hash_idx" ON "t_activity_map_thumb_job"("activity_hash_id");

-- CreateIndex
CREATE INDEX "t_import_event_log_batch_job_id_created_at_idx" ON "t_import_event_log"("batch_job_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_import_event_log_item_job_id_created_at_idx" ON "t_import_event_log"("item_job_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_import_event_log_post_process_job_id_created_at_idx" ON "t_import_event_log"("post_process_job_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_import_event_log_stage_level_created_at_idx" ON "t_import_event_log"("stage", "level", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_review_schedule_type_enabled_idx" ON "t_review_schedule"("type", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "t_review_schedule_user_id_type_key" ON "t_review_schedule"("user_id", "type");

-- CreateIndex
CREATE INDEX "t_review_job_status_available_at_idx" ON "t_review_job"("status", "available_at");

-- CreateIndex
CREATE INDEX "t_review_job_user_id_status_idx" ON "t_review_job"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "t_review_job_user_id_type_period_start_period_end_key" ON "t_review_job"("user_id", "type", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "t_review_digest_job_id_key" ON "t_review_digest"("job_id");

-- CreateIndex
CREATE INDEX "t_review_digest_user_id_created_at_idx" ON "t_review_digest"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_review_digest_user_id_type_period_start_period_end_key" ON "t_review_digest"("user_id", "type", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "t_review_digest_snapshot_digest_id_key" ON "t_review_digest_snapshot"("digest_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_review_digest_totals_by_sport_digest_id_sport_type_key" ON "t_review_digest_totals_by_sport"("digest_id", "sport_type");

-- CreateIndex
CREATE INDEX "t_review_digest_highlight_activity_digest_id_rank_idx" ON "t_review_digest_highlight_activity"("digest_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "t_review_digest_highlight_activity_digest_id_rank_key" ON "t_review_digest_highlight_activity"("digest_id", "rank");

-- CreateIndex
CREATE INDEX "t_review_digest_trend_point_digest_id_point_date_idx" ON "t_review_digest_trend_point"("digest_id", "point_date");

-- CreateIndex
CREATE UNIQUE INDEX "t_review_digest_trend_point_digest_id_point_date_key" ON "t_review_digest_trend_point"("digest_id", "point_date");

-- CreateIndex
CREATE INDEX "t_review_digest_warning_digest_id_idx" ON "t_review_digest_warning"("digest_id");

-- CreateIndex
CREATE INDEX "t_notification_user_id_created_at_idx" ON "t_notification"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_notification_user_id_read_at_idx" ON "t_notification"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "t_notification_import_batch_job_id_idx" ON "t_notification"("import_batch_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_notification_user_id_kind_dedupe_key_key" ON "t_notification"("user_id", "kind", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_sessions_token_key" ON "t_user_sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "t_auth_rate_limits_key_key" ON "t_auth_rate_limits"("key");

-- CreateIndex
CREATE UNIQUE INDEX "t_oauth_client_client_id_key" ON "t_oauth_client"("client_id");

-- CreateIndex
CREATE INDEX "t_oauth_client_user_id_idx" ON "t_oauth_client"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_oauth_refresh_token_token_key" ON "t_oauth_refresh_token"("token");

-- CreateIndex
CREATE INDEX "t_oauth_refresh_token_client_id_idx" ON "t_oauth_refresh_token"("client_id");

-- CreateIndex
CREATE INDEX "t_oauth_refresh_token_session_id_idx" ON "t_oauth_refresh_token"("session_id");

-- CreateIndex
CREATE INDEX "t_oauth_refresh_token_user_id_idx" ON "t_oauth_refresh_token"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_oauth_access_token_token_key" ON "t_oauth_access_token"("token");

-- CreateIndex
CREATE INDEX "t_oauth_access_token_client_id_idx" ON "t_oauth_access_token"("client_id");

-- CreateIndex
CREATE INDEX "t_oauth_access_token_session_id_idx" ON "t_oauth_access_token"("session_id");

-- CreateIndex
CREATE INDEX "t_oauth_access_token_user_id_idx" ON "t_oauth_access_token"("user_id");

-- CreateIndex
CREATE INDEX "t_oauth_access_token_refresh_id_idx" ON "t_oauth_access_token"("refresh_id");

-- CreateIndex
CREATE INDEX "t_oauth_consent_client_id_idx" ON "t_oauth_consent"("client_id");

-- CreateIndex
CREATE INDEX "t_oauth_consent_user_id_idx" ON "t_oauth_consent"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_hash_id_key" ON "t_activity"("hash_id");

-- CreateIndex
CREATE INDEX "t_activity_start_time_idx" ON "t_activity"("start_time");

-- CreateIndex
CREATE INDEX "t_activity_hash_id_idx" ON "t_activity"("hash_id");

-- CreateIndex
CREATE INDEX "t_activity_user_id_start_time_idx" ON "t_activity"("user_id", "start_time");

-- CreateIndex
CREATE INDEX "t_activity_user_id_sport_type_start_time_idx" ON "t_activity"("user_id", "sport_type", "start_time");

-- CreateIndex
CREATE INDEX "t_activity_sport_definition_code_idx" ON "t_activity"("sport_definition_code");

-- CreateIndex
CREATE INDEX "t_activity_user_id_third_party_provider_start_time_idx" ON "t_activity"("user_id", "third_party_provider", "start_time");

-- CreateIndex
CREATE INDEX "t_activity_created_by_batch_job_id_idx" ON "t_activity"("created_by_batch_job_id");

-- CreateIndex
CREATE INDEX "t_activity_processing_status_processing_updated_at_idx" ON "t_activity"("processing_status", "processing_updated_at");

-- CreateIndex
CREATE INDEX "t_activity_merged_into_activity_id_idx" ON "t_activity"("merged_into_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_third_party_provider_third_party_activity_id_key" ON "t_activity"("third_party_provider", "third_party_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_weather_snapshot_activity_id_key" ON "t_activity_weather_snapshot"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_weather_snapshot_status_available_at_idx" ON "t_activity_weather_snapshot"("status", "available_at");

-- CreateIndex
CREATE INDEX "t_activity_weather_snapshot_status_lease_expires_at_idx" ON "t_activity_weather_snapshot"("status", "lease_expires_at");

-- CreateIndex
CREATE INDEX "t_activity_weather_snapshot_user_id_sampled_at_idx" ON "t_activity_weather_snapshot"("user_id", "sampled_at");

-- CreateIndex
CREATE INDEX "t_activity_merge_audit_user_id_applied_at_idx" ON "t_activity_merge_audit"("user_id", "applied_at" DESC);

-- CreateIndex
CREATE INDEX "t_activity_merge_audit_survivor_activity_id_idx" ON "t_activity_merge_audit"("survivor_activity_id");

-- CreateIndex
CREATE INDEX "t_activity_merge_audit_source_checksum_idx" ON "t_activity_merge_audit"("source_checksum");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_fitness_metrics_snapshot_activity_id_key" ON "t_activity_fitness_metrics_snapshot"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_fitness_metrics_snapshot_user_id_sport_recorded__idx" ON "t_activity_fitness_metrics_snapshot"("user_id", "sport", "recorded_at");

-- CreateIndex
CREATE INDEX "t_activity_fitness_metrics_snapshot_activity_id_idx" ON "t_activity_fitness_metrics_snapshot"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_bike_score_activity_id_sport_idx" ON "t_activity_bike_score"("activity_id", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_bike_score_activity_id_key" ON "t_activity_bike_score"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_coggan_activity_id_sport_idx" ON "t_activity_coggan"("activity_id", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_coggan_activity_id_key" ON "t_activity_coggan"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_metric_distribution_activity_id_metric_idx" ON "t_activity_metric_distribution"("activity_id", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_metric_distribution_activity_id_metric_source_key" ON "t_activity_metric_distribution"("activity_id", "metric", "source");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_terrain_summary_activity_id_key" ON "t_activity_terrain_summary"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_swim_score_activity_id_sport_idx" ON "t_activity_swim_score"("activity_id", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_swim_score_activity_id_key" ON "t_activity_swim_score"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_govss_activity_id_sport_idx" ON "t_activity_govss"("activity_id", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_govss_activity_id_key" ON "t_activity_govss"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_calculated_power_activity_id_key" ON "t_activity_calculated_power"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_calculated_power_sport_model_idx" ON "t_activity_calculated_power"("sport", "model");

-- CreateIndex
CREATE INDEX "t_activity_trimp_activity_id_sport_idx" ON "t_activity_trimp"("activity_id", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_trimp_activity_id_key" ON "t_activity_trimp"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_vo2max_activity_id_sport_idx" ON "t_activity_vo2max"("activity_id", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_vo2max_activity_id_key" ON "t_activity_vo2max"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_training_effect_activity_id_sport_idx" ON "t_activity_training_effect"("activity_id", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_training_effect_activity_id_key" ON "t_activity_training_effect"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_peak_metric_sport_type_scale_type_scale_value_idx" ON "t_activity_peak_metric"("sport", "type", "scale_type", "scale_value");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_peak_metric_activity_id_type_scale_type_scale_va_key" ON "t_activity_peak_metric"("activity_id", "type", "scale_type", "scale_value");

-- CreateIndex
CREATE INDEX "t_activity_lthr_observation_user_id_sport_observed_at_idx" ON "t_activity_lthr_observation"("user_id", "sport", "observed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_lthr_observation_activity_id_algorithm_version_key" ON "t_activity_lthr_observation"("activity_id", "algorithm_version");

-- CreateIndex
CREATE INDEX "t_activity_performance_tt_sport_target_scale_type_target_sc_idx" ON "t_activity_performance_tt"("sport", "target_scale_type", "target_scale_value");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_performance_tt_activity_id_target_scale_type_tar_key" ON "t_activity_performance_tt"("activity_id", "target_scale_type", "target_scale_value");

-- CreateIndex
CREATE INDEX "t_user_best_metric_user_id_sport_idx" ON "t_user_best_metric"("user_id", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_best_metric_user_id_sport_type_scale_type_scale_valu_key" ON "t_user_best_metric"("user_id", "sport", "type", "scale_type", "scale_value");

-- CreateIndex
CREATE INDEX "t_user_best_tt_user_id_sport_idx" ON "t_user_best_tt"("user_id", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_best_tt_user_id_sport_target_scale_type_target_scale_key" ON "t_user_best_tt"("user_id", "sport", "target_scale_type", "target_scale_value");

-- CreateIndex
CREATE INDEX "t_activity_lap_activity_id_idx" ON "t_activity_lap"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_lap_start_time_idx" ON "t_activity_lap"("start_time");

-- CreateIndex
CREATE INDEX "t_activity_parquet_file_activity_id_type_idx" ON "t_activity_parquet_file"("activity_id", "type");

-- CreateIndex
CREATE INDEX "t_activity_parquet_file_storage_strategy_idx" ON "t_activity_parquet_file"("storage_strategy");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_parquet_file_activity_id_type_key" ON "t_activity_parquet_file"("activity_id", "type");

-- CreateIndex
CREATE INDEX "t_storage_object_garbage_available_at_locked_at_idx" ON "t_storage_object_garbage"("available_at", "locked_at");

-- CreateIndex
CREATE INDEX "t_storage_object_garbage_activity_id_idx" ON "t_storage_object_garbage"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_storage_object_garbage_bucket_object_key_key" ON "t_storage_object_garbage"("bucket", "object_key");

-- CreateIndex
CREATE INDEX "t_enum_category_idx" ON "t_enum"("category");

-- CreateIndex
CREATE UNIQUE INDEX "t_enum_category_value_key" ON "t_enum"("category", "value");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_setting_user_id_category_key" ON "t_user_setting"("user_id", "category");

-- CreateIndex
CREATE INDEX "t_ai_operation_user_id_status_created_at_idx" ON "t_ai_operation"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "t_ai_operation_expires_at_status_idx" ON "t_ai_operation"("expires_at", "status");

-- CreateIndex
CREATE UNIQUE INDEX "t_ai_operation_user_id_idempotency_key_key" ON "t_ai_operation"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "t_ai_usage_event_call_key_key" ON "t_ai_usage_event"("call_key");

-- CreateIndex
CREATE INDEX "t_ai_usage_event_user_id_created_at_idx" ON "t_ai_usage_event"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "t_ai_usage_event_user_id_kind_created_at_idx" ON "t_ai_usage_event"("user_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "t_ai_usage_event_operation_id_created_at_idx" ON "t_ai_usage_event"("operation_id", "created_at");

-- CreateIndex
CREATE INDEX "t_ai_model_health_state_suspended_at_idx" ON "t_ai_model_health_state"("suspended_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_ai_model_health_state_provider_model_id_key" ON "t_ai_model_health_state"("provider", "model_id");

-- CreateIndex
CREATE INDEX "t_ai_today_suggestion_user_id_updated_at_idx" ON "t_ai_today_suggestion"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_ai_today_suggestion_user_id_locale_date_key" ON "t_ai_today_suggestion"("user_id", "locale", "date");

-- CreateIndex
CREATE INDEX "t_ai_plan_execution_advice_user_id_updated_at_idx" ON "t_ai_plan_execution_advice"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_ai_plan_execution_advice_user_id_locale_cache_key_key" ON "t_ai_plan_execution_advice"("user_id", "locale", "cache_key");

-- CreateIndex
CREATE INDEX "t_coach_action_user_id_created_at_idx" ON "t_coach_action"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_action_user_id_sid_created_at_idx" ON "t_coach_action"("user_id", "sid", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_user_profile_user_id_key" ON "t_user_profile"("user_id");

-- CreateIndex
CREATE INDEX "t_user_profile_user_id_idx" ON "t_user_profile"("user_id");

-- CreateIndex
CREATE INDEX "t_user_body_metric_user_id_type_created_at_idx" ON "t_user_body_metric"("user_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "t_user_body_metric_origin_provider_origin_external_id_idx" ON "t_user_body_metric"("origin_provider", "origin_external_id");

-- CreateIndex
CREATE INDEX "t_external_health_sample_user_id_metric_type_local_date_idx" ON "t_external_health_sample"("user_id", "metric_type", "local_date");

-- CreateIndex
CREATE INDEX "t_external_health_sample_provider_connection_id_idx" ON "t_external_health_sample"("provider", "connection_id");

-- CreateIndex
CREATE INDEX "t_external_health_sample_source_object_id_idx" ON "t_external_health_sample"("source_object_id");

-- CreateIndex
CREATE INDEX "t_external_health_sample_snapshot_id_idx" ON "t_external_health_sample"("snapshot_id");

-- CreateIndex
CREATE INDEX "t_external_health_sample_daily_metric_id_deleted_at_idx" ON "t_external_health_sample"("daily_metric_id", "deleted_at");

-- CreateIndex
CREATE INDEX "t_external_health_sample_user_id_source_namespace_local_dat_idx" ON "t_external_health_sample"("user_id", "source_namespace", "local_date");

-- CreateIndex
CREATE INDEX "t_external_health_sample_user_id_deleted_at_idx" ON "t_external_health_sample"("user_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_external_health_sample_user_id_provider_metric_type_exter_key" ON "t_external_health_sample"("user_id", "provider", "metric_type", "external_id");

-- CreateIndex
CREATE INDEX "t_user_daily_health_metric_user_id_metric_type_date_idx" ON "t_user_daily_health_metric"("user_id", "metric_type", "date");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_daily_health_metric_user_id_date_metric_type_key" ON "t_user_daily_health_metric"("user_id", "date", "metric_type");

-- CreateIndex
CREATE UNIQUE INDEX "t_canonical_health_snapshot_item_job_id_key" ON "t_canonical_health_snapshot"("item_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_canonical_health_snapshot_source_object_id_key" ON "t_canonical_health_snapshot"("source_object_id");

-- CreateIndex
CREATE INDEX "t_canonical_health_snapshot_user_id_observed_start_idx" ON "t_canonical_health_snapshot"("user_id", "observed_start");

-- CreateIndex
CREATE INDEX "t_canonical_health_snapshot_user_id_local_date_start_idx" ON "t_canonical_health_snapshot"("user_id", "local_date_start");

-- CreateIndex
CREATE INDEX "t_health_series_file_user_id_metric_code_start_time_end_tim_idx" ON "t_health_series_file"("user_id", "metric_code", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "t_health_series_file_user_id_local_date_metric_code_idx" ON "t_health_series_file"("user_id", "local_date", "metric_code");

-- CreateIndex
CREATE UNIQUE INDEX "t_health_series_file_snapshot_id_metric_code_local_date_par_key" ON "t_health_series_file"("snapshot_id", "metric_code", "local_date", "part");

-- CreateIndex
CREATE UNIQUE INDEX "t_canonical_health_session_selected_source_id_key" ON "t_canonical_health_session"("selected_source_id");

-- CreateIndex
CREATE INDEX "t_canonical_health_session_user_id_session_type_start_time_idx" ON "t_canonical_health_session"("user_id", "session_type", "start_time");

-- CreateIndex
CREATE INDEX "t_canonical_health_session_user_id_calendar_date_session_ty_idx" ON "t_canonical_health_session"("user_id", "calendar_date", "session_type");

-- CreateIndex
CREATE INDEX "t_canonical_health_session_user_id_deleted_at_idx" ON "t_canonical_health_session"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "t_external_health_session_user_id_session_type_start_time_idx" ON "t_external_health_session"("user_id", "session_type", "start_time");

-- CreateIndex
CREATE INDEX "t_external_health_session_user_id_calendar_date_session_typ_idx" ON "t_external_health_session"("user_id", "calendar_date", "session_type");

-- CreateIndex
CREATE INDEX "t_external_health_session_snapshot_id_idx" ON "t_external_health_session"("snapshot_id");

-- CreateIndex
CREATE INDEX "t_external_health_session_provider_connection_id_idx" ON "t_external_health_session"("provider", "connection_id");

-- CreateIndex
CREATE INDEX "t_external_health_session_canonical_session_id_deleted_at_idx" ON "t_external_health_session"("canonical_session_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_external_health_session_user_id_provider_source_namespace_key" ON "t_external_health_session"("user_id", "provider", "source_namespace", "session_type", "external_id");

-- CreateIndex
CREATE INDEX "t_external_health_session_segment_session_id_start_time_idx" ON "t_external_health_session_segment"("session_id", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "t_external_health_session_segment_session_id_position_key" ON "t_external_health_session_segment"("session_id", "position");

-- CreateIndex
CREATE INDEX "t_activity_zone_activity_id_zone_type_idx" ON "t_activity_zone"("activity_id", "zone_type");

-- CreateIndex
CREATE INDEX "t_activity_zone_activity_id_zone_type_order_idx" ON "t_activity_zone"("activity_id", "zone_type", "order");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_zone_activity_id_zone_type_order_key" ON "t_activity_zone"("activity_id", "zone_type", "order");

-- CreateIndex
CREATE INDEX "t_user_pmc_data_user_id_date_idx" ON "t_user_pmc_data"("user_id", "date");

-- CreateIndex
CREATE INDEX "t_user_pmc_data_date_idx" ON "t_user_pmc_data"("date");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_pmc_data_user_id_date_key" ON "t_user_pmc_data"("user_id", "date");

-- CreateIndex
CREATE INDEX "t_activity_ai_review_activity_id_user_id_status_generated_a_idx" ON "t_activity_ai_review"("activity_id", "user_id", "status", "generated_at");

-- CreateIndex
CREATE INDEX "t_activity_ai_review_user_id_created_at_idx" ON "t_activity_ai_review"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "t_activity_ai_review_status_available_at_idx" ON "t_activity_ai_review"("status", "available_at");

-- CreateIndex
CREATE INDEX "t_activity_ai_review_trigger_created_at_idx" ON "t_activity_ai_review"("trigger", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_ai_review_dedupe_key" ON "t_activity_ai_review"("activity_id", "user_id", "prompt_version", "evidence_version", "evidence_hash");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_polyline_activity_id_key" ON "t_activity_polyline"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_polyline_activity_id_idx" ON "t_activity_polyline"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_polyline_segment_activity_id_idx" ON "t_activity_polyline_segment"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_polyline_segment_activity_segment_key" ON "t_activity_polyline_segment"("activity_id", "segment_index");

-- CreateIndex
CREATE INDEX "t_third_party_activity_user_id_provider_idx" ON "t_third_party_activity"("user_id", "provider");

-- CreateIndex
CREATE INDEX "t_third_party_activity_start_time_idx" ON "t_third_party_activity"("start_time");

-- CreateIndex
CREATE INDEX "t_third_party_activity_sync_status_idx" ON "t_third_party_activity"("sync_status");

-- CreateIndex
CREATE INDEX "t_third_party_activity_provider_external_id_idx" ON "t_third_party_activity"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_third_party_activity_provider_external_id_key" ON "t_third_party_activity"("provider", "external_id");

-- CreateIndex
CREATE INDEX "t_activity_third_party_mapping_activity_id_idx" ON "t_activity_third_party_mapping"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_third_party_mapping_activity_id_is_active_is_pri_idx" ON "t_activity_third_party_mapping"("activity_id", "is_active", "is_primary");

-- CreateIndex
CREATE INDEX "t_activity_third_party_mapping_third_party_activity_id_idx" ON "t_activity_third_party_mapping"("third_party_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_third_party_mapping_third_party_activity_id_key" ON "t_activity_third_party_mapping"("third_party_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_supersedes_plan_id_key" ON "t_plan"("supersedes_plan_id");

-- CreateIndex
CREATE INDEX "t_plan_derived_from_share_id_idx" ON "t_plan"("derived_from_share_id");

-- CreateIndex
CREATE INDEX "t_plan_derived_from_lineage_id_idx" ON "t_plan"("derived_from_lineage_id");

-- CreateIndex
CREATE INDEX "t_plan_user_id_status_idx" ON "t_plan"("user_id", "status");

-- CreateIndex
CREATE INDEX "t_plan_user_id_updated_at_idx" ON "t_plan"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "t_plan_status_start_date_idx" ON "t_plan"("status", "start_date");

-- CreateIndex
CREATE INDEX "t_plan_user_id_status_scheduled_activation_at_idx" ON "t_plan"("user_id", "status", "scheduled_activation_at");

-- CreateIndex
CREATE INDEX "t_plan_supersedes_plan_id_idx" ON "t_plan"("supersedes_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_proposal_preview_decision_id_key" ON "t_plan_proposal_preview"("decision_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_proposal_preview_applied_decision_id_key" ON "t_plan_proposal_preview"("applied_decision_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_proposal_preview_created_plan_id_key" ON "t_plan_proposal_preview"("created_plan_id");

-- CreateIndex
CREATE INDEX "t_plan_proposal_preview_user_id_expires_at_idx" ON "t_plan_proposal_preview"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "t_plan_proposal_preview_source_plan_id_expires_at_idx" ON "t_plan_proposal_preview"("source_plan_id", "expires_at");

-- CreateIndex
CREATE INDEX "t_plan_proposal_preview_expires_at_applied_at_idx" ON "t_plan_proposal_preview"("expires_at", "applied_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_import_draft_token_hash_key" ON "t_plan_import_draft"("token_hash");

-- CreateIndex
CREATE INDEX "t_plan_import_draft_expires_at_idx" ON "t_plan_import_draft"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_template_preview_token_hash_key" ON "t_plan_template_preview"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_template_preview_created_plan_id_key" ON "t_plan_template_preview"("created_plan_id");

-- CreateIndex
CREATE INDEX "t_plan_template_preview_user_id_expires_at_idx" ON "t_plan_template_preview"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "t_plan_template_preview_expires_at_idx" ON "t_plan_template_preview"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_share_lineage_public_id_key" ON "t_plan_share_lineage"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_share_lineage_head_share_id_key" ON "t_plan_share_lineage"("head_share_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_share_lineage_catalog_slug_key" ON "t_plan_share_lineage"("catalog_slug");

-- CreateIndex
CREATE INDEX "t_plan_share_lineage_owner_user_id_status_idx" ON "t_plan_share_lineage"("owner_user_id", "status");

-- CreateIndex
CREATE INDEX "t_plan_share_lineage_visibility_status_origin_idx" ON "t_plan_share_lineage"("visibility", "status", "origin");

-- CreateIndex
CREATE INDEX "t_plan_share_lineage_parent_lineage_id_idx" ON "t_plan_share_lineage"("parent_lineage_id");

-- CreateIndex
CREATE INDEX "t_plan_share_lineage_root_lineage_id_idx" ON "t_plan_share_lineage"("root_lineage_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_share_public_id_key" ON "t_plan_share"("public_id");

-- CreateIndex
CREATE INDEX "t_plan_share_source_plan_id_idx" ON "t_plan_share"("source_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_share_lineage_id_version_key" ON "t_plan_share"("lineage_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_context_plan_id_key" ON "t_coach_context"("plan_id");

-- CreateIndex
CREATE INDEX "t_coach_context_user_id_head_event_seq_idx" ON "t_coach_context"("user_id", "head_event_seq");

-- CreateIndex
CREATE INDEX "t_coach_context_user_id_status_updated_at_idx" ON "t_coach_context"("user_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_context_plan_id_idx" ON "t_coach_context"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_context_user_id_plan_id_key" ON "t_coach_context"("user_id", "plan_id");

-- CreateIndex
CREATE INDEX "t_coach_event_context_id_occurred_at_idx" ON "t_coach_event"("context_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_event_context_id_seq_idx" ON "t_coach_event"("context_id", "seq" DESC);

-- CreateIndex
CREATE INDEX "t_coach_event_decision_id_idx" ON "t_coach_event"("decision_id");

-- CreateIndex
CREATE INDEX "t_coach_event_branch_id_idx" ON "t_coach_event"("branch_id");

-- CreateIndex
CREATE INDEX "t_coach_event_commit_id_idx" ON "t_coach_event"("commit_id");

-- CreateIndex
CREATE INDEX "t_coach_event_type_occurred_at_idx" ON "t_coach_event"("type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_event_dedupe_key_idx" ON "t_coach_event"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_event_context_id_seq_key" ON "t_coach_event"("context_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_summary_context_id_key" ON "t_coach_summary"("context_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_summary_plan_id_key" ON "t_coach_summary"("plan_id");

-- CreateIndex
CREATE INDEX "t_coach_summary_user_id_created_at_idx" ON "t_coach_summary"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_summary_plan_id_idx" ON "t_coach_summary"("plan_id");

-- CreateIndex
CREATE INDEX "t_coach_thread_context_id_kind_idx" ON "t_coach_thread"("context_id", "kind");

-- CreateIndex
CREATE INDEX "t_coach_thread_context_id_status_idx" ON "t_coach_thread"("context_id", "status");

-- CreateIndex
CREATE INDEX "t_coach_branch_context_id_status_idx" ON "t_coach_branch"("context_id", "status");

-- CreateIndex
CREATE INDEX "t_coach_branch_thread_id_status_idx" ON "t_coach_branch"("thread_id", "status");

-- CreateIndex
CREATE INDEX "t_coach_branch_context_id_base_event_seq_idx" ON "t_coach_branch"("context_id", "base_event_seq");

-- CreateIndex
CREATE INDEX "t_coach_branch_message_branch_id_msg_seq_idx" ON "t_coach_branch_message"("branch_id", "msg_seq");

-- CreateIndex
CREATE INDEX "t_coach_branch_message_thread_id_created_at_idx" ON "t_coach_branch_message"("thread_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_branch_message_thread_id_msg_seq_key" ON "t_coach_branch_message"("thread_id", "msg_seq");

-- CreateIndex
CREATE INDEX "t_coach_branch_compaction_branch_id_created_at_idx" ON "t_coach_branch_compaction"("branch_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_branch_compaction_branch_id_from_seq_to_seq_idx" ON "t_coach_branch_compaction"("branch_id", "from_seq", "to_seq");

-- CreateIndex
CREATE INDEX "t_coach_decision_context_id_state_created_at_idx" ON "t_coach_decision"("context_id", "state", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_decision_branch_id_created_at_idx" ON "t_coach_decision"("branch_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_decision_decision_type_idx" ON "t_coach_decision"("decision_type");

-- CreateIndex
CREATE INDEX "t_coach_decision_option_decision_id_is_selected_idx" ON "t_coach_decision_option"("decision_id", "is_selected");

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_decision_option_decision_id_option_key_key" ON "t_coach_decision_option"("decision_id", "option_key");

-- CreateIndex
CREATE INDEX "t_coach_apply_attempt_decision_id_created_at_idx" ON "t_coach_apply_attempt"("decision_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_apply_attempt_result_created_at_idx" ON "t_coach_apply_attempt"("result", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_coach_apply_attempt_decision_id_attempt_no_key" ON "t_coach_apply_attempt"("decision_id", "attempt_no");

-- CreateIndex
CREATE INDEX "t_coach_commit_context_id_created_at_idx" ON "t_coach_commit"("context_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_coach_commit_context_id_event_to_seq_idx" ON "t_coach_commit"("context_id", "event_to_seq" DESC);

-- CreateIndex
CREATE INDEX "t_coach_commit_decision_id_idx" ON "t_coach_commit"("decision_id");

-- CreateIndex
CREATE INDEX "t_plan_workout_user_id_scheduled_date_idx" ON "t_plan_workout"("user_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "t_plan_workout_user_id_status_idx" ON "t_plan_workout"("user_id", "status");

-- CreateIndex
CREATE INDEX "t_plan_workout_user_id_plan_id_idx" ON "t_plan_workout"("user_id", "plan_id");

-- CreateIndex
CREATE INDEX "t_plan_workout_plan_id_day_offset_idx" ON "t_plan_workout"("plan_id", "day_offset");

-- CreateIndex
CREATE INDEX "t_plan_workout_plan_id_scheduled_date_idx" ON "t_plan_workout"("plan_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "t_plan_workout_plan_id_status_idx" ON "t_plan_workout"("plan_id", "status");

-- CreateIndex
CREATE INDEX "t_plan_workout_sport_definition_code_idx" ON "t_plan_workout"("sport_definition_code");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_workout_plan_id_day_offset_session_index_key" ON "t_plan_workout"("plan_id", "day_offset", "session_index");

-- CreateIndex
CREATE INDEX "t_plan_workout_exercise_workout_id_idx" ON "t_plan_workout_exercise"("workout_id");

-- CreateIndex
CREATE INDEX "t_plan_workout_exercise_exercise_code_idx" ON "t_plan_workout_exercise"("exercise_code");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_workout_exercise_workout_id_order_index_key" ON "t_plan_workout_exercise"("workout_id", "order_index");

-- CreateIndex
CREATE INDEX "t_plan_workout_set_group_exercise_id_idx" ON "t_plan_workout_set_group"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_workout_set_group_exercise_id_order_index_key" ON "t_plan_workout_set_group"("exercise_id", "order_index");

-- CreateIndex
CREATE INDEX "t_activity_strength_exercise_activity_id_idx" ON "t_activity_strength_exercise"("activity_id");

-- CreateIndex
CREATE INDEX "t_activity_strength_exercise_exercise_code_idx" ON "t_activity_strength_exercise"("exercise_code");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_strength_exercise_activity_id_order_index_key" ON "t_activity_strength_exercise"("activity_id", "order_index");

-- CreateIndex
CREATE INDEX "t_activity_strength_set_exercise_id_idx" ON "t_activity_strength_set"("exercise_id");

-- CreateIndex
CREATE INDEX "t_activity_strength_set_planned_set_group_id_idx" ON "t_activity_strength_set"("planned_set_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_activity_strength_set_exercise_id_set_index_key" ON "t_activity_strength_set"("exercise_id", "set_index");

-- CreateIndex
CREATE INDEX "t_plan_workout_step_workout_id_parent_id_order_index_idx" ON "t_plan_workout_step"("workout_id", "parent_id", "order_index");

-- CreateIndex
CREATE INDEX "t_plan_workout_step_parent_id_idx" ON "t_plan_workout_step"("parent_id");

-- CreateIndex
CREATE INDEX "t_plan_workout_activity_link_plan_id_plan_workout_id_idx" ON "t_plan_workout_activity_link"("plan_id", "plan_workout_id");

-- CreateIndex
CREATE INDEX "t_plan_workout_activity_link_plan_workout_id_unlinked_at_idx" ON "t_plan_workout_activity_link"("plan_workout_id", "unlinked_at");

-- CreateIndex
CREATE INDEX "t_plan_workout_activity_link_activity_id_unlinked_at_idx" ON "t_plan_workout_activity_link"("activity_id", "unlinked_at");

-- CreateIndex
CREATE INDEX "t_plan_workout_external_mapping_connection_id_idx" ON "t_plan_workout_external_mapping"("connection_id");

-- CreateIndex
CREATE INDEX "t_plan_workout_external_mapping_plan_workout_id_idx" ON "t_plan_workout_external_mapping"("plan_workout_id");

-- CreateIndex
CREATE INDEX "t_plan_workout_external_mapping_user_id_provider_sync_state_idx" ON "t_plan_workout_external_mapping"("user_id", "provider", "sync_state");

-- CreateIndex
CREATE INDEX "t_plan_workout_external_mapping_provider_external_event_id_idx" ON "t_plan_workout_external_mapping"("provider", "external_event_id");

-- CreateIndex
CREATE INDEX "t_plan_workout_external_mapping_provider_external_source_ke_idx" ON "t_plan_workout_external_mapping"("provider", "external_source_key");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_workout_external_mapping_user_id_provider_plan_worko_key" ON "t_plan_workout_external_mapping"("user_id", "provider", "plan_workout_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_workout_external_mapping_user_id_provider_external_e_key" ON "t_plan_workout_external_mapping"("user_id", "provider", "external_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_workout_external_mapping_user_id_provider_external_u_key" ON "t_plan_workout_external_mapping"("user_id", "provider", "external_uid");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_workout_external_mapping_user_id_provider_external_s_key" ON "t_plan_workout_external_mapping"("user_id", "provider", "external_source_key");

-- CreateIndex
CREATE UNIQUE INDEX "t_public_ai_review_reservation_admission_nonce_key" ON "t_public_ai_review_reservation"("admission_nonce");

-- CreateIndex
CREATE INDEX "t_public_ai_review_reservation_status_expires_at_idx" ON "t_public_ai_review_reservation"("status", "expires_at");

-- CreateIndex
CREATE INDEX "t_public_ai_review_reservation_visitor_hash_status_finished_idx" ON "t_public_ai_review_reservation"("visitor_hash", "status", "finished_at");

-- CreateIndex
CREATE INDEX "t_public_ai_review_reservation_ip_hash_created_at_idx" ON "t_public_ai_review_reservation"("ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "t_public_ai_review_reservation_activity_hash_status_finishe_idx" ON "t_public_ai_review_reservation"("activity_hash", "status", "finished_at");

-- CreateIndex
CREATE INDEX "t_public_ai_review_reservation_status_finished_at_idx" ON "t_public_ai_review_reservation"("status", "finished_at");

-- CreateIndex
CREATE INDEX "t_fitness_assessment_task_user_id_session_id_branch_id_upda_idx" ON "t_fitness_assessment_task"("user_id", "session_id", "branch_id", "updated_at");

-- CreateIndex
CREATE INDEX "t_fitness_assessment_task_tracking_next_check_at_idx" ON "t_fitness_assessment_task"("tracking", "next_check_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_fitness_calculation_applied_action_id_key" ON "t_fitness_calculation"("applied_action_id");

-- CreateIndex
CREATE INDEX "t_fitness_calculation_user_id_task_id_created_at_idx" ON "t_fitness_calculation"("user_id", "task_id", "created_at");

-- CreateIndex
CREATE INDEX "t_fitness_calculation_post_process_state_next_attempt_at_idx" ON "t_fitness_calculation"("post_process_state", "next_attempt_at");

-- CreateIndex
CREATE INDEX "t_fitness_calculation_created_at_applied_at_idx" ON "t_fitness_calculation"("created_at", "applied_at");

-- CreateIndex
CREATE INDEX "t_mcp_capability_audit_occurred_at_idx" ON "t_mcp_capability_audit"("occurred_at");

-- CreateIndex
CREATE INDEX "t_mcp_capability_audit_tool_name_occurred_at_idx" ON "t_mcp_capability_audit"("tool_name", "occurred_at");

-- CreateIndex
CREATE INDEX "t_mcp_capability_audit_client_fingerprint_occurred_at_idx" ON "t_mcp_capability_audit"("client_fingerprint", "occurred_at");

-- CreateIndex
CREATE INDEX "t_mcp_capability_audit_user_fingerprint_occurred_at_idx" ON "t_mcp_capability_audit"("user_fingerprint", "occurred_at");

-- CreateIndex
CREATE INDEX "t_mcp_capability_audit_user_fingerprint_client_fingerprint__idx" ON "t_mcp_capability_audit"("user_fingerprint", "client_fingerprint", "occurred_at");

-- AddForeignKey
ALTER TABLE "t_provider_sport_mapping" ADD CONSTRAINT "t_provider_sport_mapping_sport_code_fkey" FOREIGN KEY ("sport_code") REFERENCES "t_sport_definition"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_zone_setting" ADD CONSTRAINT "t_user_zone_setting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_zones" ADD CONSTRAINT "t_user_zones_user_zone_setting_id_fkey" FOREIGN KEY ("user_zone_setting_id") REFERENCES "t_user_zone_setting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_auto_update_config" ADD CONSTRAINT "t_user_auto_update_config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_fitness_metric" ADD CONSTRAINT "t_user_fitness_metric_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_zone_setting_version" ADD CONSTRAINT "t_user_zone_setting_version_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_self_host_instance" ADD CONSTRAINT "t_self_host_instance_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "t_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_sport_definition_code_fkey" FOREIGN KEY ("sport_definition_code") REFERENCES "t_sport_definition"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_competition_event_revision" ADD CONSTRAINT "t_competition_event_revision_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "t_competition_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_competition_impact_assessment" ADD CONSTRAINT "t_competition_impact_assessment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_provider_connection" ADD CONSTRAINT "t_external_provider_connection_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_oauth_state" ADD CONSTRAINT "t_external_oauth_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_calendar_subscription" ADD CONSTRAINT "t_calendar_subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_ai_coach_session" ADD CONSTRAINT "t_ai_coach_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_ai_coach_message" ADD CONSTRAINT "t_ai_coach_message_user_id_session_id_fkey" FOREIGN KEY ("user_id", "session_id") REFERENCES "t_ai_coach_session"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_memory_fact" ADD CONSTRAINT "t_athlete_memory_fact_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_memory_fact" ADD CONSTRAINT "t_athlete_memory_fact_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "t_athlete_memory_fact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_memory_evidence" ADD CONSTRAINT "t_athlete_memory_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_memory_evidence" ADD CONSTRAINT "t_athlete_memory_evidence_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "t_athlete_memory_fact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_memory_evidence" ADD CONSTRAINT "t_athlete_memory_evidence_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "t_ai_coach_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_memory_event" ADD CONSTRAINT "t_athlete_memory_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_memory_event" ADD CONSTRAINT "t_athlete_memory_event_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "t_athlete_memory_fact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_memory_event" ADD CONSTRAINT "t_athlete_memory_event_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "t_athlete_memory_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_memory_event" ADD CONSTRAINT "t_athlete_memory_event_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "t_ai_coach_memory_extraction_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_ai_coach_memory_extraction_job" ADD CONSTRAINT "t_ai_coach_memory_extraction_job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_ai_coach_memory_extraction_job" ADD CONSTRAINT "t_ai_coach_memory_extraction_job_user_id_session_id_fkey" FOREIGN KEY ("user_id", "session_id") REFERENCES "t_ai_coach_session"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_ai_coach_memory_extraction_job" ADD CONSTRAINT "t_ai_coach_memory_extraction_job_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "t_ai_coach_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_state_assessment" ADD CONSTRAINT "t_athlete_state_assessment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_athlete_state_assessment" ADD CONSTRAINT "t_athlete_state_assessment_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "t_athlete_state_assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_assessment_case" ADD CONSTRAINT "t_coach_assessment_case_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_assessment_case" ADD CONSTRAINT "t_coach_assessment_case_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "t_athlete_state_assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_assessment_case" ADD CONSTRAINT "t_coach_assessment_case_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "t_coach_context"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_assessment_case" ADD CONSTRAINT "t_coach_assessment_case_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "t_coach_branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_assessment_case" ADD CONSTRAINT "t_coach_assessment_case_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "t_coach_decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_assessment_case" ADD CONSTRAINT "t_coach_assessment_case_user_id_session_id_fkey" FOREIGN KEY ("user_id", "session_id") REFERENCES "t_ai_coach_session"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_assessment_question" ADD CONSTRAINT "t_coach_assessment_question_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "t_coach_assessment_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_assessment_question" ADD CONSTRAINT "t_coach_assessment_question_prompt_message_id_fkey" FOREIGN KEY ("prompt_message_id") REFERENCES "t_ai_coach_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_assessment_question" ADD CONSTRAINT "t_coach_assessment_question_answer_message_id_fkey" FOREIGN KEY ("answer_message_id") REFERENCES "t_ai_coach_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_run" ADD CONSTRAINT "t_coach_run_user_id_session_id_fkey" FOREIGN KEY ("user_id", "session_id") REFERENCES "t_ai_coach_session"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_run_attempt" ADD CONSTRAINT "t_coach_run_attempt_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "t_coach_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_run_attempt" ADD CONSTRAINT "t_coach_run_attempt_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "t_ai_coach_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_batch_job" ADD CONSTRAINT "t_import_batch_job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_source_object" ADD CONSTRAINT "t_import_source_object_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_source_object" ADD CONSTRAINT "t_import_source_object_resolved_activity_id_fkey" FOREIGN KEY ("resolved_activity_id") REFERENCES "t_activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_source_object" ADD CONSTRAINT "t_import_source_object_origin_sync_request_id_fkey" FOREIGN KEY ("origin_sync_request_id") REFERENCES "t_origin_activity_sync_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_origin_activity_sync_request" ADD CONSTRAINT "t_origin_activity_sync_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_canonical_activity_snapshot" ADD CONSTRAINT "t_canonical_activity_snapshot_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_canonical_activity_snapshot" ADD CONSTRAINT "t_canonical_activity_snapshot_batch_job_id_fkey" FOREIGN KEY ("batch_job_id") REFERENCES "t_import_batch_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_canonical_activity_snapshot" ADD CONSTRAINT "t_canonical_activity_snapshot_item_job_id_fkey" FOREIGN KEY ("item_job_id") REFERENCES "t_import_item_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_canonical_activity_snapshot" ADD CONSTRAINT "t_canonical_activity_snapshot_source_object_id_fkey" FOREIGN KEY ("source_object_id") REFERENCES "t_import_source_object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_item_job" ADD CONSTRAINT "t_import_item_job_batch_job_id_fkey" FOREIGN KEY ("batch_job_id") REFERENCES "t_import_batch_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_item_job" ADD CONSTRAINT "t_import_item_job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_item_job" ADD CONSTRAINT "t_import_item_job_source_object_id_fkey" FOREIGN KEY ("source_object_id") REFERENCES "t_import_source_object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_item_job" ADD CONSTRAINT "t_import_item_job_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_source" ADD CONSTRAINT "t_activity_source_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_source" ADD CONSTRAINT "t_activity_source_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_source" ADD CONSTRAINT "t_activity_source_batch_job_id_fkey" FOREIGN KEY ("batch_job_id") REFERENCES "t_import_batch_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_source" ADD CONSTRAINT "t_activity_source_source_object_id_fkey" FOREIGN KEY ("source_object_id") REFERENCES "t_import_source_object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_source" ADD CONSTRAINT "t_activity_source_canonical_snapshot_id_fkey" FOREIGN KEY ("canonical_snapshot_id") REFERENCES "t_canonical_activity_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_import_draft" ADD CONSTRAINT "t_activity_import_draft_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_post_process_job" ADD CONSTRAINT "t_user_post_process_job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_post_process_job" ADD CONSTRAINT "t_user_post_process_job_batch_job_id_fkey" FOREIGN KEY ("batch_job_id") REFERENCES "t_import_batch_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_account_deletion_job" ADD CONSTRAINT "t_account_deletion_job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_data_export_job" ADD CONSTRAINT "t_user_data_export_job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_recompute_job" ADD CONSTRAINT "t_activity_recompute_job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_map_thumb_job" ADD CONSTRAINT "t_activity_map_thumb_job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_map_thumb_job" ADD CONSTRAINT "t_activity_map_thumb_job_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_event_log" ADD CONSTRAINT "t_import_event_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_event_log" ADD CONSTRAINT "t_import_event_log_batch_job_id_fkey" FOREIGN KEY ("batch_job_id") REFERENCES "t_import_batch_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_event_log" ADD CONSTRAINT "t_import_event_log_item_job_id_fkey" FOREIGN KEY ("item_job_id") REFERENCES "t_import_item_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_import_event_log" ADD CONSTRAINT "t_import_event_log_post_process_job_id_fkey" FOREIGN KEY ("post_process_job_id") REFERENCES "t_user_post_process_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_review_schedule" ADD CONSTRAINT "t_review_schedule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_review_job" ADD CONSTRAINT "t_review_job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_review_digest" ADD CONSTRAINT "t_review_digest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_review_digest" ADD CONSTRAINT "t_review_digest_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "t_review_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_review_digest_snapshot" ADD CONSTRAINT "t_review_digest_snapshot_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "t_review_digest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_review_digest_totals_by_sport" ADD CONSTRAINT "t_review_digest_totals_by_sport_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "t_review_digest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_review_digest_highlight_activity" ADD CONSTRAINT "t_review_digest_highlight_activity_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "t_review_digest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_review_digest_trend_point" ADD CONSTRAINT "t_review_digest_trend_point_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "t_review_digest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_review_digest_warning" ADD CONSTRAINT "t_review_digest_warning_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "t_review_digest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_notification" ADD CONSTRAINT "t_notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_notification" ADD CONSTRAINT "t_notification_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "t_review_digest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_notification" ADD CONSTRAINT "t_notification_import_batch_job_id_fkey" FOREIGN KEY ("import_batch_job_id") REFERENCES "t_import_batch_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_sessions" ADD CONSTRAINT "t_user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_accounts" ADD CONSTRAINT "t_user_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_client" ADD CONSTRAINT "t_oauth_client_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_refresh_token" ADD CONSTRAINT "t_oauth_refresh_token_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "t_oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_refresh_token" ADD CONSTRAINT "t_oauth_refresh_token_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "t_user_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_refresh_token" ADD CONSTRAINT "t_oauth_refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_access_token" ADD CONSTRAINT "t_oauth_access_token_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "t_oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_access_token" ADD CONSTRAINT "t_oauth_access_token_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "t_user_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_access_token" ADD CONSTRAINT "t_oauth_access_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_access_token" ADD CONSTRAINT "t_oauth_access_token_refresh_id_fkey" FOREIGN KEY ("refresh_id") REFERENCES "t_oauth_refresh_token"("token") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_consent" ADD CONSTRAINT "t_oauth_consent_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "t_oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_consent" ADD CONSTRAINT "t_oauth_consent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity" ADD CONSTRAINT "t_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity" ADD CONSTRAINT "t_activity_created_by_batch_job_id_fkey" FOREIGN KEY ("created_by_batch_job_id") REFERENCES "t_import_batch_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity" ADD CONSTRAINT "t_activity_sport_definition_code_fkey" FOREIGN KEY ("sport_definition_code") REFERENCES "t_sport_definition"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity" ADD CONSTRAINT "t_activity_merged_into_activity_id_fkey" FOREIGN KEY ("merged_into_activity_id") REFERENCES "t_activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_merge_audit" ADD CONSTRAINT "t_activity_merge_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_fitness_metrics_snapshot" ADD CONSTRAINT "t_activity_fitness_metrics_snapshot_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_fitness_metrics_snapshot" ADD CONSTRAINT "t_activity_fitness_metrics_snapshot_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_bike_score" ADD CONSTRAINT "t_activity_bike_score_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_coggan" ADD CONSTRAINT "t_activity_coggan_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_metric_distribution" ADD CONSTRAINT "t_activity_metric_distribution_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_terrain_summary" ADD CONSTRAINT "t_activity_terrain_summary_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_swim_score" ADD CONSTRAINT "t_activity_swim_score_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_govss" ADD CONSTRAINT "t_activity_govss_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_calculated_power" ADD CONSTRAINT "t_activity_calculated_power_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_trimp" ADD CONSTRAINT "t_activity_trimp_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_vo2max" ADD CONSTRAINT "t_activity_vo2max_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_training_effect" ADD CONSTRAINT "t_activity_training_effect_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_peak_metric" ADD CONSTRAINT "t_activity_peak_metric_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_lthr_observation" ADD CONSTRAINT "t_activity_lthr_observation_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_lthr_observation" ADD CONSTRAINT "t_activity_lthr_observation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_performance_tt" ADD CONSTRAINT "t_activity_performance_tt_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_best_metric" ADD CONSTRAINT "t_user_best_metric_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_best_metric" ADD CONSTRAINT "t_user_best_metric_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_best_tt" ADD CONSTRAINT "t_user_best_tt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_best_tt" ADD CONSTRAINT "t_user_best_tt_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_lap" ADD CONSTRAINT "t_activity_lap_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_parquet_file" ADD CONSTRAINT "t_activity_parquet_file_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_storage_object_garbage" ADD CONSTRAINT "t_storage_object_garbage_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_setting" ADD CONSTRAINT "t_user_setting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_ai_operation" ADD CONSTRAINT "t_ai_operation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_ai_usage_event" ADD CONSTRAINT "t_ai_usage_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_ai_usage_event" ADD CONSTRAINT "t_ai_usage_event_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "t_ai_operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_ai_today_suggestion" ADD CONSTRAINT "t_ai_today_suggestion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_ai_plan_execution_advice" ADD CONSTRAINT "t_ai_plan_execution_advice_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_action" ADD CONSTRAINT "t_coach_action_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_profile" ADD CONSTRAINT "t_user_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_body_metric" ADD CONSTRAINT "t_user_body_metric_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_health_sample" ADD CONSTRAINT "t_external_health_sample_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_health_sample" ADD CONSTRAINT "t_external_health_sample_source_object_id_fkey" FOREIGN KEY ("source_object_id") REFERENCES "t_import_source_object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_health_sample" ADD CONSTRAINT "t_external_health_sample_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "t_canonical_health_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_health_sample" ADD CONSTRAINT "t_external_health_sample_daily_metric_id_fkey" FOREIGN KEY ("daily_metric_id") REFERENCES "t_user_daily_health_metric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_daily_health_metric" ADD CONSTRAINT "t_user_daily_health_metric_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_canonical_health_snapshot" ADD CONSTRAINT "t_canonical_health_snapshot_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_canonical_health_snapshot" ADD CONSTRAINT "t_canonical_health_snapshot_item_job_id_fkey" FOREIGN KEY ("item_job_id") REFERENCES "t_import_item_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_canonical_health_snapshot" ADD CONSTRAINT "t_canonical_health_snapshot_source_object_id_fkey" FOREIGN KEY ("source_object_id") REFERENCES "t_import_source_object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_health_series_file" ADD CONSTRAINT "t_health_series_file_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_health_series_file" ADD CONSTRAINT "t_health_series_file_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "t_canonical_health_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_canonical_health_session" ADD CONSTRAINT "t_canonical_health_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_canonical_health_session" ADD CONSTRAINT "t_canonical_health_session_selected_source_id_fkey" FOREIGN KEY ("selected_source_id") REFERENCES "t_external_health_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_health_session" ADD CONSTRAINT "t_external_health_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_health_session" ADD CONSTRAINT "t_external_health_session_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "t_canonical_health_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_health_session" ADD CONSTRAINT "t_external_health_session_canonical_session_id_fkey" FOREIGN KEY ("canonical_session_id") REFERENCES "t_canonical_health_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_health_session_segment" ADD CONSTRAINT "t_external_health_session_segment_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "t_external_health_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_zone" ADD CONSTRAINT "t_activity_zone_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_user_pmc_data" ADD CONSTRAINT "t_user_pmc_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_ai_review" ADD CONSTRAINT "t_activity_ai_review_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_ai_review" ADD CONSTRAINT "t_activity_ai_review_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_polyline" ADD CONSTRAINT "t_activity_polyline_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_polyline_segment" ADD CONSTRAINT "t_activity_polyline_segment_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_third_party_activity" ADD CONSTRAINT "t_third_party_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_third_party_mapping" ADD CONSTRAINT "t_activity_third_party_mapping_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_third_party_mapping" ADD CONSTRAINT "t_activity_third_party_mapping_third_party_activity_id_fkey" FOREIGN KEY ("third_party_activity_id") REFERENCES "t_third_party_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan" ADD CONSTRAINT "t_plan_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan" ADD CONSTRAINT "t_plan_supersedes_plan_id_fkey" FOREIGN KEY ("supersedes_plan_id") REFERENCES "t_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_proposal_preview" ADD CONSTRAINT "t_plan_proposal_preview_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_proposal_preview" ADD CONSTRAINT "t_plan_proposal_preview_source_plan_id_fkey" FOREIGN KEY ("source_plan_id") REFERENCES "t_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_proposal_preview" ADD CONSTRAINT "t_plan_proposal_preview_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "t_coach_decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_proposal_preview" ADD CONSTRAINT "t_plan_proposal_preview_created_plan_id_fkey" FOREIGN KEY ("created_plan_id") REFERENCES "t_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_template_preview" ADD CONSTRAINT "t_plan_template_preview_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_template_preview" ADD CONSTRAINT "t_plan_template_preview_created_plan_id_fkey" FOREIGN KEY ("created_plan_id") REFERENCES "t_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_share_lineage" ADD CONSTRAINT "t_plan_share_lineage_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "t_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_share_lineage" ADD CONSTRAINT "t_plan_share_lineage_parent_lineage_id_fkey" FOREIGN KEY ("parent_lineage_id") REFERENCES "t_plan_share_lineage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_share" ADD CONSTRAINT "t_plan_share_lineage_id_fkey" FOREIGN KEY ("lineage_id") REFERENCES "t_plan_share_lineage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_share" ADD CONSTRAINT "t_plan_share_source_plan_id_fkey" FOREIGN KEY ("source_plan_id") REFERENCES "t_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_context" ADD CONSTRAINT "t_coach_context_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_context" ADD CONSTRAINT "t_coach_context_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "t_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_event" ADD CONSTRAINT "t_coach_event_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "t_coach_context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_event" ADD CONSTRAINT "t_coach_event_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "t_coach_decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_event" ADD CONSTRAINT "t_coach_event_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "t_coach_branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_event" ADD CONSTRAINT "t_coach_event_commit_id_fkey" FOREIGN KEY ("commit_id") REFERENCES "t_coach_commit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_summary" ADD CONSTRAINT "t_coach_summary_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "t_coach_context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_summary" ADD CONSTRAINT "t_coach_summary_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_summary" ADD CONSTRAINT "t_coach_summary_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "t_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_thread" ADD CONSTRAINT "t_coach_thread_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "t_coach_context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_branch" ADD CONSTRAINT "t_coach_branch_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "t_coach_thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_branch" ADD CONSTRAINT "t_coach_branch_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "t_coach_context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_branch_message" ADD CONSTRAINT "t_coach_branch_message_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "t_coach_thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_branch_message" ADD CONSTRAINT "t_coach_branch_message_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "t_coach_branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_branch_compaction" ADD CONSTRAINT "t_coach_branch_compaction_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "t_coach_branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_decision" ADD CONSTRAINT "t_coach_decision_superseded_by_decision_id_fkey" FOREIGN KEY ("superseded_by_decision_id") REFERENCES "t_coach_decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_decision" ADD CONSTRAINT "t_coach_decision_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "t_coach_branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_decision" ADD CONSTRAINT "t_coach_decision_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "t_coach_context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_decision_option" ADD CONSTRAINT "t_coach_decision_option_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "t_coach_decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_apply_attempt" ADD CONSTRAINT "t_coach_apply_attempt_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "t_coach_decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_commit" ADD CONSTRAINT "t_coach_commit_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "t_coach_context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_commit" ADD CONSTRAINT "t_coach_commit_parent_commit_id_fkey" FOREIGN KEY ("parent_commit_id") REFERENCES "t_coach_commit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_coach_commit" ADD CONSTRAINT "t_coach_commit_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "t_coach_decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout" ADD CONSTRAINT "t_plan_workout_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout" ADD CONSTRAINT "t_plan_workout_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "t_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout" ADD CONSTRAINT "t_plan_workout_sport_definition_code_fkey" FOREIGN KEY ("sport_definition_code") REFERENCES "t_sport_definition"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout" ADD CONSTRAINT "t_plan_workout_moved_from_workout_id_fkey" FOREIGN KEY ("moved_from_workout_id") REFERENCES "t_plan_workout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout_exercise" ADD CONSTRAINT "t_plan_workout_exercise_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "t_plan_workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout_set_group" ADD CONSTRAINT "t_plan_workout_set_group_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "t_plan_workout_exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_strength_exercise" ADD CONSTRAINT "t_activity_strength_exercise_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_strength_set" ADD CONSTRAINT "t_activity_strength_set_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "t_activity_strength_exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_activity_strength_set" ADD CONSTRAINT "t_activity_strength_set_planned_set_group_id_fkey" FOREIGN KEY ("planned_set_group_id") REFERENCES "t_plan_workout_set_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout_step" ADD CONSTRAINT "t_plan_workout_step_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "t_plan_workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout_step" ADD CONSTRAINT "t_plan_workout_step_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "t_plan_workout_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout_activity_link" ADD CONSTRAINT "t_plan_workout_activity_link_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "t_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout_activity_link" ADD CONSTRAINT "t_plan_workout_activity_link_plan_workout_id_fkey" FOREIGN KEY ("plan_workout_id") REFERENCES "t_plan_workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout_activity_link" ADD CONSTRAINT "t_plan_workout_activity_link_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout_external_mapping" ADD CONSTRAINT "t_plan_workout_external_mapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout_external_mapping" ADD CONSTRAINT "t_plan_workout_external_mapping_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "t_external_provider_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_workout_external_mapping" ADD CONSTRAINT "t_plan_workout_external_mapping_plan_workout_id_fkey" FOREIGN KEY ("plan_workout_id") REFERENCES "t_plan_workout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_fitness_assessment_task" ADD CONSTRAINT "t_fitness_assessment_task_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_fitness_calculation" ADD CONSTRAINT "t_fitness_calculation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_fitness_calculation" ADD CONSTRAINT "t_fitness_calculation_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "t_fitness_assessment_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_fitness_evidence_revision" ADD CONSTRAINT "t_fitness_evidence_revision_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

