CREATE TABLE "characters" (
	"owner_id" text NOT NULL,
	"id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"schema_version" integer NOT NULL,
	"document_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_owner_id_id_pk" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "characters_revision_check" CHECK ("characters"."revision" >= 1),
	CONSTRAINT "characters_schema_version_check" CHECK ("characters"."schema_version" >= 1),
	CONSTRAINT "characters_document_json_object_check" CHECK (jsonb_typeof("characters"."document_json") = 'object')
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "characters_owner_updated_id_idx" ON "characters" USING btree ("owner_id","updated_at" DESC NULLS LAST,"id");