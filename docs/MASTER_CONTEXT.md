# MCWV HUB — Master Context

**Version:** 3.0 - P0 Complete
**Last verified commit:** 819fa9c
**Status:** Active Development (Private Repository)
**Date:** 2026-07-20

## Current Milestone

**P0 Security Hardening: COMPLETE ✅**

### Completed:
- iron-session migration for core auth/admin/settings routes
- settings save authentication fix (was failing due to mixed auth)
- admin member loading fix
- owner authorization fix (role checked from DB, not trusted from session)
- shared PostgreSQL pool foundation (`lib/db.ts` + `lib/session.ts`)

**Stable checkpoint:** Auth migration was the riskiest change. App is now stable. Everything after this is more mechanical.

---

## 1. What MCWV Hub Is

Private clan dashboard for Pet Simulator 99 clan **MCWV**. Central place for:
- live leaderboard tracking
- war tracking and war analytics
- contribution statistics
- hall of fame / achievements
- player profiles (Roblox integration)
- theme settings (default/ice/inferno)
- clan settings + role management (member/officer/owner)

Not a generic template — clan-specific flows and visual styling.

---

## 2. Tech Stack

- Next.js 16.2.4 (verified, released 2026-04-16)
- React 19.2.4
- TypeScript 5
- PostgreSQL via `pg` ^8.11.3
- Tailwind CSS v4
- ECharts 5.5.0 + echarts-for-react 3.0.2
- bcryptjs 2.4.3
- iron-session 8.0.4 (added for secure sessions)
- uuid 9.0.1 listed but unused (grep shows 0 imports) — candidate for removal

App Router. Private deployment.

---

## 3. Architecture

**Flow:**
1. Frontend fetches from API routes (`/api/*`)
2. API routes read PostgreSQL + external PS99/Roblox APIs
3. Renders clan stats, war data, contributions, history
4. Auth via iron-session encrypted cookie `mcwv_session`

**Current live auth flow (consistent after P0):**
```
Login → mcwv_session (encrypted) → auth/me confirms → settings/global checks session + DB role → admin routes check session + DB role
```

**Important implementation details:**
- `lib/session.ts`: secret length check >=32, ttl 14 days, httpOnly true, secure conditional on production, sameSite lax
- `lib/db.ts`: Pool singleton max 10, idleTimeout 30s, globalThis pattern for Next dev
- Role checks query DB (`SELECT role FROM users WHERE id=$1`) rather than trusting `session.user.role` — demoted users lose privileges immediately
- Theme: `data-theme` on root + localStorage `mcwv-theme` + DB `user_settings.theme` and `users.theme` (two paths — source-of-truth ambiguity known)
- Leaderboard: in-memory cache + point_history tracking via Map — works better in long-lived process than serverless cold starts
- War collector fetches up to 20 pages sequentially — could timeout, should parallelize in batches

---

## 4. Current State (Live Code is Source of Truth)

**Fixed to iron-session (8 routes):**
- `auth/login`, `auth/me`, `auth/logout`, `auth/change-password`
- `settings/user` (also IDOR fixed + theme allowlist)
- `settings/global` (keeps GET public, POST officer/owner)
- `admin/users` (owner only)
- `admin/users/role` (owner only)

**Still old auth (4 routes) — non-blocking cleanup:**
- `achievements` (owner only)
- `hall-of-fame` (owner only)
- `profile/[slug]`
- `user/theme` (second theme path)

**Pool usage:**
- Uses shared pool: `settings/global`, `admin/users`, `admin/users/role`
- Still `new Pool()` in 13 files including auth routes, leaderboard, contributions, etc. — should be migrated to `import { pool } from "@/lib/db"`

**UI:**
- Homepage `app/page.tsx` 768 lines — monolith blending landing + dashboard + live feed + banner
- Profile `[slug]` 33KB — largest UI, Roblox/mastery logic
- Settings 660 lines — theme + global + role management
- These are large for a reason (evolved quickly), not necessarily bad — split only when improves readability

**Styling:**
- `globals.css` defines theme variables (default/ice/inferno) + blob/fade-in animations
- Global `* { transition }` rule expensive — should be :root only — P3 polish
- Polished visual style — preserve spacing/colors/typography/animations per design

**Public assets:**
- `public/` has default Next.js starter SVGs (file.svg, globe.svg, etc.) — bloat, not central

**README:**
- Still create-next-app starter — doc gap

---

## 5. Known Issues / Technical Debt

**Confirmed (observable):**
- 4 routes still use old `mcwv_user` regex auth
- 13 files still create own Pool (should be singleton)
- `user/theme` vs `settings/user` — two theme persistence paths
- `uuid` unused
- `signup` returns raw `err.message` — leaks internals
- `war-collector` sequential 20 pages (6s) — could timeout on serverless

**Probable (needs verification):**
- Signup race condition — depends on whether DB has `UNIQUE LOWER(username)` constraint — need schema.sql to confirm
- CSRF exposure — cookie-based auth + POST/PATCH/DELETE exists, no SameSite was set before (now set via sessionOptions sameSite lax), no Origin validation yet — should review with exact allowlist, not endsWith

**Accepted for now (not blocking):**
- Large components intentionally left large until readability benefit is clear
- Theme sync duplicated: `UserSync` + `useTheme` both touch theme — works, but duplicative
- Homepage monolith — functional but hard to maintain

