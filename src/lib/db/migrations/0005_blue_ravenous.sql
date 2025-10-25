ALTER TABLE "metadata" RENAME COLUMN "stored" TO "Stored";--> statement-breakpoint
ALTER TABLE "metadata" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_slug_unique" UNIQUE("slug");