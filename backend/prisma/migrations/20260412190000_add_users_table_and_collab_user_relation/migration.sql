CREATE TABLE "users" (
  "user_id" TEXT NOT NULL,
  "client_id" TEXT,
  "display_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

CREATE UNIQUE INDEX "users_client_id_key" ON "users"("client_id");

INSERT INTO "users" ("user_id", "display_name")
SELECT DISTINCT "user_id", COALESCE(MAX("display_name"), "user_id")
FROM "collab_sessions"
GROUP BY "user_id"
ON CONFLICT ("user_id") DO NOTHING;

ALTER TABLE "collab_sessions" DROP COLUMN IF EXISTS "display_name";

ALTER TABLE "collab_sessions"
ADD CONSTRAINT "collab_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
ON DELETE CASCADE ON UPDATE CASCADE;
