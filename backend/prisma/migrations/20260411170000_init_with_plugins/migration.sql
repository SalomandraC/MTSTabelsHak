-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WikiNodeType" AS ENUM ('folder', 'page');

-- CreateEnum
CREATE TYPE "EmbedProvider" AS ENUM ('mws_tables');

-- CreateEnum
CREATE TYPE "CheckpointTrigger" AS ENUM ('editor_idle', 'before_unload', 'manual', 'reconnect', 'collab_store');

-- CreateEnum
CREATE TYPE "PluginScopeType" AS ENUM ('user');

-- CreateTable
CREATE TABLE "wiki_nodes" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "type" "WikiNodeType" NOT NULL,
    "parent_id" TEXT,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wiki_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_pages" (
    "node_id" TEXT NOT NULL,
    "plain_text_preview" TEXT,
    "last_snapshot_version" BIGINT NOT NULL DEFAULT 0,
    "latest_checkpoint_id" TEXT,
    "last_compacted_at" TIMESTAMP(3),
    "last_indexed_at" TIMESTAMP(3),

    CONSTRAINT "wiki_pages_pkey" PRIMARY KEY ("node_id")
);

-- CreateTable
CREATE TABLE "page_documents" (
    "page_id" TEXT NOT NULL,
    "ydoc_snapshot" BYTEA NOT NULL,
    "state_vector" BYTEA NOT NULL,
    "server_version" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_documents_pkey" PRIMARY KEY ("page_id")
);

-- CreateTable
CREATE TABLE "page_crdt_updates" (
    "id" BIGSERIAL NOT NULL,
    "page_id" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "update_payload" BYTEA NOT NULL,
    "origin_session_id" TEXT,
    "origin_client_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_crdt_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_checkpoints" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "server_version" BIGINT NOT NULL,
    "snapshot" BYTEA NOT NULL,
    "state_vector" BYTEA NOT NULL,
    "trigger" "CheckpointTrigger" NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_links" (
    "source_page_id" TEXT NOT NULL,
    "target_page_id" TEXT NOT NULL,
    "mention_count" INTEGER NOT NULL DEFAULT 1,
    "last_reindexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_links_pkey" PRIMARY KEY ("source_page_id","target_page_id")
);

-- CreateTable
CREATE TABLE "page_embeds" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "provider" "EmbedProvider" NOT NULL,
    "mws_space_id" TEXT,
    "mws_node_id" TEXT,
    "mws_datasheet_id" TEXT,
    "mws_view_id" TEXT,
    "display_mode" TEXT,
    "selected_field_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filter_formula" TEXT,
    "page_size" INTEGER,
    "allow_inline_edit" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "last_resolved_at" TIMESTAMP(3),

    CONSTRAINT "page_embeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collab_sessions" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "display_name" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),
    "disconnected_at" TIMESTAMP(3),
    "close_reason" TEXT,

    CONSTRAINT "collab_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_activations" (
    "id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "scope_type" "PluginScopeType" NOT NULL DEFAULT 'user',
    "user_id" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_activations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wiki_nodes_space_id_parent_id_position_idx" ON "wiki_nodes"("space_id", "parent_id", "position");

-- CreateIndex
CREATE INDEX "wiki_nodes_space_id_type_is_archived_idx" ON "wiki_nodes"("space_id", "type", "is_archived");

-- CreateIndex
CREATE INDEX "page_crdt_updates_page_id_created_at_idx" ON "page_crdt_updates"("page_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "page_crdt_updates_page_id_seq_key" ON "page_crdt_updates"("page_id", "seq");

-- CreateIndex
CREATE INDEX "page_checkpoints_page_id_created_at_idx" ON "page_checkpoints"("page_id", "created_at");

-- CreateIndex
CREATE INDEX "page_links_target_page_id_idx" ON "page_links"("target_page_id");

-- CreateIndex
CREATE INDEX "page_embeds_page_id_provider_idx" ON "page_embeds"("page_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "page_embeds_page_id_block_id_key" ON "page_embeds"("page_id", "block_id");

-- CreateIndex
CREATE INDEX "collab_sessions_page_id_connected_at_idx" ON "collab_sessions"("page_id", "connected_at");

-- CreateIndex
CREATE INDEX "collab_sessions_user_id_connected_at_idx" ON "collab_sessions"("user_id", "connected_at");

-- CreateIndex
CREATE INDEX "plugin_activations_user_id_scope_type_idx" ON "plugin_activations"("user_id", "scope_type");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_activations_plugin_id_scope_type_user_id_key" ON "plugin_activations"("plugin_id", "scope_type", "user_id");

-- AddForeignKey
ALTER TABLE "wiki_nodes" ADD CONSTRAINT "wiki_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "wiki_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "wiki_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_documents" ADD CONSTRAINT "page_documents_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("node_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_crdt_updates" ADD CONSTRAINT "page_crdt_updates_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("node_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_checkpoints" ADD CONSTRAINT "page_checkpoints_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("node_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_links" ADD CONSTRAINT "page_links_source_page_id_fkey" FOREIGN KEY ("source_page_id") REFERENCES "wiki_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_links" ADD CONSTRAINT "page_links_target_page_id_fkey" FOREIGN KEY ("target_page_id") REFERENCES "wiki_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_embeds" ADD CONSTRAINT "page_embeds_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collab_sessions" ADD CONSTRAINT "collab_sessions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

