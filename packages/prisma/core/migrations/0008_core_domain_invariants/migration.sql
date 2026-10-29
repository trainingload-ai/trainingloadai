-- Public domain invariants and reference data retained from the main baseline.

-- Generated against a disposable database after replaying the immutable Managed history.

ALTER TABLE "t_activity_strength_exercise" ADD CONSTRAINT "t_activity_strength_exercise_order_check" CHECK ((order_index >= 0));

ALTER TABLE "t_activity_strength_set" ADD CONSTRAINT "t_activity_strength_set_completion_check" CHECK ((((completed_reps IS NULL) OR (completed_reps >= 0)) AND ((completed_duration_seconds IS NULL) OR (completed_duration_seconds >= 0))));

ALTER TABLE "t_activity_strength_set" ADD CONSTRAINT "t_activity_strength_set_effort_check" CHECK (((NOT ((actual_rpe IS NOT NULL) AND (actual_rir IS NOT NULL))) AND ((actual_rpe IS NULL) OR ((actual_rpe >= (1)::double precision) AND (actual_rpe <= (10)::double precision))) AND ((actual_rir IS NULL) OR ((actual_rir >= (0)::double precision) AND (actual_rir <= (10)::double precision)))));

ALTER TABLE "t_activity_strength_set" ADD CONSTRAINT "t_activity_strength_set_index_check" CHECK ((set_index >= 0));

