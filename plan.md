# Ahmad's Cricket Arena — Project Plan

**Project:** Ahmad's Cricket Arena: a hands-on webcam cricket game in 3D
**Author:** Ahmad
**Type:** Browser-based 3D sports game (no install, no VR headset, no joystick)
**Date:** October 2026

---

## 1. Project idea

VR cricket games such as *iB Cricket* and *Cricket Club VR* let players swing a real bat, but they need a VR headset and controllers. **Ahmad's Cricket Arena** brings that experience to an ordinary laptop or PC with a **webcam only**:

- You **swing your real arms** in front of the webcam to play shots.
- You **make a real bowling action** to bowl.
- **POV mode** puts the camera at the batter's eyes, and your real head movement moves the in-game view.
- A small **picture-in-picture (PiP) window** shows your live camera feed, your tracked skeleton and a **swing-power meter**.
- Matches are **2 overs per side**, played at detailed recreations of **Lord's (London)** and the **Melbourne Cricket Ground (MCG)**.
- **International and league teams** (IPL, PSL, BBL) with real squads, for private and educational use.
- **Player accounts:** sign in with **Google** or **email**. Your profile, match history, career stats and leaderboard rank are saved in a **Neon** cloud database.

### Has it been done before?
Only partly. VR cricket exists but needs expensive hardware. Webcam hand-tracking exists as small tech demos. No widely known game combines webcam full-arm batting and bowling, head-tracked first-person POV, a live power meter, real stadium recreations and full team rosters in a browser. That combination is what makes this project new.

---

## 2. Goals

1. **Realism first:** graphics, ball physics, stadiums and broadcast presentation as close to real cricket as a browser allows.
2. **Natural controls:** no buttons during play. Your body is the controller.
3. **Mandatory POV mode:** first-person batting and bowling with head tracking.
4. **Complete short match:** toss, 2 overs per innings, chase, result and scorecard.
5. **Runs on a normal laptop:** a quality setting (Low / Medium / Ultra) keeps the game playable on weaker hardware.
6. **Save progress online:** Google or email sign-in, with stats and leaderboards stored in a Neon database. A guest mode lets anyone play without an account.

---

## 3. Technology

| Part | Technology | Why |
|---|---|---|
| Build tool | **Vite + TypeScript** | Fast development and type-safe code |
| 3D graphics | **Three.js** (WebGL2) | Industry-standard browser 3D, supports realistic (PBR) materials |
| Body tracking | **Google MediaPipe Pose Landmarker** | Tracks 33 body points (wrists, elbows, shoulders, head) from the webcam, on the device |
| Physics | Custom ball physics + **cannon-es** for collisions | Cricket-specific swing, seam and spin need custom code |
| Audio | **Howler.js** | Spatial sound: bat crack, crowd, stump hit, commentary clips |
| Characters | **GLTF models + Mixamo animations** | Realistic player bodies and motion (batting, bowling, fielding, celebrations) |
| Textures / sky | **Poly Haven** (free, CC0) HDRIs and PBR textures | Photographic grass, sky lighting and soil |
| Database | **Neon** (serverless PostgreSQL) | Free tier, scales automatically, standard SQL |
| Sign-in | **Neon Auth** with **Google** and **email/password** providers | Built into Neon, so user accounts live in the same database as game data |
| Backend API | **Serverless functions** (Vercel) + **Drizzle ORM** | Small, secure API between the game and the database. The database password never reaches the browser |
| Hosting | **Vercel** | Free hosting for the game and its API, with HTTPS (needed for webcam access) |

The game itself (3D graphics, physics and body tracking) runs entirely in the browser. The server is only used for accounts and saving data. **The webcam video never leaves the computer and is never stored.**

---

## 4. Game modes

### 4.1 POV mode (mandatory feature)
- **Batting POV:** the camera sits at the batter's eye height at the crease. You see the bowler run in from 22 yards away, exactly as a real batter would.
- **Head tracking:** MediaPipe tracks your nose and eye points. Leaning, ducking or moving your head moves the in-game camera, so you can duck a bouncer or lean into a drive. This gives a VR-like feeling without a headset.
- **First-person bat and gloves:** a 3D bat and gloves follow your real wrist positions on screen.
- **Bowling POV:** the camera runs up with you, shows your hand and the ball at release, and then follows the delivery down the pitch.
- Toggle any time between **POV** and **Broadcast** (TV-style) views. POV is the default.

