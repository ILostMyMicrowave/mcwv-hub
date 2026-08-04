import { NextResponse, type NextRequest } from "next/server"

const SESSION_COOKIE_NAME = "mcwv_session"

const AUTH_PAGES = new Set(["/login", "/signup"])

// Machine-to-hub endpoints that authenticate with their own secret
// (e.g. the Discord bot's war collector loop) instead of a session
// cookie. The route itself still enforces WAR_COLLECT_SECRET when set.
const MACHINE_API_PATHS = new Set(["/api/war-collector"])

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
    isAuthApi(pathname) ||
    MACHINE_API_PATHS.has(pathname)
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
