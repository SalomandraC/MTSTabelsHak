-- CreateTable
CREATE TABLE "template_categories" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "template_categories_title_key" ON "template_categories"("title");

-- Backfill categories that already exist in templates
INSERT INTO "template_categories" ("title")
SELECT DISTINCT "category"
FROM "page_templates"
WHERE "category" IS NOT NULL AND "category" <> ''
ON CONFLICT ("title") DO NOTHING;

-- Add new columns to templates
ALTER TABLE "page_templates" ADD COLUMN "category_id" TEXT;
ALTER TABLE "page_templates" ADD COLUMN "usage_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill template categories
UPDATE "page_templates" p
SET "category_id" = c."id"
FROM "template_categories" c
WHERE c."title" = p."category";

UPDATE "page_templates"
SET "category_id" = (SELECT "id" FROM "template_categories" ORDER BY "title" LIMIT 1)
WHERE "category_id" IS NULL;

-- Add FK and indexes
ALTER TABLE "page_templates"
ADD CONSTRAINT "page_templates_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "template_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "page_templates_category_id_idx" ON "page_templates"("category_id");
CREATE INDEX "page_templates_usage_count_idx" ON "page_templates"("usage_count");
