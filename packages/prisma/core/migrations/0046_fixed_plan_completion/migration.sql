CREATE TABLE "t_plan_fixed_completion_policy" (
  "id" INTEGER NOT NULL,
  "enabled_from" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "t_plan_fixed_completion_policy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "t_plan_fixed_completion_policy_singleton" CHECK ("id" = 1)
);

INSERT INTO "t_plan_fixed_completion_policy" ("id", "enabled_from")
VALUES (1, CURRENT_TIMESTAMP);
