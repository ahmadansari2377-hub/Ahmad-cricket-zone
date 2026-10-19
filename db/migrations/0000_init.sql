CREATE TABLE "achievements" (
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_user_id_code_pk" PRIMARY KEY("user_id","code")
);
--> statement-breakpoint
CREATE TABLE "calibrations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_stats" (
	"user_id" text PRIMARY KEY NOT NULL,
	"matches" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"balls_faced" integer DEFAULT 0 NOT NULL,
	"highest" integer DEFAULT 0 NOT NULL,
	"fours" integer DEFAULT 0 NOT NULL,
	"sixes" integer DEFAULT 0 NOT NULL,
	"outs" integer DEFAULT 0 NOT NULL,
	"wickets" integer DEFAULT 0 NOT NULL,
	"runs_conceded" integer DEFAULT 0 NOT NULL,
	"balls_bowled" integer DEFAULT 0 NOT NULL,
	"best_wkts" integer DEFAULT 0 NOT NULL,
	"best_runs" integer DEFAULT 0 NOT NULL,
	"fastest_kmh" real DEFAULT 0 NOT NULL,
	"perfect_shots" integer DEFAULT 0 NOT NULL,
	"lords_runs" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "innings_balls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"innings" smallint NOT NULL,
	"seq" smallint NOT NULL,
	"by_player" boolean NOT NULL,
	"batter" text NOT NULL,
	"bowler" text NOT NULL,
	"runs" smallint NOT NULL,
	"extra" text,
	"wicket" text,
	"shot" text,
	"timing" text,
	"power" real,
	"speed_kmh" real
);
--> statement-breakpoint
CREATE TABLE "leaderboards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"board" text NOT NULL,
	"value" real NOT NULL,
	"ground" text NOT NULL,
	"team" text NOT NULL,
	"match_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"home" text NOT NULL,
	"away" text NOT NULL,
	"ground" text NOT NULL,
	"time_of_day" text NOT NULL,
	"mode" text NOT NULL,
	"difficulty" text NOT NULL,
	"result" text NOT NULL,
	"margin" text NOT NULL,
	"home_runs" smallint NOT NULL,
	"home_wickets" smallint NOT NULL,
	"away_runs" smallint NOT NULL,
	"away_wickets" smallint NOT NULL,
	"scorecard" jsonb NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"favourite_team" text,
	"batting_hand" text DEFAULT 'R' NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"graphics_quality" text DEFAULT 'high' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "innings_balls" ADD CONSTRAINT "innings_balls_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboards" ADD CONSTRAINT "leaderboards_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balls_match_idx" ON "innings_balls" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "leaderboards_board_idx" ON "leaderboards" USING btree ("board","value" desc);--> statement-breakpoint
CREATE INDEX "leaderboards_created_idx" ON "leaderboards" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "matches_user_idx" ON "matches" USING btree ("user_id","played_at");