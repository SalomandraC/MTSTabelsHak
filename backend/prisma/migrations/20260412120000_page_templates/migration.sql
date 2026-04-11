-- CreateEnum
CREATE TYPE "TemplateAccessLevel" AS ENUM ('private', 'space', 'public');

-- CreateTable
CREATE TABLE "page_templates" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'sparkles',
    "access_level" "TemplateAccessLevel" NOT NULL DEFAULT 'private',
    "page_title_template" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "document" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_templates_space_id_access_level_idx" ON "page_templates"("space_id", "access_level");

-- CreateIndex
CREATE INDEX "page_templates_owner_user_id_access_level_idx" ON "page_templates"("owner_user_id", "access_level");