ALTER TYPE "ChangeRequestStatus" ADD VALUE 'applying';

ALTER TABLE "change_requests"
  ADD COLUMN "patch" JSONB,
  ADD COLUMN "decision_by" TEXT,
  ADD COLUMN "decision_at" TIMESTAMP(3),
  ADD COLUMN "applied_brief_version" INTEGER,
  ADD COLUMN "document_version" INTEGER,
  ADD COLUMN "last_error" TEXT;
