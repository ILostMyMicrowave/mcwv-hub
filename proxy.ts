
import { NextResponse, type NextRequest } from "next/server"

const SESSION_COOKIE_NAME = "mcwv_session"

const AUTH_PAGES = new Set(["/login", "/signup", "/connect-success", "/check-done"])

// Legal pages must be reachable without a session (they 307'd to login).
const PUBLIC_PAGES = new Set(["/privacy", "/terms"])

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
])

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
