CREATE TABLE "t_plan_workout_change_revision" (
  "user_id" TEXT PRIMARY KEY REFERENCES "t_user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" BIGINT NOT NULL,
  "outbound_revision" BIGINT NOT NULL,
  "source" TEXT NOT NULL,
  "outbound_source" TEXT,
  "calendar_revision" BIGINT NOT NULL DEFAULT 0,
  "calendar_adjustment_version_id" TEXT,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE FUNCTION record_plan_workout_change_revision(
  change_user TEXT, fallback_source TEXT, calendar_version TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  change_source TEXT := COALESCE(NULLIF(current_setting('trainingload.plan_workout_change_source', true), ''), fallback_source);
  is_outbound BOOLEAN := change_source <> 'garmin_schedule_import';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM t_user WHERE id = change_user) THEN
    RETURN;
  END IF;

  INSERT INTO t_plan_workout_change_revision AS changes
    (user_id, revision, outbound_revision, source, outbound_source,
     calendar_revision, calendar_adjustment_version_id, updated_at)
  VALUES (change_user, 1, CASE WHEN is_outbound THEN 1 ELSE 0 END, change_source,
    CASE WHEN is_outbound THEN change_source END,
    CASE WHEN calendar_version IS NOT NULL THEN 1 ELSE 0 END,
    calendar_version, clock_timestamp())
  ON CONFLICT (user_id) DO UPDATE
    SET revision = changes.revision + 1,
        outbound_revision = changes.outbound_revision + EXCLUDED.outbound_revision,
        source = EXCLUDED.source,
        outbound_source = COALESCE(EXCLUDED.outbound_source, changes.outbound_source),
        calendar_revision = CASE WHEN calendar_version IS NOT NULL
          THEN changes.revision + 1 ELSE changes.calendar_revision END,
        calendar_adjustment_version_id = COALESCE(calendar_version, changes.calendar_adjustment_version_id),
        updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE FUNCTION plan_workout_record_committed_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_visible BOOLEAN := false;
  new_visible BOOLEAN := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_visible := OLD.scheduled_date IS NOT NULL AND
      (OLD.plan_id IS NULL OR EXISTS (
        SELECT 1 FROM t_plan WHERE id = OLD.plan_id AND status IN ('ACTIVE', 'PAUSED', 'SCHEDULED')));
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_visible := NEW.scheduled_date IS NOT NULL AND
      (NEW.plan_id IS NULL OR EXISTS (
        SELECT 1 FROM t_plan WHERE id = NEW.plan_id AND status IN ('ACTIVE', 'PAUSED', 'SCHEDULED')));
  END IF;
  IF old_visible OR new_visible THEN
    PERFORM record_plan_workout_change_revision(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END,
      'workout_' || lower(TG_OP));
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER plan_workout_change_record
  AFTER INSERT OR UPDATE OR DELETE ON "t_plan_workout"
  FOR EACH ROW EXECUTE FUNCTION plan_workout_record_committed_change();

CREATE FUNCTION plan_record_workout_visibility_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('ACTIVE', 'PAUSED', 'SCHEDULED') THEN
      PERFORM record_plan_workout_change_revision(NEW.user_id, 'plan_' || lower(NEW.status::text));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('ACTIVE', 'PAUSED', 'SCHEDULED') THEN
      PERFORM record_plan_workout_change_revision(OLD.user_id, 'plan_delete');
    END IF;
  ELSIF (NEW.status, NEW.start_date, NEW.supersedes_plan_id)
      IS DISTINCT FROM (OLD.status, OLD.start_date, OLD.supersedes_plan_id)
      AND (OLD.status IN ('ACTIVE', 'PAUSED', 'SCHEDULED') OR
           NEW.status IN ('ACTIVE', 'PAUSED', 'SCHEDULED')) THEN
    PERFORM record_plan_workout_change_revision(NEW.user_id, 'plan_' || lower(NEW.status::text));
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER plan_workout_visibility_change_record
  AFTER INSERT OR UPDATE OR DELETE ON "t_plan"
  FOR EACH ROW EXECUTE FUNCTION plan_record_workout_visibility_change();

CREATE FUNCTION plan_calendar_record_workout_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.calendar_receipt IS NOT NULL AND
     (TG_OP = 'INSERT' OR OLD.calendar_receipt IS DISTINCT FROM NEW.calendar_receipt) THEN
    PERFORM record_plan_workout_change_revision(NEW.user_id, 'calendar_adjustment', NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER plan_calendar_workout_change_record
  AFTER INSERT OR UPDATE OF calendar_receipt ON "t_plan_proposal_preview"
  FOR EACH ROW EXECUTE FUNCTION plan_calendar_record_workout_change();
