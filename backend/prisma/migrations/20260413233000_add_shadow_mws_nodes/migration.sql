ALTER TYPE "WikiNodeType" ADD VALUE IF NOT EXISTS 'mws_folder';
ALTER TYPE "WikiNodeType" ADD VALUE IF NOT EXISTS 'mws_table';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NodeSourceType') THEN
    CREATE TYPE "NodeSourceType" AS ENUM ('local', 'mws');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NodeSyncState') THEN
    CREATE TYPE "NodeSyncState" AS ENUM ('local_only', 'synced', 'stale');
  END IF;
END $$;

ALTER TABLE "wiki_nodes"
  ADD COLUMN IF NOT EXISTS "source_type" "NodeSourceType" NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS "source_node_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_parent_node_id" TEXT,
  ADD COLUMN IF NOT EXISTS "is_external_readonly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sync_state" "NodeSyncState" NOT NULL DEFAULT 'local_only',
  ADD COLUMN IF NOT EXISTS "last_seen_in_source_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "wiki_nodes_space_id_source_type_source_node_id_idx"
  ON "wiki_nodes"("space_id", "source_type", "source_node_id");

CREATE INDEX IF NOT EXISTS "wiki_nodes_space_id_source_parent_node_id_idx"
  ON "wiki_nodes"("space_id", "source_parent_node_id");

CREATE UNIQUE INDEX IF NOT EXISTS "wiki_nodes_space_id_source_type_source_node_id_key"
  ON "wiki_nodes"("space_id", "source_type", "source_node_id")
  WHERE "source_node_id" IS NOT NULL;
