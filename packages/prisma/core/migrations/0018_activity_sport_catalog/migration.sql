-- Expand import/display taxonomy without inventing endurance thresholds or device export support.
INSERT INTO t_sport_definition
(code,family,display_name,default_workout_structure_kind,supports_planning,supports_structured_workout,supports_distance,supports_pace,supports_speed,supports_power,supports_cadence,sort_order,active,created_at,updated_at)
VALUES
('CROSSFIT','UNKNOWN','CrossFit','FREEFORM',FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,200,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('PADEL','UNKNOWN','Padel','FREEFORM',FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,210,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('ALPINE_SKIING','UNKNOWN','Alpine skiing','FREEFORM',FALSE,FALSE,TRUE,FALSE,TRUE,FALSE,FALSE,220,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('SNOWBOARDING','UNKNOWN','Snowboarding','FREEFORM',FALSE,FALSE,TRUE,FALSE,TRUE,FALSE,FALSE,230,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('MIXED_MARTIAL_ARTS','UNKNOWN','Mixed martial arts','FREEFORM',FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,240,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('SOCCER','UNKNOWN','Football','FREEFORM',FALSE,FALSE,TRUE,FALSE,TRUE,FALSE,FALSE,250,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('BASKETBALL','UNKNOWN','Basketball','FREEFORM',FALSE,FALSE,TRUE,FALSE,TRUE,FALSE,FALSE,260,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('FISHING','UNKNOWN','Fishing','FREEFORM',FALSE,FALSE,TRUE,FALSE,FALSE,FALSE,FALSE,270,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT (code) DO NOTHING;

-- Explicit enums observed in saved source payloads. Existing administrator mappings win.
INSERT INTO t_provider_sport_mapping
(id,provider,external_code,external_sub_code,direction,priority,sport_code,active,created_at,updated_at)
VALUES
('sport_import_v2_intervals_icu_weighttraining_','intervals_icu','WEIGHTTRAINING','','IMPORT',200,'STRENGTH_TRAINING',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_intervals_icu_elliptical_','intervals_icu','ELLIPTICAL','','IMPORT',200,'ELLIPTICAL',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_intervals_icu_crossfit_','intervals_icu','CROSSFIT','','IMPORT',200,'CROSSFIT',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_intervals_icu_padel_','intervals_icu','PADEL','','IMPORT',200,'PADEL',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_intervals_icu_snowboard_','intervals_icu','SNOWBOARD','','IMPORT',200,'SNOWBOARDING',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_intervals_icu_soccer_','intervals_icu','SOCCER','','IMPORT',200,'SOCCER',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_intervals_icu_basketball_','intervals_icu','BASKETBALL','','IMPORT',200,'BASKETBALL',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_intervals_icu_walk_','intervals_icu','WALK','','IMPORT',200,'WALKING',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_upload_crossfit_','upload','CROSSFIT','','IMPORT',200,'CROSSFIT',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_upload_racket_padel','upload','RACKET','PADEL','IMPORT',200,'PADEL',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_upload_alpine_skiing_','upload','ALPINE_SKIING','','IMPORT',200,'ALPINE_SKIING',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_upload_snowboarding_','upload','SNOWBOARDING','','IMPORT',200,'SNOWBOARDING',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_upload_mixed_martial_arts_','upload','MIXED_MARTIAL_ARTS','','IMPORT',200,'MIXED_MARTIAL_ARTS',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_upload_soccer_','upload','SOCCER','','IMPORT',200,'SOCCER',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_upload_basketball_','upload','BASKETBALL','','IMPORT',200,'BASKETBALL',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('sport_import_v2_upload_fishing_','upload','FISHING','','IMPORT',200,'FISHING',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
