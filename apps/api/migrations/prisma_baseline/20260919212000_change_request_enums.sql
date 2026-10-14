CREATE TYPE "ChangeClassification" AS ENUM ('in_scope', 'out_of_scope', 'ambiguous');
CREATE TYPE "ChangeRequestStatus" AS ENUM ('proposed', 'accepted', 'rejected');
ALTER TABLE "change_requests" ALTER COLUMN "classification" TYPE "ChangeClassification" USING "classification"::"ChangeClassification";
ALTER TABLE "change_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "change_requests" ALTER COLUMN "status" TYPE "ChangeRequestStatus" USING "status"::"ChangeRequestStatus";
ALTER TABLE "change_requests" ALTER COLUMN "status" SET DEFAULT 'proposed';
