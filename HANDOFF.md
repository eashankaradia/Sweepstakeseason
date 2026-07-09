# Sweepstake Season - AI Handoff Document

> For the AI picking this up: read this document before touching anything. Update "Current state" and "Completed work log" after meaningful work, then commit and push `HANDOFF.md` alongside the code changes.

## What This Is

A mobile-first Next.js web app for running a football sweepstake league.

The intended game is:

- 12 players.
- Each player gets exactly 5 teams.
- Teams are drawn from Premier League, La Liga, and Serie A clubs.
- Scoring is simple match scoring: 3 points for a win, 1 point for a draw, 0 for a loss.
- Fixtures should include all Premier League, La Liga, Serie A, Champions League, Europa League, and Europa Conference League matches involving selected teams.
- If the fixture API can handle the volume and coverage, add domestic cup fixtures too.

The app is a progressive web app, dark themed and mobile optimised, deployed through Vercel with Supabase as the backend.

## Repository

- GitHub: `eashankaradia/Sweepstakeseason`
- Working branch: `main`
- Default branch: `main`
- Development should happen on `main` unless the user explicitly asks for a separate branch.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16, App Router, `src/` dir, TypeScript |
| Styling | Tailwind CSS v4 |
| Auth + DB | Supabase, `@supabase/ssr` v0.12 |
| Hosting | Vercel |
| Runtime | React 19 |
| Utilities | `clsx`, `tailwind-merge`, `date-fns`, `lucide-react` |

## Key Paths

```text
src/app/(app)/dashboard/page.tsx              Home screen
src/app/(app)/standings/page.tsx              League table
src/app/(app)/my-teams/page.tsx               Teams assigned to the logged-in player
src/app/(app)/teams/page.tsx                  All teams by competition
src/app/(app)/fixtures/page.tsx               Fixture list and result entry
src/app/(app)/draft/page.tsx                  Draft room
src/app/(app)/settings/league/page.tsx        Create/edit league and default competitions
src/app/(app)/settings/scoring/page.tsx       Scoring rules
src/components/ui/TeamCrest.tsx               Club logo with initials fallback
src/lib/data.ts                               Server-side data fetching
src/lib/draft.ts                              Draft algorithm
src/lib/scoring.ts                            Match scoring logic
src/lib/supabase/types.ts                     Database TypeScript types
src/middleware.ts                             Auth middleware
```

## Supabase

- Project ID: `anbiwffpmgxlbrycckxq`
- Project URL: `https://anbiwffpmgxlbrycckxq.supabase.co`
- The public anon key and URL are currently hardcoded in the Supabase client/server/middleware files for simplicity.
- `.env.local` is gitignored.

Core tables:

| Table | Purpose |
|---|---|
| `sweepstake_leagues` | League metadata |
| `players` | League players |
| `competitions` | Enabled competitions |
| `teams` | Global team registry |
| `team_competitions` | Teams included in each competition for a league |
| `player_team_assignments` | Drafted player/team ownership |
| `draft_runs` | Draft history |
| `fixtures` | Match fixtures and results |
| `scoring_rules` | Win/draw/loss point rules |
| `player_scores` | Aggregated player points |
| `team_scores` | Aggregated team points |
| `profiles` | Supabase auth user profiles |
| `league_memberships` | User-to-league memberships |

## Current Game Requirements

Use this as the source of truth over older branch notes:

- Domestic leagues in scope: Premier League, La Liga, Serie A.
- Bundesliga should not be part of the default sweepstake.
- European competitions in scope: Champions League, Europa League, Conference League.
- Domestic cups are optional and should be added only if the selected API can support them reliably.
- Draft target is exactly 5 teams per player. With 12 players, the ideal draft pool is 60 unique teams.
- Scoring should stay simple: win = 3, draw = 1, loss = 0. Bonus rules are disabled by default.

## Fixture API Coverage

football-data.org is too limited on the free tier. As of 2026-07-09:

- Free tier includes Premier League, La Liga, Serie A, and Champions League.
- Free tier does not list Europa League, Conference League, FA Cup, EFL Cup, Copa del Rey, or Coppa Italia.
- The API lookup table has codes for the extra competitions: `EL` Europa League, `UCL` UEFA Conference League, `FAC` FA Cup, `FLC` Football League Cup, `CDR` Copa del Rey, and `CIT` Coppa Italia.
- Treat those extra competitions as paid/needs-token-verification before building an importer around them.
- No football-data.org token is currently configured in `.env`; only Supabase public env vars are present.

ESPN public endpoints are the current best free/no-signup route. They are unofficial, but no key is required and the pseudo-r/Public-ESPN-API repo documents the soccer slugs:

| Competition | ESPN slug |
|---|---|
| Premier League | `eng.1` |
| La Liga | `esp.1` |
| Serie A | `ita.1` |
| Champions League | `uefa.champions` |
| Europa League | `uefa.europa` |
| Conference League | `uefa.europa.conf` |
| FA Cup | `eng.fa` |
| EFL Cup / Carabao Cup | `eng.league_cup` |
| Copa del Rey | `esp.copa_del_rey` |
| Coppa Italia | `ita.coppa_italia` |

Useful endpoint:

```text
https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard?dates=YYYYMMDD-YYYYMMDD&limit=100
```

