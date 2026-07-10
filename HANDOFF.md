# Sweepstake Season — AI Handoff Document

> **For the AI picking this up:** Read this entire document before touching anything. Update the "Current state" and "Completed" sections at the bottom after every task you finish, then commit and push the updated HANDOFF.md alongside your changes. Do the same thing — keep it current so the next agent doesn't have to re-derive anything.

---

## What this is

A mobile-first Next.js web app for running a football sweepstake league. 12 friends (the DEGENERATES) each get randomly assigned teams from across the Premier League, La Liga, Bundesliga, Serie A, Champions League, Europa League, and Conference League. Points accumulate based on match results.

The app is a progressive web app (dark-themed, mobile-optimised) deployed on Vercel, with Supabase as the backend.

---

## Repository

- **GitHub:** `eashankaradia/sweepstakeseason`
- **Working branch:** `claude/football-sweepstake-2026-azl5ph`
- **Default branch:** `main`
- Always develop on `claude/football-sweepstake-2026-azl5ph` and push there. Never push to `main` directly.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, `src/` dir, TypeScript) |
| Styling | Tailwind CSS v4 |
| Auth + DB | Supabase (`@supabase/ssr` v0.12) |
| Hosting | Vercel |
| Runtime | React 19 |
| Utilities | `clsx`, `tailwind-merge`, `date-fns`, `lucide-react` |

### Key file paths

```
src/
  app/
    (app)/              ← All authenticated screens (route group, has layout.tsx)
      dashboard/        ← Home screen
      standings/        ← League table
      my-teams/         ← Teams assigned to the logged-in player
      teams/            ← All teams by competition
      fixtures/         ← Fixture list + results entry
      draft/            ← Draft room (generate, save, lock)
      settings/         ← Settings hub
        league/         ← Create/edit league
        players/        ← Add/edit players
        competitions/   ← Enable/disable competitions
        teams/          ← Assign teams to competitions
        scoring/        ← Scoring rules
    auth/
      login/page.tsx    ← Username + password login
      signup/page.tsx   ← New account creation
      callback/route.ts ← Supabase auth callback
    onboarding/         ← First-time flow (create/join league)
    page.tsx            ← Landing page (redirects to /dashboard if authed)
  components/
    layout/
      AppShell.tsx      ← Page wrapper with TopBar + BottomNav
      TopBar.tsx
      BottomNav.tsx
    ui/
      TeamCrest.tsx     ← Shows club logo image; falls back to coloured initials
      Avatar.tsx        ← Player avatar (coloured circle + initials)
      Card.tsx
      Button.tsx
      Badge.tsx
      TabBar.tsx
      LoadingSpinner.tsx
  lib/
    supabase/
      client.ts         ← Browser Supabase client (createBrowserClient)
      server.ts         ← Server Supabase client (createServerClient + cookies)
      types.ts          ← Full DB TypeScript types (keep in sync with schema)
      middleware.ts     ← (unused — middleware is at src/middleware.ts)
    data.ts             ← All server-side data fetching functions
    draft.ts            ← Draft algorithm (random with EU-team balancing)
    scoring.ts          ← Scoring logic
    cookie.ts           ← getLeagueIdCookie() helper
    utils.ts            ← cn(), formatDate(), formatDateTime()
  middleware.ts         ← Next.js middleware: enforces auth, redirects to /auth/login
```

---

## Supabase

