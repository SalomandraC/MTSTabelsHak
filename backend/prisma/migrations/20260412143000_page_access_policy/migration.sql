-- CreateEnum
CREATE TYPE "DocumentAccessScope" AS ENUM ('owner_only', 'space_members', 'link_holders');

-- CreateTable
CREATE TABLE "page_access_policies" (
    "page_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "view_access" "DocumentAccessScope" NOT NULL DEFAULT 'space_members',
    "comment_access" "DocumentAccessScope" NOT NULL DEFAULT 'space_members',
    "edit_access" "DocumentAccessScope" NOT NULL DEFAULT 'space_members',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_access_policies_pkey" PRIMARY KEY ("page_id")
);

-- Backfill policies for existing pages
INSERT INTO "page_access_policies" (
    "page_id",
    "owner_user_id",
    "view_access",
    "comment_access",
    "edit_access",
    "created_at",
    "updated_at"
)
SELECT
    wp."node_id",
    wn."created_by",
    'space_members'::"DocumentAccessScope",
    'space_members'::"DocumentAccessScope",
    'space_members'::"DocumentAccessScope",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "wiki_pages" wp
INNER JOIN "wiki_nodes" wn ON wn."id" = wp."node_id"
ON CONFLICT ("page_id") DO NOTHING;

-- CreateIndex
CREATE INDEX "page_access_policies_owner_user_id_idx" ON "page_access_policies"("owner_user_id");

-- CreateIndex
CREATE INDEX "page_access_policies_view_access_idx" ON "page_access_policies"("view_access");

-- CreateIndex
CREATE INDEX "page_access_policies_edit_access_idx" ON "page_access_policies"("edit_access");

-- AddForeignKey
ALTER TABLE "page_access_policies"
ADD CONSTRAINT "page_access_policies_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("node_id") ON DELETE CASCADE ON UPDATE CASCADE;