Probe result on 2026-07-09:

- 2026/27 Premier League, La Liga, Serie A, EFL Cup, and Coppa Italia returned fixtures.
- 2026/27 Champions League, Europa League, Conference League, FA Cup, and Copa del Rey returned zero events, likely because their schedules were not published yet.
- 2025/26 Champions League, Europa League, Conference League, FA Cup, and Copa del Rey all returned 100 events for the season window, confirming ESPN has usable historical/full-season data for those competitions once scheduled.
- Build the importer as a cached Supabase sync, with date windows and periodic retries for competitions whose future schedules are not published yet.

## Auth / Users

- Login URL: `/auth/login`
- Email format: `{username}@sweepstakeseason.app`
- Existing DEGENERATES users use password `degen`
- Users: `eashan`, `vishal`, `tarnraj`, `dillan`, `shivam`, `adam`, `haider`, `samir`, `nikhil`, `gavin`, `kullu`, `matthew`
- After login, the `ss_league` cookie points at the active league.

Known auth gotcha: users created by raw SQL need these token fields to be empty strings, not NULL: `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`, `phone_change_token`.

## Current State

- Local `main` has been fast-forwarded to include the previous Claude feature branch work.
- `HANDOFF.md` now lives on `main`.
- New league creation defaults to Premier League, La Liga, Serie A, Champions League, Europa League, and Conference League.
- Draft generation now targets exactly 5 teams per player.
- `src/lib/scoring.ts` already implements 3 points for a win, 1 for a draw, and 0 for a loss.
- `src/app/(app)/my-teams/page.tsx` is a client-side player/team performance view with filter chips by player.
- `src/app/(app)/standings/page.tsx` is a compact table-style standings screen.
- `src/app/(app)/fixtures/page.tsx` has admin-only manual add/result controls plus an admin-only ESPN Sync button.
- `src/app/(app)/draft/page.tsx` is view-only for normal players; only admin users can generate, save, lock, unlock, or change the draft pool.
- Admin detection currently allows `profiles.is_admin = true` and the known Eashan emails in `src/lib/admin.ts`; Eashan's two existing profile rows have also been updated to `is_admin = true`.
- Missing crest URLs for Como and SV Elversberg were written to Supabase and also added as component fallbacks in `TeamCrest`.
- ESPN fixture seed inserted 865 fixtures on 2026-07-09 for the current league. UEFA/FA Cup/Copa del Rey returned zero 2026/27 events at that moment because ESPN had not published those future schedules yet.
- Existing Supabase data may still include Bundesliga from prior setup; remove or disable it in the database before the final draft if needed.

## Things Not Yet Done

1. Fixture import: ESPN manual sync exists, but there is no scheduled/cron sync yet.
2. Scoring engine: no cron job, webhook, or scheduled job updates scores from live results yet.
3. Vercel deployment: app needs deployment from `main`.
4. Domestic cups: competition rows exist; rerun ESPN sync once FA Cup/Copa del Rey schedules are published.
5. Existing database cleanup: Bundesliga has been disabled in Supabase, but old team rows/team_competitions still exist and can be removed later if desired.
6. Run and lock the draft after the final competition/team pool is confirmed.
7. Onboarding should be checked end to end for new signups.
8. ESPN importer should eventually recalculate scores automatically when completed fixtures are synced, instead of relying on manual result entry.

## Git Workflow Reminder

```bash
git status
git log --oneline -5
git add <specific files>
git status
git commit -m "..."
git push origin main
```

Never force-push without explicit user permission.

## Environment Proxy Note

Some Codex/agent environments route outbound HTTPS through a proxy, and external football APIs may return 403 from the agent environment. This does not necessarily affect the deployed Vercel app. Prefer testing third-party football API access from the browser or deployed runtime.

## Completed Work Log

| Date | What was done |
|---|---|
| Session 1 | Set up Next.js 16, Supabase schema, core DB tables, seed data, and UI screens |
| Session 1 | Built auth, login, signup, middleware, onboarding, and DEGENERATES users |
| Session 2 | Fixed Supabase auth token NULL issue |
| Session 2 | Added `logo_url` to teams and updated `TeamCrest` fallback behavior |
| Session 2 | Added `.gitignore` and previous feature-branch handoff |
| 2026-07-09 | Fast-forwarded `main` to include the previous feature branch work |
| 2026-07-09 | Updated handoff and defaults to match the requested PL/La Liga/Serie A sweepstake |
| 2026-07-09 | Changed draft page to target exactly 5 teams per player |
| 2026-07-09 | Checked football-data.org free coverage and documented cup/Europa/Conference limitations |
| 2026-07-09 | Reworked My Teams into a player-filterable team performance view |
| 2026-07-09 | Made Standings more compact with a table-style mobile layout |
| 2026-07-09 | Tested ESPN public soccer endpoints as a no-key fixture source for league, UEFA, and cup slugs |
| 2026-07-09 | Added admin-only ESPN fixture sync endpoint and Fixtures page controls |
| 2026-07-09 | Seeded 865 ESPN fixtures into Supabase for the active league |
| 2026-07-09 | Filled Como and SV Elversberg crest gaps in Supabase and TeamCrest fallback mapping |
| 2026-07-09 | Made Draft Room controls admin-only while keeping the draw visible to players |
