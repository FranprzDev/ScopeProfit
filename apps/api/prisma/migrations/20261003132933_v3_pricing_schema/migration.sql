-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('draft', 'sent', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('active', 'paused', 'ended');

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "hourly_rate" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "margin_percent" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal_min" DECIMAL(12,2) NOT NULL,
    "subtotal_max" DECIMAL(12,2) NOT NULL,
    "total_min" DECIMAL(12,2) NOT NULL,
    "total_max" DECIMAL(12,2) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "terms" TEXT,
    "rate_card_snapshot" JSONB,
    "sent_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "min_hours" INTEGER NOT NULL,
    "max_hours" INTEGER NOT NULL,
    "hourly_rate" DECIMAL(12,2) NOT NULL,
    "price_min" DECIMAL(12,2) NOT NULL,
    "price_max" DECIMAL(12,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_milestones" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "percent" INTEGER,
    "amount" DECIMAL(12,2),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_agreements" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'active',
    "hours_per_month" DECIMAL(6,2) NOT NULL,
    "monthly_price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_entries" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "change_request_id" UUID,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "description" TEXT NOT NULL,
    "billable_extra" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_cards_owner_id_idx" ON "rate_cards"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_project_id_key" ON "quotes"("project_id");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quote_lines_quote_id_idx" ON "quote_lines"("quote_id");

-- CreateIndex
CREATE INDEX "quote_milestones_quote_id_idx" ON "quote_milestones"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_agreements_project_id_key" ON "maintenance_agreements"("project_id");

-- CreateIndex
CREATE INDEX "maintenance_agreements_status_idx" ON "maintenance_agreements"("status");

-- CreateIndex
CREATE INDEX "maintenance_entries_agreement_id_idx" ON "maintenance_entries"("agreement_id");

-- CreateIndex
CREATE INDEX "maintenance_entries_change_request_id_idx" ON "maintenance_entries"("change_request_id");

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_milestones" ADD CONSTRAINT "quote_milestones_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_agreements" ADD CONSTRAINT "maintenance_agreements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_entries" ADD CONSTRAINT "maintenance_entries_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "maintenance_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_entries" ADD CONSTRAINT "maintenance_entries_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

