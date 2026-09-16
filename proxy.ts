
import { NextResponse, type NextRequest } from "next/server"

const SESSION_COOKIE_NAME = "mcwv_session"

const AUTH_PAGES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/connect-success",
  "/check-done",
])

// Legal pages must be reachable without a session (they 307'd to login).
// The Bounty Hunt board is public spectacle (like the k0ii inspiration):
// hero, kill feed, field and standings are viewable logged-out. Your own
// targets and sign-up are gated by the API routes themselves (401 JSON).
const PUBLIC_PAGES = new Set(["/privacy", "/terms", "/bounty"])

// Machine-to-hub endpoints that authenticate with their own server-to-server
// secret instead of a browser session cookie. Each route still validates its
// own WAR_COLLECT_SECRET or BOT_ADMIN_API_KEY after middleware passes it.
const MACHINE_API_PATHS = new Set([
  "/api/war-collector",
  "/api/internal/badge-role-sync",
  "/api/internal/biggames-connected",
  "/api/internal/discord-guild-check",
  "/api/push/trigger",
])

// Public, no-session API paths. The BIG Games applicant flow MUST work for
// someone who does NOT have a hub account (and shouldn't create one):
//  - /api/biggames/connect  : the no-login link the bot DMs an applicant
//  - /api/biggames/callback : BIG Games redirects the browser here after
//    authorization (applicants have no session cookie)
// Each route still enforces its own logic (rate limiting, PKCE, session check
// for the member branch of the callback).
const PUBLIC_API_PATHS = new Set([
  "/api/biggames/connect",
  "/api/biggames/callback",
  "/api/discord/guilds",
  "/api/discord/guilds/callback",
  // Public bounty board state (no secrets: targets stay server-side).
  "/api/bounty",
])

// Public, no-session status endpoint. It is polled by the installed app
// (AppBadgeSync every 2 min / on focus, InstallBanner) which are mounted in
// the ROOT layout — so they run on /login too, and on devices whose 14-day
// session cookie has expired (exactly the members who most need the 🔴 war
// badge to pull them back in). The route already returns
// `authenticated: false` for cookie-less callers, and warActive/battleId
// mirror what the public PS99 API exposes about the clan anyway. Blocking it
// here (prod 2026-09-12: every poll 401ed in the Vercel logs) silently
// killed badge sync, InstallBanner's war urgency message, and the
// poll-driven WAR STARTED push edge + broadcast/presence sweeps for
// logged-out devices. The route rate-limits per IP itself.
const PUBLIC_STATUS_API_PATHS = new Set(["/api/app-status"])

function isAuthPage(pathname: string) {
  return AUTH_PAGES.has(pathname)
}

function isAuthApi(pathname: string) {
  return pathname.startsWith("/api/auth")
}

function loginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone()
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`

  url.pathname = "/login"
  url.search = ""

  if (nextPath && nextPath !== "/") {
    url.searchParams.set("next", nextPath)
  }

  return NextResponse.redirect(url)
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    isAuthPage(pathname) ||
    PUBLIC_PAGES.has(pathname) ||
    isAuthApi(pathname) ||
    MACHINE_API_PATHS.has(pathname) ||
    pathname.startsWith("/api/internal/") ||
    pathname.startsWith("/api/media/") ||
    PUBLIC_STATUS_API_PATHS.has(pathname) ||
    PUBLIC_API_PATHS.has(pathname)
  ) {
    return NextResponse.next()
  }

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME)

  if (!hasSessionCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return loginRedirect(request)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\..*).*)",
  ],
}
