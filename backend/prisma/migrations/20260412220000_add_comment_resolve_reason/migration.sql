CREATE TYPE "CommentResolveReason" AS ENUM ('manual', 'anchor_removed_by_restore');

ALTER TABLE "page_comment_threads"
  ADD COLUMN "resolved_reason" "CommentResolveReason";
