CREATE TYPE "CommentThreadStatus" AS ENUM ('open', 'resolved');

CREATE TABLE "page_comment_threads" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "anchor_text" TEXT NOT NULL,
    "status" "CommentThreadStatus" NOT NULL DEFAULT 'open',
    "created_by" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_comment_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "page_comment_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "page_comment_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_comment_threads_page_id_status_updated_at_idx" ON "page_comment_threads"("page_id", "status", "updated_at");
CREATE INDEX "page_comment_messages_thread_id_created_at_idx" ON "page_comment_messages"("thread_id", "created_at");

ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "page_comment_messages" ADD CONSTRAINT "page_comment_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "page_comment_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
