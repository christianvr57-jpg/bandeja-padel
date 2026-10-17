CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"gender" text NOT NULL,
	"level" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"max_pairs" integer NOT NULL,
	"format" text NOT NULL,
	"match_format" text NOT NULL,
	"group_size" integer DEFAULT 4 NOT NULL,
	"qualifiers_per_group" integer DEFAULT 2 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"draw_generated_at" timestamp with time zone,
	"draw_groups" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"kind" text NOT NULL,
	"body" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"key" text NOT NULL,
	"phase" text NOT NULL,
	"round" integer NOT NULL,
	"position" integer NOT NULL,
	"group_key" text,
	"source_a" jsonb NOT NULL,
	"source_b" jsonb NOT NULL,
	"pair_a_id" uuid,
	"pair_b_id" uuid,
	"status" text DEFAULT 'waiting' NOT NULL,
	"outcome" text,
	"sets" jsonb,
	"winner_side" text,
	"result_at" timestamp with time zone,
	"court_id" uuid,
	"scheduled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"dni" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"status" text NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"seed" integer,
	"token_hash" text,
	"consent_at" timestamp with time zone,
	"consent_version" text,
	"notes" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'Europe/Madrid' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"registration_deadline" timestamp with time zone,
	"rules" text DEFAULT '' NOT NULL,
	"image" text,
	"match_duration_min" integer DEFAULT 90 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"registration_open" boolean DEFAULT true NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"personal_data_purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "courts_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_tournament_idx" ON "categories" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clubs_email_key" ON "clubs" USING btree ("email");--> statement-breakpoint
CREATE INDEX "courts_tournament_idx" ON "courts" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "emails_created_idx" ON "emails" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_category_key" ON "matches" USING btree ("category_id","key");--> statement-breakpoint
CREATE INDEX "matches_tournament_idx" ON "matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "players_registration_idx" ON "players" USING btree ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_category_dni_active_key" ON "players" USING btree ("category_id","dni") WHERE "players"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_token_key" ON "registrations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "registrations_category_idx" ON "registrations" USING btree ("category_id","status","created_at");--> statement-breakpoint
CREATE INDEX "registrations_tournament_idx" ON "registrations" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "sessions_club_idx" ON "sessions" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_slug_key" ON "tournaments" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tournaments_club_idx" ON "tournaments" USING btree ("club_id");