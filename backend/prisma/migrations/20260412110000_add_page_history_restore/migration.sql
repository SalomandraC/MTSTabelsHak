ALTER TYPE "CheckpointTrigger" ADD VALUE IF NOT EXISTS 'restore';

ALTER TABLE "page_checkpoints"
  ADD COLUMN "created_by_name" TEXT,
  ADD COLUMN "restored_from_checkpoint_id" TEXT;

CREATE INDEX "page_checkpoints_restored_from_checkpoint_id_idx"
  ON "page_checkpoints"("restored_from_checkpoint_id");