### 4.2 Broadcast view
TV-style cameras: behind the bowler, side-on, aerial, boundary and slow-motion replay, as in a real TV broadcast.

### 4.3 Match setup
Sign in (Google / email) or Play as Guest → Team select → Ground select (Lord's / MCG, Day / Day-Night) → **Toss** (call heads or tails) → Innings 1 (2 overs) → Innings 2 (chase) → Result, Player of the Match and full scorecard.

---

## 5. Controls (webcam body tracking)

### 5.1 Calibration (start of every match)
The player stands side-on, 2–3 m from the webcam. The game records arm length, shoulder height, rest position and **left- or right-handedness**.

### 5.2 Batting
| Movement | In-game result |
|---|---|
| Fast downward-forward swing | Straight / cover drive |
| Horizontal swing across the body | Pull / cut |
| Low swing, body bent | Sweep |
| Swing finishing high | Lofted shot (six attempt) |
| Slow, short movement | Defensive block |
| No swing | Leave the ball |
| Head movement | Duck / sway (POV mode) |

- **Power** = swing speed × timing quality, shown live on the PiP power meter.
- **Timing** = when your peak swing speed happens compared with the ball's arrival. Early pushes the ball to leg side, late to off side, and badly mistimed means an edge or a miss. An Early / Perfect / Late label appears after every ball.

### 5.3 Bowling
- A real overarm action. Arm speed at release gives **pace**, and release height and angle give **length** (yorker, full, good, short, bouncer).
- Before the run-up, the bowler picks **Fast / Swing / Off-spin / Leg-spin** with a hand gesture or a quick menu.
- Releasing a bowling action bent too far makes a **no-ball**. A line too wide makes a **wide**.

### 5.4 Fallback
Keyboard and mouse controls, so the game can still be tested without a webcam.

---

## 6. Realism details

### 6.1 Stadiums
**Lord's, London**
- The famous **2.5 m slope** across the ground, which affects ball roll.
- The Victorian **Pavilion** with its Long Room windows, the futuristic **Media Centre**, the Grand Stand and the Mound Stand.
- The Father Time weather vane and the honours-board feel. English summer daylight.

**MCG, Melbourne**
- A huge **100,000-seat enclosed bowl** with multi-tier stands.
- Tall **floodlight towers** for day-night matches, and the big screen showing replays.
- Bright Australian sunlight and long evening shadows.

Both grounds start as detailed models built in code. A single loader lets higher-quality 3D models replace them later without changing game code.

### 6.2 Graphics
- **Physically based materials** with HDR sky lighting, soft real-time shadows, ACES film tone mapping, bloom, ambient occlusion and anti-aliasing.
- **Grass shader** with mowing stripes, individual blades near the camera and wind movement.
- **Pitch** with cracks, footmarks and roughness that **wear during the match** and affect spin.
- **Ball** with a visible seam that rotates in flight and gets scuffed as it gets older.
- **Crowd** of thousands of animated spectators (instanced), who cheer on boundaries and wickets, wave flags and hold up 4/6 cards.
- **Day/night lighting** with floodlights, dynamic shadows and an optional cloudy or overcast mode (which also adds swing).

### 6.3 Physics
- Gravity, **air drag**, **Magnus effect** (spin curving the ball), **conventional and reverse swing**, **seam movement** off the pitch, **turn and bounce** for spinners.
- **Bat–ball collision** based on contact point (middle of the bat, edge, toe) and swing speed.
- Ball rolls, slows on grass and responds to the **Lord's slope**.
- Bouncing stumps and flying bails when bowled.

### 6.4 Players and fielding
- Realistic player models in **team kits and colours**, with helmets, pads and gloves.
- Motion-captured animations for the bowler's run-up, fielders' dives, catches, throws and wicketkeeper takes.
- **Smart field placements** that change for pace, spin and match situation.
- Run-outs, direct hits, boundary catches and relay throws.

### 6.5 Broadcast presentation
- TV-style **scoreboard**: score, overs, run rate, required rate and ball-by-ball strip.
- **Ball-tracking (Hawk-Eye style)** for LBW reviews, plus a **snickometer** for edges, using one **DRS review** per innings.
- **Umpire** signals: four, six, out, wide, no-ball.
- **Slow-motion replays** of boundaries and wickets from several angles.
- **Speed gun** showing the delivery speed in km/h.
- **Audio:** bat crack, ball hitting pads, stumps rattling, crowd roar and pre-recorded commentary lines.

---

## 7. Teams

- **International:** Pakistan, India, Australia, England, New Zealand, South Africa, Sri Lanka, Bangladesh, Afghanistan, West Indies, Ireland, Zimbabwe.
- **Leagues:** PSL (6 teams), IPL (10 teams), BBL (8 teams).
- Each team has a squad of 11+ players with **batting and bowling ratings**, bowling type and handedness, which drive the computer-controlled players.
- Team data lives in one editable file, so squads can be updated easily.

> **Note:** real player names, team names and stadium names are used for **private and educational use only**. A public release would need generic names or official licences.

---

## 8. Computer opponent (AI)

- **AI bowler:** plans deliveries by bowler type and rating. It mixes yorkers, bouncers and slower balls, and it bowls tighter as the batter scores.
- **AI batter:** chooses shots from delivery quality, its own skill and the required run rate (aggressive when chasing a big target).
- **Difficulty levels:** Easy / Medium / Hard (ball speed, AI skill, timing window).

---

## 9. Accounts and database (Neon)

### 9.1 Sign-in options
- **Continue with Google:** one click, using the player's Google account (OAuth).
- **Email and password:** sign up with an email address, verify it with a code, and reset a forgotten password by email.
- **Play as Guest:** no account needed. Progress is kept only on that device and can be moved to an account later by signing in.

Sign-in is handled by **Neon Auth**, so passwords are never stored or handled by the game's own code.

### 9.2 What is saved
| Table | Contents |
|---|---|
| `users` | Created by Neon Auth: name, email, profile picture, sign-in method |
| `profiles` | Display name, favourite team, batting hand, difficulty, graphics quality |
| `calibrations` | Saved body measurements (arm length, shoulder height), so calibration is faster next time. Numbers only, never images |
| `matches` | Teams, ground, toss, both innings scores, result and date |
| `innings_balls` | Ball-by-ball record: runs, shot type, timing, power, delivery speed, wicket type |
| `career_stats` | Totals: matches, runs, highest score, strike rate, wickets, best bowling, sixes, fours |
| `leaderboards` | Top scores, fastest deliveries, most sixes: all-time and weekly |
| `achievements` | Badges such as First Six, Hat-trick, Perfect Timing ×10, Lord's Century |

### 9.3 New features this enables
- **Profile page** with career stats and charts of recent form.
- **Global leaderboards**, filterable by ground and team.
- **Match history** with full scorecards for every past match.
- **Settings sync:** sign in on another computer and your settings and calibration come with you.

### 9.4 Security and privacy
- Each player can only read and change **their own** data. This is checked on the server for every request.
- Leaderboard scores are checked on the server (for example, a 2-over innings cannot exceed what 12 legal balls allow), so fake scores are rejected.
- Database passwords and secret keys are stored as server environment variables, never in browser code.
- **No webcam images or video are ever uploaded or saved.** Only game numbers are stored.
- Body tracking runs on the player's own device. Note: Google's MediaPipe library sends anonymous usage metrics (not images or video) to Google, so players are told this before the camera starts.
- Players can delete their account and all their data from the profile page.

---

## 10. Project structure

```
new web/
  plan.md                      this document
  index.html
  package.json, vite.config.ts, tsconfig.json
  .env                         Neon connection string and auth keys (never shared)
  api/                         serverless functions: profile, matches, stats, leaderboard
  db/          schema.ts (Drizzle tables), migrations/
  public/
    hdr/  textures/  models/  audio/
  src/
    main.ts                    app start and screen flow
    data/      teams.ts, grounds.ts
    scene/     renderer.ts, pitch.ts, crowd.ts, players.ts, cameras.ts
               stadium/lords.ts, stadium/mcg.ts
    pov/       povCamera.ts (head tracking), firstPersonBat.ts, bowlingPov.ts
    input/     pose.ts, calibration.ts, batGesture.ts, bowlGesture.ts, keyboardFallback.ts
    game/      match.ts, ball.ts, physics.ts, scoring.ts, fielding.ts, drs.ts
               ai/aiBowler.ts, ai/aiBatter.ts
    ui/        menus.ts, hud.ts, pip.ts (camera + power meter), scorecard.ts, replay.ts
               signIn.ts, profile.ts, leaderboard.ts
    services/  auth.ts (Neon Auth client), api.ts (calls to the backend)
    audio/     sounds.ts
```

---

## 11. Development phases

| Phase | Work | Result |
|---|---|---|
| 1 | Project setup, 3D pitch, stumps, ball physics, keyboard batting | A ball can be bowled and hit |
| 2 | Webcam tracking, calibration, swing detection, PiP and power meter | Batting with real arm swings |
| 3 | **POV mode:** head-tracked camera, first-person bat, bowling POV | VR-like first-person play |
| 4 | Lord's and MCG stadiums, crowd, lighting, grass and pitch shaders | Realistic grounds |
| 5 | Match engine: toss, scoring, wickets, extras, AI bowler, 2-over innings | A full innings is playable |
| 6 | Webcam bowling, AI batter, fielding | A full 2-innings match |
| 7 | Teams and squads, kits, menus, scorecard | Complete game flow |
| 8 | **Neon database and sign-in:** Google and email accounts, guest mode, saving matches, stats, leaderboards, profile page | Online accounts and progress |
| 9 | Broadcast features: replays, Hawk-Eye/DRS, snickometer, speed gun, audio | TV-style presentation |
| 10 | Player models and animations, visual polish, performance tuning, quality settings, deploy to Vercel | Final realistic version, live online |

---

## 12. Testing

- **Run:** `npm install` then `npm run dev`. Open it in Chrome and allow webcam access.
- **Controls:** check that slow vs fast and early vs late swings produce the correct shot, power and timing label. Check that head movement moves the POV camera smoothly without shaking.
- **Match rules:** play full matches on both grounds. Check runs, fours, sixes, wides, no-balls, and bowled, caught, LBW (with DRS) and run-out dismissals, plus the correct chase result.
- **Performance:** aim for **60 fps on Medium** on a normal laptop, and check it with the built-in FPS counter.
- **Fallback:** a complete match must be playable with keyboard only.
- **Accounts:** sign up and sign in with Google and with email. Check email verification, password reset and sign-out. Check that guest progress moves to the account on sign-in.
- **Database:** finish a match, then confirm it appears in match history, career stats and the leaderboard. Check that one player cannot see or change another player's data, and that an impossible score is rejected.

---

## 13. Limitations and risks

| Risk | How it is handled |
|---|---|
| Browser graphics can't fully match console games like *Cricket 24* | Use HDR lighting, PBR textures and detailed shaders, with model upgrades later |
| Webcam tracking struggles in poor light | Calibration screen warns about lighting and distance. Tracking is smoothed |
| Webcam delay (latency) affects timing | Predictive tracking plus a slightly wider timing window on Easy |
| Weak laptops | Low / Medium / Ultra quality settings |
| Real names and logos (copyright) | Private and educational use only |
| No internet connection | Guest mode works offline. Results are uploaded once the connection returns |
| Account security and privacy | Sign-in handled by Neon Auth, server-side ownership checks, no video stored, account deletion available |
| Fake leaderboard scores | Server checks every submitted score against cricket rules |

---

## 14. Outcome

A complete, realistic browser cricket game, **Ahmad's Cricket Arena**, where the player bats and bowls with real body movements in front of a webcam. It features a mandatory first-person POV mode with head tracking, a live camera and power-meter PiP, 2-over matches at Lord's and the MCG, and full international and league team rosters. Players sign in with Google or email, and their matches, career stats and leaderboard ranks are saved in a Neon cloud database.
