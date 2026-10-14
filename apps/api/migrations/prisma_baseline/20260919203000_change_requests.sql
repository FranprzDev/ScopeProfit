CREATE TABLE "change_requests" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "actor_id" UUID,
    "base_brief_version" INTEGER NOT NULL,
    "request" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "min_hours" INTEGER,
    "max_hours" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "change_requests_project_id_created_at_idx" ON "change_requests"("project_id", "created_at");
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
