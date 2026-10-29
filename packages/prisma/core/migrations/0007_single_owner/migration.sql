-- Only the independent Public lineage applies this constraint. Managed Cloud
-- keeps its production migration history and supports multiple users.
-- Existing multi-user databases fail closed; no account is removed or merged.
CREATE UNIQUE INDEX "t_user_single_owner_key" ON "t_user" ((true));
