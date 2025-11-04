-- Drop deprecated approvalNote columns; tolerate environments where they were never created.
ALTER TABLE "TimeEntry"
  DROP COLUMN IF EXISTS "approvalNote";

ALTER TABLE "MaterialUsage"
  DROP COLUMN IF EXISTS "approvalNote";
