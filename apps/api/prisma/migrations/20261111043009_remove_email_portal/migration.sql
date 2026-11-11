/*
  Warnings:

  - You are about to drop the column `client_email` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the `admin_nonces` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `magic_links` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_links` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sessions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "project_links" DROP CONSTRAINT "project_links_project_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropIndex
DROP INDEX "projects_client_email_idx";

-- AlterTable
ALTER TABLE "oauth_tokens" ALTER COLUMN "grant_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "client_email";

-- DropTable
DROP TABLE "admin_nonces";

-- DropTable
DROP TABLE "magic_links";

-- DropTable
DROP TABLE "project_links";

-- DropTable
DROP TABLE "sessions";
