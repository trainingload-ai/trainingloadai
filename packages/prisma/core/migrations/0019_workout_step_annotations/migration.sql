ALTER TABLE "t_plan_workout_step" ADD COLUMN "step_annotations" JSONB;
ALTER TABLE "t_plan_workout_step" ADD CONSTRAINT "t_plan_workout_step_annotations_shape_check" CHECK (
  "step_annotations" IS NULL OR (
    jsonb_typeof("step_annotations") = 'object'
    AND "step_annotations" ? 'version'
    AND "step_annotations" -> 'version' = '1'::jsonb
    AND octet_length("step_annotations"::text) <= 8192
    AND ("step_annotations" - 'version' - 'swimMeta' - 'secondaryTarget') = '{}'::jsonb
  )
);
