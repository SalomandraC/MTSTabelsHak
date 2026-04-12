ALTER TABLE "wiki_nodes"
  ADD COLUMN IF NOT EXISTS "mws_space_id" TEXT,
  ADD COLUMN IF NOT EXISTS "mws_parent_node_id" TEXT,
  ADD COLUMN IF NOT EXISTS "mws_source_node_id" TEXT,
  ADD COLUMN IF NOT EXISTS "mws_datasheet_id" TEXT;

CREATE INDEX IF NOT EXISTS "wiki_nodes_space_id_mws_parent_node_id_idx"
  ON "wiki_nodes"("space_id", "mws_parent_node_id");

CREATE INDEX IF NOT EXISTS "wiki_nodes_space_id_mws_source_node_id_idx"
  ON "wiki_nodes"("space_id", "mws_source_node_id");
