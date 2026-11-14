-- General preferences and access projections are not training evidence.
-- Keep consent changes fenced, including consent deletion and revocation.
CREATE OR REPLACE FUNCTION public.fitness_publication_changed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE uid text; rowdata jsonb;
BEGIN
  rowdata := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME = 't_user_setting' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.category::text <> 'AI_DATA_CONSENT' AND NEW.category::text <> 'AI_DATA_CONSENT' THEN
        RETURN NEW;
      END IF;
    ELSIF (rowdata->>'category') IS DISTINCT FROM 'AI_DATA_CONSENT' THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
  END IF;

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
$function$;
