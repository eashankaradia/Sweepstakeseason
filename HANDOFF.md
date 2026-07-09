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
- Existing Supabase data may still include Bundesliga from prior setup; remove or disable it in the database before the final draft if needed.

## Things Not Yet Done

1. Fixture import: no robust fixture importer/API integration is wired up yet.
2. Scoring engine: no cron job, webhook, or scheduled job updates scores from live results yet.
3. Vercel deployment: app needs deployment from `main`.
4. Domestic cups: evaluate API support before adding FA Cup, EFL Cup, Copa del Rey, and Coppa Italia fixtures.
5. Existing database cleanup: remove/disable Bundesliga for the DEGENERATES league if it is still enabled.
6. Run and lock the draft after the final competition/team pool is confirmed.
7. Onboarding should be checked end to end for new signups.

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