- **Project ID:** `anbiwffpmgxlbrycckxq`
- **Project URL:** `https://anbiwffpmgxlbrycckxq.supabase.co`
- **Anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM`
- The anon key and URL are hardcoded in `client.ts`, `server.ts`, and `middleware.ts` (not read from env vars — intentional for simplicity, fine for a private app).
- **`.env.local`** also has them but is gitignored.

### Database tables (public schema)

| Table | Purpose |
|---|---|
| `sweepstake_leagues` | The sweepstake league (name, season, draft_locked, status) |
| `players` | 12 players in the league (name, color, user_id link) |
| `competitions` | Competitions enabled for a league (PL, LL, BL, SA, UCL, UEL, ECL) |
| `teams` | Global team registry (name, short_name, country, tier, colors, logo_url) |
| `team_competitions` | Which teams are in which competition for a league |
| `player_team_assignments` | Which player owns which team (after draft) |
| `draft_runs` | History of each draft run with allocation snapshot |
| `fixtures` | Match results for scoring |
| `scoring_rules` | Configurable point values (win, draw, loss, etc.) |
| `player_scores` | View/table of aggregated player points |
| `team_scores` | View/table of aggregated team points |
| `profiles` | Supabase auth user profiles |
| `league_memberships` | Which users belong to which leagues |

---

## Key IDs to know

### DEGENERATES league
```
league_id = 'a5f1bf65-ebd7-41bf-9b5a-38f33e372e5b'
```

### Competition IDs (all belong to the DEGENERATES league)
```
PL  (Premier League)      = '4be4860f-...' 
LL  (La Liga)             = 'b530decc-...'
BL  (Bundesliga)          = 'da54d966-...'
SA  (Serie A)             = '135f46f4-...'
UCL (Champions League)    = 'a6530ccb-76e1-48be-8cd0-543dec93b225'
UEL (Europa League)       = '9a6ced30-89fc-4b28-8981-fcea03eccc38'
ECL (Conference League)   = '9e46a508-4174-460c-ab43-1684f87eb466'
```
(Get full IDs from: `SELECT id, short_name FROM competitions WHERE league_id = 'a5f1bf65-...'`)

---

## Auth / Users

- Login URL: `/auth/login` — username + password
- Email format: `{username}@sweepstakeseason.app` (the login form appends the domain)
- All 12 DEGENERATES users have password: **`degen`**
- Users: `eashan` (admin), `vishal`, `tarnraj`, `dillan`, `shivam`, `adam`, `haider`, `samir`, `nikhil`, `gavin`, `kullu`, `matthew`
- After login, the `ss_league` cookie is set to `a5f1bf65-ebd7-41bf-9b5a-38f33e372e5b`
- Middleware at `src/middleware.ts` redirects unauthenticated users to `/auth/login`

### Known auth gotcha
Users were created via raw SQL INSERT. If you ever need to create more users the same way, you **must** ensure these token fields are `''` (empty string), not NULL, otherwise Supabase auth scanning errors:
```sql
confirmation_token, recovery_token, email_change_token_new, email_change, phone_change_token
```

---

## Teams & competitions — 2025/26 season data

All team and competition data reflects the **2026/27 season** (based on 2025/26 domestic league results).

### Domestic leagues (15 teams each)

**Premier League:** Arsenal, Aston Villa, Bournemouth, Brentford, Brighton & Hove Albion, Chelsea, Crystal Palace, Everton, Fulham, Liverpool, Manchester City, Manchester United, Newcastle United, Nottingham Forest, Sunderland, Tottenham Hotspur, West Ham United, Wolverhampton Wanderers
_(Sunderland promoted from Championship 2024/25)_

**La Liga:** Athletic Club, Atletico Madrid, Barcelona, Celta Vigo, Deportivo La Coruña, Getafe, Girona, Las Palmas, Málaga, Mallorca, Osasuna, Real Betis, Real Madrid, Real Sociedad, Sevilla, Valencia, Villarreal
_(Deportivo La Coruña and Málaga promoted)_

**Bundesliga:** Augsburg, Bayer Leverkusen, Bayern Munich, Borussia Dortmund, Eintracht Frankfurt, Heidenheim, Hoffenheim, Mainz, Mönchengladbach, RB Leipzig, SC Freiburg, Schalke 04, SV Elversberg, Union Berlin, VfB Stuttgart, Werder Bremen, Wolfsburg
_(Schalke 04 and SV Elversberg promoted)_

**Serie A:** AC Milan, Atalanta, Bologna, Cagliari, Como, Empoli, Fiorentina, Inter Milan, Juventus, Lazio, Lecce, Monza, Napoli, Roma, Torino, Udinese
_(Como promoted from Serie B)_

### European competitions (actual 2025/26 qualifiers)

**UCL (18 teams):**
- England (5): Arsenal, Manchester City, Manchester United, Aston Villa, Liverpool
- Spain (5): Barcelona, Real Madrid, Villarreal, Atletico Madrid, Real Betis _(performance spot)_
- Germany (4): Bayern Munich, Borussia Dortmund, RB Leipzig, VfB Stuttgart
- Italy (4): Inter Milan, Napoli, Roma, Como

**UEL (9 teams):**
- England (3): Bournemouth _(6th PL)_, Sunderland _(7th PL)_, Crystal Palace _(ECL winners → UEL)_
- Spain (2): Celta Vigo _(6th LL)_, Real Sociedad _(Copa del Rey winners)_
- Germany (2): Hoffenheim _(5th BL)_, Bayer Leverkusen _(6th BL)_
- Italy (2): AC Milan _(5th SA)_, Juventus _(6th SA)_

**ECL (4 teams):**
- Brighton & Hove Albion _(8th PL)_
- Getafe _(7th LL)_
- SC Freiburg _(7th BL)_
- Atalanta _(7th SA)_

### Team logos
- Column `logo_url TEXT` added to the `teams` table
- Populated with `https://crests.football-data.org/{id}.svg` for ~65 clubs
- Newly promoted / lower-league clubs (SV Elversberg, Deportivo La Coruña, Málaga, Como) have `logo_url = NULL`
- `TeamCrest` component shows the image if set; falls back to coloured initials on error or when NULL
- `next.config.ts` has `crests.football-data.org` in `images.remotePatterns`
- Teams without logos that could be added: look up their football-data.org ID and UPDATE the `logo_url`

