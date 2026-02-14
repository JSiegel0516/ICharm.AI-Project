ALTER TABLE "metadata" RENAME COLUMN "Stored" TO "stored";--> statement-breakpoint
ALTER TABLE "metadata" ADD COLUMN "datasetShortName" text;--> statement-breakpoint
ALTER TABLE "metadata" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "metadata" ADD COLUMN "storageType" text NOT NULL;--> statement-breakpoint
ALTER TABLE "metadata" ADD COLUMN "postgresProcessor" text;--> statement-breakpoint
ALTER TABLE "metadata" ADD COLUMN "infoLocation" text;
