-- CreateTable
CREATE TABLE "usage_events" (
    "id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "key_hash" TEXT NOT NULL,
    "origin_class" TEXT NOT NULL,
    "client_name" TEXT,
    "session_hash" TEXT NOT NULL,
    "tool" TEXT,
    "ok" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_conversions" (
    "key_hash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "first_day" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_conversions_pkey" PRIMARY KEY ("key_hash","kind")
);

-- CreateIndex
CREATE INDEX "usage_events_day_origin_class_idx" ON "usage_events"("day", "origin_class");

-- CreateIndex
CREATE INDEX "usage_events_key_hash_day_idx" ON "usage_events"("key_hash", "day");
