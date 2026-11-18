CREATE TABLE "users"."original_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "original_documents_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "users"."original_documents" ADD CONSTRAINT "original_documents_account_id_candidate_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "users"."candidate_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "original_documents_account_created" ON "users"."original_documents" USING btree ("account_id","created_at" DESC NULLS LAST,"id");
--> statement-breakpoint
WITH existing AS (
  SELECT account_id, cv_url AS key, 'CV original' AS name, profile_updated_at AS created_at
  FROM users.candidate_profiles WHERE cv_url IS NOT NULL
  UNION ALL
  SELECT p.account_id, e.key, 'Documento ' || e.position, p.profile_updated_at
  FROM users.candidate_profiles p
  CROSS JOIN LATERAL unnest(p.evidence_urls) WITH ORDINALITY AS e(key, position)
  UNION ALL
  SELECT account_id, source_key, name, created_at
  FROM users.cv_documents WHERE source_key IS NOT NULL
)
INSERT INTO users.original_documents (account_id, key, name, created_at)
SELECT account_id, key, regexp_replace(name, '\.(pdf|docx)$', '', 'i') || '.' || substring(key FROM '\.(pdf|docx)$'), created_at
FROM existing
WHERE key ~ '\.(pdf|docx)$'
ORDER BY created_at DESC, name
ON CONFLICT (key) DO NOTHING;