---

## CSS design system

Tailwind v4 with CSS custom properties in `src/app/globals.css`. Key variables:
```
--bg              background
--bg-card         card surfaces
--border          border colour
--text-primary    main text
--text-secondary  secondary text
--text-muted      dimmed text
--accent          brand colour (buttons, links, highlights)
```
Dark-mode only app (no light/dark toggle).

---

## Things that are NOT yet done (potential next tasks)

1. **Fixture import** — no match results in the DB yet; fixtures page exists but is empty. The fixtures need populating (manually or via an API like football-data.org with a free API key) before scores can accumulate. football-data.org API key is needed but the app's API layer isn't wired up yet.

2. **Scoring engine** — `scoring_rules` exist but there's no cron job / webhook to pull live results and update `team_scores` / `player_scores`. Would need an edge function or external cron calling football-data.org.

3. **Deploy to Vercel** — the app builds cleanly (`npm run build` passes) but hasn't been deployed yet. Vercel needs: connect the GitHub repo, set env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`), deploy from the `claude/football-sweepstake-2026-azl5ph` branch (or after merging to `main`).

4. **Logo gaps** — `logo_url` is NULL for: SV Elversberg, Deportivo La Coruña, Málaga, Como. To fix: find their football-data.org IDs and run `UPDATE teams SET logo_url = '...' WHERE name = '...'`.

5. **Draft** — not yet run. Once Vercel is live, eashan logs in and runs the draft from `/draft`.

6. **Onboarding** — `league_memberships` table links users to leagues. When a new user signs up and has no membership, they land at `/onboarding`. This page needs to be checked/completed.

---

## Git workflow reminder

```bash
# Check before touching anything
git status
git log --oneline -5

# After changes
git add <specific files>   # never git add -A blindly
git status                 # review what you're about to commit
git commit -m "..."
git push -u origin claude/football-sweepstake-2026-azl5ph
```

**Never** force-push without explicit permission from the user. If the branch has diverged, tell the user and ask.

---

## Environment proxy note (for Claude Code / Codex environments)

The remote Claude Code / Codex environment routes outbound HTTPS through a proxy. External APIs (football-data.org, Sofascore, API-Sports) return 403 from within the agent environment. This does **not** affect the deployed Vercel app — those URLs are accessed from users' browsers directly and work fine. Don't waste time trying to curl external football APIs from within the agent; test URLs in a browser instead.

---

## Completed work log

| Date | What was done |
|---|---|
| Session 1 | Set up Next.js 16, Supabase schema, all DB tables, seed data (teams, competitions, scoring rules) |
| Session 1 | Built all UI screens: dashboard, standings, my-teams, teams, fixtures, draft, settings (all sub-pages) |
| Session 1 | Built auth: login page (username → email mapping), signup, middleware, onboarding |
| Session 1 | Created 12 DEGENERATES users in Supabase auth with password `degen` |
| Session 2 | Fixed login bug: NULL token fields in auth.users caused scan error; fixed with `UPDATE auth.users SET confirmation_token = COALESCE(..., '')` |
| Session 2 | Updated all 7 competitions to correct 2026/27 season teams (promotions/relegations applied) |
| Session 2 | Added `logo_url` column to `teams`, populated with football-data.org crest URLs for ~65 clubs |
| Session 2 | Updated `TeamCrest` component to show logo image with graceful fallback to coloured initials |
| Session 2 | Fixed European competition teams: replaced incorrect lineup with actual 2025/26 qualifiers (UCL 18, UEL 9, ECL 4) |
| Session 2 | Created `.gitignore`, force-synced feature branch to main, all changes committed and pushed |
| Session 3 | UI overhaul: standings now a table with W/D/L/Pts columns + rank badges; dashboard adds a personalised "Your standing" hero card with player-colour gradient; my-teams converts to client component, highlights logged-in user, adds competition badges per team; teams page gets coloured competition section headers (indigo domestic / purple European); BottomNav active tab gets a pill highlight |
