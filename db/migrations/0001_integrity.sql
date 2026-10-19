DROP INDEX "balls_match_idx";--> statement-breakpoint
ALTER TABLE "career_stats" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "balls_match_seq_idx" ON "innings_balls" USING btree ("match_id","innings","seq");--> statement-breakpoint
CREATE INDEX "leaderboards_player_idx" ON "leaderboards" USING btree ("board","user_id","value" desc);--> statement-breakpoint
ALTER TABLE "calibrations" ADD CONSTRAINT "calibrations_is_object" CHECK (jsonb_typeof("calibrations"."data") = 'object');--> statement-breakpoint
ALTER TABLE "career_stats" ADD CONSTRAINT "career_non_negative" CHECK (least("career_stats"."matches", "career_stats"."wins", "career_stats"."losses", "career_stats"."ties", "career_stats"."runs", "career_stats"."balls_faced", "career_stats"."highest", "career_stats"."fours", "career_stats"."sixes", "career_stats"."outs", "career_stats"."wickets", "career_stats"."runs_conceded", "career_stats"."balls_bowled", "career_stats"."best_wkts", "career_stats"."best_runs", "career_stats"."perfect_shots", "career_stats"."lords_runs") >= 0 and "career_stats"."fastest_kmh" >= 0);--> statement-breakpoint
ALTER TABLE "career_stats" ADD CONSTRAINT "career_results" CHECK ("career_stats"."wins" + "career_stats"."losses" + "career_stats"."ties" = "career_stats"."matches");--> statement-breakpoint
ALTER TABLE "innings_balls" ADD CONSTRAINT "balls_innings" CHECK ("innings_balls"."innings" in (1, 2));--> statement-breakpoint
ALTER TABLE "innings_balls" ADD CONSTRAINT "balls_seq" CHECK ("innings_balls"."seq" >= 0);--> statement-breakpoint
ALTER TABLE "innings_balls" ADD CONSTRAINT "balls_runs" CHECK ("innings_balls"."runs" between 0 and 6);--> statement-breakpoint
ALTER TABLE "innings_balls" ADD CONSTRAINT "balls_power" CHECK ("innings_balls"."power" is null or "innings_balls"."power" between 0 and 1);--> statement-breakpoint
ALTER TABLE "innings_balls" ADD CONSTRAINT "balls_speed" CHECK ("innings_balls"."speed_kmh" is null or "innings_balls"."speed_kmh" between 0 and 200);--> statement-breakpoint
ALTER TABLE "leaderboards" ADD CONSTRAINT "leaderboards_board" CHECK ("leaderboards"."board" in ('top_score', 'most_sixes', 'fastest_ball'));--> statement-breakpoint
ALTER TABLE "leaderboards" ADD CONSTRAINT "leaderboards_value" CHECK ("leaderboards"."value" >= 0);--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_time" CHECK ("matches"."time_of_day" in ('day', 'night'));--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_mode" CHECK ("matches"."mode" in ('full', 'chase', 'defend'));--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_difficulty" CHECK ("matches"."difficulty" in ('easy', 'medium', 'hard'));--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_result" CHECK ("matches"."result" in ('won', 'lost', 'tied'));--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_teams" CHECK ("matches"."home" <> "matches"."away");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_score" CHECK ("matches"."home_runs" >= 0 and "matches"."away_runs" >= 0 and "matches"."home_wickets" between 0 and 10 and "matches"."away_wickets" between 0 and 10);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_name_len" CHECK (char_length("profiles"."display_name") between 1 and 30);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_team_len" CHECK ("profiles"."favourite_team" is null or char_length("profiles"."favourite_team") <= 10);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_hand" CHECK ("profiles"."batting_hand" in ('R', 'L'));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_difficulty" CHECK ("profiles"."difficulty" in ('easy', 'medium', 'hard'));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_quality" CHECK ("profiles"."graphics_quality" in ('low', 'medium', 'high'));