ALTER TABLE "t_activity_strength_set" ADD CONSTRAINT "t_activity_strength_set_load_check" CHECK ((((load_type = 'OPEN'::enum_strength_load_type) AND (load_value IS NULL) AND (load_unit IS NULL) AND (bodyweight_offset_direction IS NULL)) OR ((load_type = 'ABSOLUTE'::enum_strength_load_type) AND (load_value >= (0)::double precision) AND (load_unit = ANY (ARRAY['KG'::enum_strength_load_unit, 'LB'::enum_strength_load_unit])) AND (bodyweight_offset_direction IS NULL)) OR ((load_type = 'PERCENT_1RM'::enum_strength_load_type) AND (load_value > (0)::double precision) AND (load_value <= (100)::double precision) AND (load_unit = 'PERCENT'::enum_strength_load_unit) AND (bodyweight_offset_direction IS NULL)) OR ((load_type = 'BODYWEIGHT'::enum_strength_load_type) AND (load_value IS NULL) AND (load_unit IS NULL) AND (bodyweight_offset_direction IS NULL)) OR ((load_type = 'BODYWEIGHT_OFFSET'::enum_strength_load_type) AND (load_value >= (0)::double precision) AND (load_unit = ANY (ARRAY['KG'::enum_strength_load_unit, 'LB'::enum_strength_load_unit])) AND (bodyweight_offset_direction IS NOT NULL))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_attempt_count_check" CHECK ((attempt_count >= 0));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_available_check" CHECK (((status <> 'AVAILABLE'::enum_activity_weather_status) OR ((input_fingerprint IS NOT NULL) AND (query_recorded_at IS NOT NULL) AND (sampled_at IS NOT NULL) AND (source IS NOT NULL) AND (fetched_at IS NOT NULL) AND (attribution_service_name IS NOT NULL) AND (attribution_legal_url IS NOT NULL) AND (COALESCE(temperature_c, apparent_temperature_c, dew_point_c, wind_speed_kph, (humidity_pct)::double precision, (cloud_cover_pct)::double precision, pressure_hpa) IS NOT NULL))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_cloud_check" CHECK (((cloud_cover_pct IS NULL) OR ((cloud_cover_pct >= 0) AND (cloud_cover_pct <= 100))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_fingerprint_check" CHECK (((input_fingerprint IS NULL) OR (char_length((input_fingerprint)::text) = 64)));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_humidity_check" CHECK (((humidity_pct IS NULL) OR ((humidity_pct >= 0) AND (humidity_pct <= 100))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_lat_check" CHECK (((sample_latitude_e3 IS NULL) OR ((sample_latitude_e3 >= '-90000'::integer) AND (sample_latitude_e3 <= 90000))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_lease_state_check" CHECK (((status = 'PROCESSING'::enum_activity_weather_status) OR ((lease_expires_at IS NULL) AND (lock_token IS NULL))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_lng_check" CHECK (((sample_longitude_e3 IS NULL) OR ((sample_longitude_e3 >= '-180000'::integer) AND (sample_longitude_e3 <= 180000))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_non_available_weather_check" CHECK (((status = 'AVAILABLE'::enum_activity_weather_status) OR ((sampled_at IS NULL) AND (source IS NULL) AND (attribution_service_name IS NULL) AND (attribution_legal_url IS NULL) AND (condition_code IS NULL) AND (source_condition_code IS NULL) AND (temperature_c IS NULL) AND (apparent_temperature_c IS NULL) AND (dew_point_c IS NULL) AND (wind_chill_c IS NULL) AND (heat_index_c IS NULL) AND (wind_speed_kph IS NULL) AND (wind_gust_kph IS NULL) AND (wind_direction_deg IS NULL) AND (humidity_pct IS NULL) AND (cloud_cover_pct IS NULL) AND (pressure_hpa IS NULL))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_pressure_check" CHECK (((pressure_hpa IS NULL) OR ((pressure_hpa >= (100)::double precision) AND (pressure_hpa <= (1200)::double precision))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_processing_check" CHECK (((status <> 'PROCESSING'::enum_activity_weather_status) OR ((lease_expires_at IS NOT NULL) AND (lock_token IS NOT NULL))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_temperature_check" CHECK ((((temperature_c IS NULL) OR ((temperature_c >= ('-150'::integer)::double precision) AND (temperature_c <= (100)::double precision))) AND ((apparent_temperature_c IS NULL) OR ((apparent_temperature_c >= ('-150'::integer)::double precision) AND (apparent_temperature_c <= (100)::double precision))) AND ((dew_point_c IS NULL) OR ((dew_point_c >= ('-150'::integer)::double precision) AND (dew_point_c <= (100)::double precision))) AND ((wind_chill_c IS NULL) OR ((wind_chill_c >= ('-150'::integer)::double precision) AND (wind_chill_c <= (100)::double precision))) AND ((heat_index_c IS NULL) OR ((heat_index_c >= ('-150'::integer)::double precision) AND (heat_index_c <= (150)::double precision)))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_terminal_reason_check" CHECK (((status <> ALL (ARRAY['NOT_APPLICABLE'::enum_activity_weather_status, 'UNAVAILABLE'::enum_activity_weather_status])) OR ((unavailable_reason IS NOT NULL) AND (input_fingerprint IS NOT NULL))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_wind_direction_check" CHECK (((wind_direction_deg IS NULL) OR ((wind_direction_deg >= 0) AND (wind_direction_deg <= 359))));

ALTER TABLE "t_activity_weather_snapshot" ADD CONSTRAINT "t_activity_weather_snapshot_wind_speed_check" CHECK ((((wind_speed_kph IS NULL) OR (wind_speed_kph >= (0)::double precision)) AND ((wind_gust_kph IS NULL) OR (wind_gust_kph >= (0)::double precision))));

ALTER TABLE "t_ai_usage_event" ADD CONSTRAINT "t_ai_usage_event_tokens_check" CHECK (((input_tokens >= 0) AND (output_tokens >= 0) AND (cached_input_tokens >= 0) AND (cached_input_tokens <= input_tokens) AND (uncached_input_tokens = (input_tokens - cached_input_tokens))));

ALTER TABLE "t_coach_run" ADD CONSTRAINT "t_coach_run_revision_check" CHECK (((revision >= 0) AND (execution_ms >= 0)));

ALTER TABLE "t_coach_run" ADD CONSTRAINT "t_coach_run_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'awaiting_input'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'interrupted'::text])));

ALTER TABLE "t_coach_run_attempt" ADD CONSTRAINT "t_coach_run_attempt_revision_check" CHECK ((revision >= 0));

ALTER TABLE "t_coach_run_attempt" ADD CONSTRAINT "t_coach_run_attempt_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'interrupted'::text])));

ALTER TABLE "t_coach_run_attempt" ADD CONSTRAINT "t_coach_run_attempt_trigger_check" CHECK ((trigger = ANY (ARRAY['start'::text, 'answer'::text, 'retry'::text])));

ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_date_range_check" CHECK (((end_date IS NULL) OR (end_date >= start_date)));

ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_distance_check" CHECK (((distance_meters IS NULL) OR ((distance_meters > (0)::double precision) AND (distance_meters <= (1000000)::double precision))));

ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_location_length_check" CHECK (((location IS NULL) OR (char_length(location) <= 240)));

ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_max_span_check" CHECK (((end_date IS NULL) OR (end_date <= (start_date + 31))));

ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_notes_length_check" CHECK (((notes IS NULL) OR (char_length(notes) <= 4000)));

ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_target_consistency_check" CHECK ((((goal_type = 'TARGET_TIME'::enum_competition_goal_type) AND (target_time_seconds IS NOT NULL)) OR ((goal_type <> 'TARGET_TIME'::enum_competition_goal_type) AND (target_time_seconds IS NULL))));

ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_target_time_check" CHECK (((target_time_seconds IS NULL) OR ((target_time_seconds > 0) AND (target_time_seconds <= 31536000))));

ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_time_check" CHECK (((start_time_minute IS NULL) OR ((start_time_minute >= 0) AND (start_time_minute <= 1439))));

ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_time_timezone_check" CHECK ((((start_time_minute IS NULL) AND (timezone IS NULL)) OR ((start_time_minute IS NOT NULL) AND (timezone IS NOT NULL))));

ALTER TABLE "t_competition_event" ADD CONSTRAINT "t_competition_event_title_length_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)));

ALTER TABLE "t_competition_impact_assessment" ADD CONSTRAINT "t_competition_impact_assessment_confidence_check" CHECK (((confidence IS NULL) OR ((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))));

ALTER TABLE "t_competition_impact_assessment" ADD CONSTRAINT "t_competition_impact_assessment_scope_range_check" CHECK ((scope_end_date >= scope_start_date));

ALTER TABLE "t_plan_workout" ADD CONSTRAINT "t_plan_workout_planned_duration_check" CHECK (((planned_duration_seconds IS NULL) OR (planned_duration_seconds > 0)));

ALTER TABLE "t_plan_workout" ADD CONSTRAINT "t_plan_workout_planned_session_rpe_check" CHECK (((planned_session_rpe IS NULL) OR ((planned_session_rpe >= (1)::double precision) AND (planned_session_rpe <= (10)::double precision))));

ALTER TABLE "t_plan_workout_exercise" ADD CONSTRAINT "t_plan_workout_exercise_order_index_check" CHECK ((order_index >= 0));

ALTER TABLE "t_plan_workout_set_group" ADD CONSTRAINT "t_plan_workout_set_group_effort_check" CHECK (((NOT ((target_rpe IS NOT NULL) AND (target_rir IS NOT NULL))) AND ((target_rpe IS NULL) OR ((target_rpe >= (1)::double precision) AND (target_rpe <= (10)::double precision))) AND ((target_rir IS NULL) OR ((target_rir >= (0)::double precision) AND (target_rir <= (10)::double precision)))));

ALTER TABLE "t_plan_workout_set_group" ADD CONSTRAINT "t_plan_workout_set_group_load_check" CHECK ((((load_type = 'OPEN'::enum_strength_load_type) AND (load_value IS NULL) AND (load_unit IS NULL) AND (bodyweight_offset_direction IS NULL)) OR ((load_type = 'ABSOLUTE'::enum_strength_load_type) AND (load_value >= (0)::double precision) AND (load_unit = ANY (ARRAY['KG'::enum_strength_load_unit, 'LB'::enum_strength_load_unit])) AND (bodyweight_offset_direction IS NULL)) OR ((load_type = 'PERCENT_1RM'::enum_strength_load_type) AND (load_value > (0)::double precision) AND (load_value <= (100)::double precision) AND (load_unit = 'PERCENT'::enum_strength_load_unit) AND (bodyweight_offset_direction IS NULL)) OR ((load_type = 'BODYWEIGHT'::enum_strength_load_type) AND (load_value IS NULL) AND (load_unit IS NULL) AND (bodyweight_offset_direction IS NULL)) OR ((load_type = 'BODYWEIGHT_OFFSET'::enum_strength_load_type) AND (load_value >= (0)::double precision) AND (load_unit = ANY (ARRAY['KG'::enum_strength_load_unit, 'LB'::enum_strength_load_unit])) AND (bodyweight_offset_direction IS NOT NULL))));

ALTER TABLE "t_plan_workout_set_group" ADD CONSTRAINT "t_plan_workout_set_group_order_index_check" CHECK ((order_index >= 0));

ALTER TABLE "t_plan_workout_set_group" ADD CONSTRAINT "t_plan_workout_set_group_reps_check" CHECK ((((prescription_type = 'REPS'::enum_strength_prescription_type) AND (reps_min > 0) AND (reps_max >= reps_min) AND (duration_seconds IS NULL)) OR ((prescription_type = 'TIME'::enum_strength_prescription_type) AND (duration_seconds > 0) AND (reps_min IS NULL) AND (reps_max IS NULL) AND (amrap = false))));

ALTER TABLE "t_plan_workout_set_group" ADD CONSTRAINT "t_plan_workout_set_group_rest_check" CHECK (((rest_seconds IS NULL) OR (rest_seconds > 0)));

ALTER TABLE "t_plan_workout_set_group" ADD CONSTRAINT "t_plan_workout_set_group_set_count_check" CHECK ((set_count > 0));

ALTER TABLE "t_self_host_instance" ADD CONSTRAINT "t_self_host_instance_singleton_check" CHECK ((id = 1));

ALTER TABLE "t_self_host_instance" ADD CONSTRAINT "t_self_host_instance_state_check" CHECK ((((state = 'PENDING'::"SelfHostInitializationState") AND (owner_user_id IS NULL) AND (initialized_at IS NULL) AND (bootstrap_token_hash IS NOT NULL) AND (bootstrap_token_expires_at IS NOT NULL)) OR ((state = 'READY'::"SelfHostInitializationState") AND (owner_user_id IS NOT NULL) AND (initialized_at IS NOT NULL) AND (bootstrap_token_hash IS NULL) AND (bootstrap_token_expires_at IS NULL))));

CREATE UNIQUE INDEX activity_source_one_primary ON public.t_activity_source USING btree (activity_id) WHERE ((is_primary = true) AND (is_active = true));

CREATE UNIQUE INDEX activity_third_party_mapping_one_primary ON public.t_activity_third_party_mapping USING btree (activity_id) WHERE ((is_primary = true) AND (is_active = true));

CREATE UNIQUE INDEX uq_coach_assessment_active_dedupe ON public.t_coach_assessment_case USING btree (user_id, dedupe_key) WHERE (status = ANY (ARRAY['OPEN'::enum_coach_assessment_case_status, 'ASSESSING'::enum_coach_assessment_case_status, 'WAITING_FOR_DATA'::enum_coach_assessment_case_status, 'WAITING_FOR_USER'::enum_coach_assessment_case_status, 'DECISION_READY'::enum_coach_assessment_case_status]));

CREATE UNIQUE INDEX t_coach_run_attempt_one_active ON public.t_coach_run_attempt USING btree (run_id) WHERE (status = 'running'::text);

CREATE INDEX t_external_health_sample_daily_projection_idx ON public.t_external_health_sample USING btree (user_id, local_date, metric_type) WHERE ((deleted_at IS NULL) AND (project_to_daily = true));

CREATE OR REPLACE FUNCTION public.fitness_private_data_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_TABLE_NAME = 't_user_setting' THEN
    IF NEW.category::text <> 'AI_DATA_CONSENT' THEN RETURN NULL; END IF;
    DELETE FROM t_fitness_calculation WHERE user_id = NEW.user_id AND post_process_state <> 'PENDING';
    UPDATE t_fitness_calculation SET input = '{}' WHERE user_id = NEW.user_id AND post_process_state = 'PENDING';
    UPDATE t_fitness_assessment_task SET tracking = false, facts = '{}', stage = 'CLOSED' WHERE user_id = NEW.user_id;
  ELSIF TG_TABLE_NAME = 't_activity' THEN
    DELETE FROM t_fitness_calculation WHERE input->'evidence'->'activityHashIds' @> jsonb_build_array(OLD.hash_id) AND post_process_state <> 'PENDING';
    UPDATE t_fitness_calculation SET input = '{}' WHERE input->'evidence'->'activityHashIds' @> jsonb_build_array(OLD.hash_id);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fitness_publication_changed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE uid text; rowdata jsonb;
BEGIN
  rowdata := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  uid := rowdata->>'user_id';
  IF uid IS NULL AND rowdata ? 'activity_id' THEN
    SELECT user_id INTO uid FROM t_activity WHERE id = (rowdata->>'activity_id')::integer;
  END IF;
  IF uid IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('fitness:' || uid, 0));
    INSERT INTO t_fitness_evidence_revision(user_id, revision)
      SELECT uid, 1 WHERE EXISTS(SELECT 1 FROM t_user WHERE id = uid)
      ON CONFLICT(user_id) DO UPDATE SET revision = t_fitness_evidence_revision.revision + 1;
    UPDATE t_fitness_assessment_task SET next_check_at = now()
      WHERE user_id = uid AND tracking = true;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER fitness_activity_cleanup AFTER DELETE ON public.t_activity FOR EACH ROW EXECUTE FUNCTION fitness_private_data_cleanup();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_activity FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_activity_lap FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_activity_parquet_file FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_activity_peak_metric FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_activity_source FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_activity_vo2max FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_plan_workout FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_plan_workout_activity_link FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_user_body_metric FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_user_daily_health_metric FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_user_fitness_metric FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_user_profile FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_consent_cleanup AFTER UPDATE ON public.t_user_setting FOR EACH ROW WHEN ((old.value IS DISTINCT FROM new.value)) EXECUTE FUNCTION fitness_private_data_cleanup();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_user_setting FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision BEFORE INSERT OR DELETE OR UPDATE ON public.t_user_zone_setting FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('E_BIKING','CYCLING','E-Biking',NULL,'CYCLING',NULL,'RPM','cycling','e_bike',FALSE,TRUE,FALSE,TRUE,FALSE,TRUE,TRUE,TRUE,80,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL) ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('ELLIPTICAL','UNKNOWN','Elliptical',NULL,NULL,NULL,'SPM','training','elliptical',FALSE,TRUE,TRUE,TRUE,FALSE,TRUE,TRUE,TRUE,180,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('GRAVEL_CYCLING','CYCLING','Gravel Cycling',NULL,'CYCLING',NULL,'RPM','cycling','gravel',FALSE,TRUE,TRUE,TRUE,FALSE,TRUE,TRUE,TRUE,60,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('HIIT','UNKNOWN','HIIT',NULL,NULL,NULL,NULL,'training','hiit',FALSE,TRUE,TRUE,FALSE,FALSE,FALSE,TRUE,FALSE,150,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('HIKING','RUN','Hiking',NULL,'RUN',1000,'SPM','hiking','generic',FALSE,TRUE,FALSE,TRUE,TRUE,TRUE,FALSE,TRUE,130,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL) ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('INDOOR_CYCLING','CYCLING','Indoor Cycling',NULL,'CYCLING',NULL,'RPM','cycling','indoor_cycling',FALSE,TRUE,TRUE,TRUE,FALSE,TRUE,TRUE,TRUE,70,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('MOUNTAIN_BIKING','CYCLING','Mountain Biking',NULL,'CYCLING',NULL,'RPM','cycling','mountain',FALSE,TRUE,TRUE,TRUE,FALSE,TRUE,TRUE,TRUE,50,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('OPEN_WATER_SWIMMING','SWIM','Open Water Swimming',NULL,'SWIM',100,'SPM','swimming','open_water',FALSE,TRUE,FALSE,TRUE,TRUE,TRUE,FALSE,TRUE,100,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL) ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('OTHER','UNKNOWN','Other',NULL,NULL,NULL,NULL,'generic','generic',TRUE,TRUE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,999,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL) ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('POOL_SWIMMING','SWIM','Pool Swimming',NULL,'SWIM',100,'SPM','swimming','lap_swimming',TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,FALSE,TRUE,90,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('ROAD_CYCLING','CYCLING','Road Cycling',NULL,'CYCLING',NULL,'RPM','cycling','road',TRUE,TRUE,TRUE,TRUE,FALSE,TRUE,TRUE,TRUE,40,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('ROAD_RUNNING','RUN','Road Running',NULL,'RUN',1000,'SPM','running','generic',TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,10,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('ROWING','UNKNOWN','Rowing',NULL,NULL,NULL,'SPM','rowing','generic',FALSE,TRUE,TRUE,TRUE,FALSE,TRUE,TRUE,TRUE,170,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('STRENGTH_TRAINING','UNKNOWN','Strength Training',NULL,NULL,NULL,NULL,'training','strength_training',FALSE,TRUE,TRUE,FALSE,FALSE,FALSE,FALSE,FALSE,140,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'STRENGTH') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('STRETCHING','STRETCHING','Stretching',NULL,'STRETCHING',NULL,NULL,'training','flexibility_training',TRUE,TRUE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,110,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL) ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('TRAIL_RUNNING','RUN','Trail Running',NULL,'RUN',1000,'SPM','running','trail',FALSE,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,20,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('TREADMILL_RUNNING','RUN','Treadmill Running',NULL,'RUN',1000,'SPM','running','treadmill',FALSE,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,30,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ENDURANCE') ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('WALKING','RUN','Walking',NULL,'RUN',1000,'SPM','walking','generic',FALSE,TRUE,FALSE,TRUE,TRUE,TRUE,FALSE,TRUE,120,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL) ON CONFLICT DO NOTHING;

INSERT INTO "t_sport_definition" ("code","family","display_name","description","zone_family","pace_basis_meters","cadence_unit","fit_sport","fit_sub_sport","is_default_for_family","supports_planning","supports_structured_workout","supports_distance","supports_pace","supports_speed","supports_power","supports_cadence","sort_order","active","metadata","created_at","updated_at","default_workout_structure_kind") VALUES ('YOGA','UNKNOWN','Yoga',NULL,NULL,NULL,NULL,'training','yoga',FALSE,TRUE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,160,TRUE,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_intervals_ride','intervals_icu','RIDE','','BOTH',100,'ROAD_CYCLING','{"apiType":"Ride"}',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_intervals_run','intervals_icu','RUN','','BOTH',100,'ROAD_RUNNING','{"apiType":"Run"}',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_intervals_swim','intervals_icu','SWIM','','BOTH',100,'POOL_SWIMMING','{"apiType":"Swim"}',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_intervals_yoga','intervals_icu','YOGA','','BOTH',100,'STRETCHING','{"apiType":"Yoga"}',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_bike','upload','BIKE','','IMPORT',50,'ROAD_CYCLING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_cycling','upload','CYCLING','','IMPORT',50,'ROAD_CYCLING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_cycling_gravel','upload','CYCLING','GRAVEL','IMPORT',200,'GRAVEL_CYCLING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_cycling_indoor','upload','CYCLING','INDOOR_CYCLING','IMPORT',200,'INDOOR_CYCLING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_cycling_mountain','upload','CYCLING','MOUNTAIN','IMPORT',200,'MOUNTAIN_BIKING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_elliptical','upload','ELLIPTICAL','','IMPORT',150,'ELLIPTICAL',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_flexibility','upload','FLEXIBILITY_TRAINING','','IMPORT',150,'STRETCHING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_hiit','upload','HIIT','','IMPORT',150,'HIIT',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_hiking','upload','HIKING','','IMPORT',100,'HIKING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_indoor_bike','upload','INDOOR_BIKE','','IMPORT',100,'INDOOR_CYCLING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_mtb','upload','MOUNTAIN_BIKING','','IMPORT',100,'MOUNTAIN_BIKING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_open_water','upload','OPEN_WATER_SWIMMING','','IMPORT',100,'OPEN_WATER_SWIMMING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_rowing','upload','ROWING','','IMPORT',150,'ROWING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_run','upload','RUN','','IMPORT',50,'ROAD_RUNNING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_running','upload','RUNNING','','IMPORT',50,'ROAD_RUNNING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_running_trail','upload','RUNNING','TRAIL','IMPORT',200,'TRAIL_RUNNING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_running_treadmill','upload','RUNNING','TREADMILL','IMPORT',200,'TREADMILL_RUNNING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_strength','upload','STRENGTH_TRAINING','','IMPORT',150,'STRENGTH_TRAINING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_stretching','upload','STRETCHING','','IMPORT',100,'STRETCHING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_swim','upload','SWIM','','IMPORT',50,'POOL_SWIMMING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_swimming','upload','SWIMMING','','IMPORT',50,'POOL_SWIMMING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_swimming_lap','upload','SWIMMING','LAP_SWIMMING','IMPORT',200,'POOL_SWIMMING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_swimming_open_water','upload','SWIMMING','OPEN_WATER','IMPORT',200,'OPEN_WATER_SWIMMING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_trail','upload','TRAIL_RUNNING','','IMPORT',100,'TRAIL_RUNNING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_training_flexibility','upload','TRAINING','FLEXIBILITY_TRAINING','IMPORT',200,'STRETCHING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_training_strength','upload','TRAINING','STRENGTH_TRAINING','IMPORT',200,'STRENGTH_TRAINING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_treadmill','upload','TREADMILL','','IMPORT',100,'TREADMILL_RUNNING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_walking','upload','WALKING','','IMPORT',100,'WALKING',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO "t_provider_sport_mapping" ("id","provider","external_code","external_sub_code","direction","priority","sport_code","metadata","active","created_at","updated_at") VALUES ('spm_upload_yoga','upload','YOGA','','IMPORT',150,'YOGA',NULL,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
