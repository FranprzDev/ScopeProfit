ALTER TABLE "oauth_tokens" ADD COLUMN "grant_id" UUID NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX "oauth_tokens_grant_id_idx" ON "oauth_tokens"("grant_id");
