-- Add archive flag to checklist templates so they can be hidden without deletion
ALTER TABLE "ChecklistTemplate"
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