---

## 6. Design Decisions (Intentional)

- **iron-session chosen for auth:** Best balance simplicity/security for clan site. No sessions table, encrypted/signed, good Next.js integration. Not chosen because "more secure" than server-side sessions — security comparable — but simpler operationally. Server-side sessions would be better if fine-grained control needed (list devices, revoke one, force logout).
- **DB role check for admin actions:** Session contains role, but we query current role from DB for admin routes to handle demotion within 14-day ttl.
- **GET `settings/global` stays public:** Clan settings like Discord link, banner text are public info — no auth needed for read, officer/owner for write.
- **Exact origin allowlist for CSRF, not endsWith:** `endsWith("yourdomain.com")` allows `evil-yourdomain.com`. Use exact list: `allowedOrigins.includes(origin)`.
- **Incremental hardening:** Core auth first (riskiest), then remaining auth routes, then pool centralization, then cleanup. Avoids multiple risky batches at once.

---

## 7. Things Not to Break

- Visual style: spacing, colors, typography, animations, branding — preserve, improvements should feel invisible
- Live leaderboard polling (10s) + activity feed generation
- Theme system: `data-theme` attribute + CSS variables
- War data collection and snapshot logic
- Role system: owner/officer/member hierarchy
- Parameterized SQL (no injection)
- Current auth flow consistency — don't re-introduce old `mcwv_user` pattern

---

## 8. File Index (Quick Reference)

**Root:** `AGENTS.md`, `CLAUDE.md`, `package.json`, `next.config.ts` (minimal), `eslint.config.mjs`, `tsconfig.json`

**lib/ (NEW):**
- `session.ts` - sessionOptions, SessionData, secret length check
- `db.ts` - Pool singleton

**app/:**
- `layout.tsx` - fonts, globals.css, UserSync
- `page.tsx` - homepage dashboard (768 lines)
- `globals.css` - theme variables + animations + global * transition
- `achievements/page.tsx`, `contributions/page.tsx` (ECharts), `hall-of-fame/page.tsx`, `leaderboard/page.tsx`, `login/page.tsx`, `profile/[slug]/page.tsx` (33KB), `settings/page.tsx` (660 lines), `signup/page.tsx`, `war-analyst/page.tsx`, `war-info/page.tsx`, `dashboard/page.tsx` (stub)

**app/api/ (18 routes):**
- Auth (NOW iron-session): `auth/login`, `me`, `logout`, `change-password`
- Auth (OLD): `auth/signup`
- Settings: `settings/global` (NOW fixed), `settings/user` (NOW fixed + IDOR fixed), `user/theme` (OLD - second path)
- Admin (NOW fixed): `admin/users`, `admin/users/role`
- Content (OLD): `achievements`, `hall-of-fame`
- Data (public): `leaderboard`, `contributions/analytics`, `war`, `war-analyst`, `war-collector`
- Profile (OLD): `profile/[slug]`

**components/:** `Navbar.tsx`, `Podium.tsx`, `UserSync.tsx`, `AnimatedBackground.tsx`, `HallOfFamePreview.tsx`, `AchievementsPreview.tsx`, `ChangePasswordModal.tsx`

**hooks/:** `useTheme.ts`

**public/:** starter SVGs

---

## 9. Next Milestones (Not Urgent - App Stable)

**Batch 1 - Finish auth migration (non-blocking):**
- Migrate `achievements`, `hall-of-fame`, `profile/[slug]`, `user/theme` to iron-session same pattern

**Batch 2 - DB centralization:**
- Migrate remaining 13 `new Pool()` to `lib/db.ts`

**Batch 3 - Cleanup:**
- Remove `uuid`
- Add `.env.example` with `SESSION_SECRET` (32+ chars) + `APP_ORIGIN` + `DATABASE_URL`
- Fix README (replace starter with project docs)
- Resolve theme source-of-truth (`users.theme` vs `user_settings.theme`)
- Add `middleware.ts` with exact origin allowlist for CSRF review

**Batch 4 - Performance/Polish:**
- Parallelize war-collector (20 pages sequential -> batches of 5)
- Parallelize Roblox API calls in leaderboard
- Add indexes: `point_history(created_at)`, `point_history(user_id)`
- Lazy-load `echarts-for-react`
- Narrow global `*` transition to `:root`

---

## 10. Notes for Future AI Agents

- This file is a **snapshot of intent and current state**. Live code is source of truth. If they disagree, trust code and use this as context for why things were done that way.
- Don't rewrite for style alone. Keep functional, incremental, minimal regressions.
- For auth, use `await cookies()` + `getIronSession<SessionData>(cookieStore, sessionOptions)` + query role from DB for admin checks.
- Use shared pool: `import { pool } from "@/lib/db"`
- `SESSION_SECRET` must be >=32 chars.
- Next 16.2.4 is valid, React 19 is officially supported, `uuid` unused, `crypto.randomUUID` usage is client-only feed IDs not hydration issue.
- Visual style: preserve
- If missing info (schema.sql, env), ask for file rather than guessing.

---

**Git history preserves older versions. Update this same file after major milestones: P0 complete, Auth migration complete, DB migration complete, Theme cleanup complete, etc.**
