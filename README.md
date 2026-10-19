# Ahmad's Cricket Arena

Webcam-controlled 3D cricket in the browser. Swing your real arms to bat, move your head to lean in first-person view, or play with keyboard and mouse. Built with Vite, TypeScript, Three.js and MediaPipe, with Neon (Postgres + Neon Auth) for accounts. See [plan.md](plan.md) for the full design.

## Run it

```bash
npm install
npm run dev        # game + local API at http://localhost:5173
npm test           # scoring, anti-cheat validation and DRS rules
npm run build      # type-check and production build into dist/
```

The game works with no setup at all as a **guest**: matches, stats and badges are saved on the device.

## Accounts and online saving (Neon)

1. **Secrets** go in `env/.env` (never shared; see `env/example.env`):
   ```
   DATABASE_URL=postgresql://...
   NEON_AUTH_BASE_URL=https://...neonauth.../neondb/auth
   VITE_NEON_AUTH_URL=https://...neonauth.../neondb/auth
   ```
   Each line must be `NAME=value`. Only `VITE_*` values ever reach the browser.
2. **Tables**: `npm run db:migrate` creates them from `db/schema.ts` (already applied to the current database). After changing the schema, run `npm run db:generate` then `npm run db:migrate`.
3. **Sign-in**: in the Neon console, open the project > **Auth**, enable it, and turn on **Email & password** and **Google**. Add your site's address (and `http://localhost:5173` for development) to the allowed domains. Copy the Auth URL into both auth variables above.

What is stored: profile and settings, calibration numbers, matches with ball-by-ball records, career stats, leaderboard entries and badges. **No webcam images or video are ever uploaded or saved.** Players can delete their account and all data from the Profile page.

Security: every account request is checked against a Neon Auth JWT on the server, so a player only reaches their own rows. Saved matches are re-scored on the server from the ball-by-ball record (`src/game/record.ts`), so impossible scores are rejected.

## Deploy (Vercel)

1. Install the CLI (`npm i -g vercel`) and run `vercel` in this folder, or import the folder in the Vercel dashboard.
2. Add the three environment variables above in **Project > Settings > Environment Variables**.
3. Add the deployed address to Neon Auth's allowed domains.
4. `vercel --prod`.

The site is static (`dist/`) plus the functions in `api/` (`profile`, `matches`, `leaderboard`). HTTPS, which the webcam needs, comes with Vercel.

## Controls

- **Webcam**: swing like a real bat. Timing decides the shot, swing speed sets power, direction picks the side, and an upward swing lofts it. Move your head to lean and duck in POV.
- **Keyboard**: mouse aims, `Space` swings, hold `Shift` to loft, `S` blocks. Bowling: mouse places the target, `1`–`4` pick a variation, `Space` bowls.
- `C` POV/TV camera · `Tab` scorecard · `P` pause · `R` review a decision (DRS) · `Space` skip a replay.

## Project layout

```
api/            Vercel functions (+ _lib: auth check, database, HTTP helpers)
db/             Drizzle schema and SQL migrations
src/data        teams (36 squads with ratings and kits), grounds
src/game        match engine, physics, AI, DRS, replays, saved-match validation
src/scene       renderer, stadiums, players, Hawk-Eye graphic
src/input       webcam pose tracking, calibration, keyboard
src/services    auth, API client, guest/account progress, settings
src/ui          HUD, menus, scorecard, account pages, DRS panel
tests/          unit tests (vitest)
```

Real team, player and stadium names are for private, educational use only.
