ALTER TABLE "user" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profession" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "organization" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "show_profession" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "avatar_url" text;