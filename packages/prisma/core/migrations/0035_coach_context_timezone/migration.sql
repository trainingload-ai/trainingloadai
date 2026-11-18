CREATE TABLE "t_today_suggestion_context_reference" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "timezone" TEXT NOT NULL
);
CREATE UNIQUE INDEX "t_today_suggestion_context_reference_user_id_timezone_key"
  ON "t_today_suggestion_context_reference"("user_id", "timezone");
