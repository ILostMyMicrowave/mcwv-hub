/**
 * Simple in-memory rate limiter for serverless environments.
 * 
 * Note: This works for single-instance deployments. For multi-instance
 * deployments, replace with Redis or another distributed store.
 * 
 * In Vercel serverless, each instance has its own memory space, so
 * rate limiting may be less effective. Consider using Upstash Redis
 * or Vercel's built-in rate limiting for production multi-instance setups.
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

interface RateLimitOptions {
  windowMs: number // Time window in milliseconds
  max: number // Max requests per window
}

export class RateLimiter {
  private store: Map<string, RateLimitEntry>
  private windowMs: number
  private max: number

  constructor(options: RateLimitOptions) {
    this.store = new Map()
    this.windowMs = options.windowMs
    this.max = options.max

    // Cleanup expired entries periodically
    if (typeof setInterval !== "undefined") {
      setInterval(() => this.cleanup(), this.windowMs * 2).unref()
    }
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key)
      }
    }
  }

  public check(key: string): { success: boolean; limit: number; remaining: number; reset: number } {
    const now = Date.now()
    const entry = this.store.get(key)

    if (!entry || entry.resetTime <= now) {
      // Create new entry
      this.store.set(key, { count: 1, resetTime: now + this.windowMs })
      return {
        success: true,
        limit: this.max,
        remaining: this.max - 1,
        reset: now + this.windowMs,
      }
    }

    // Existing entry within window
    if (entry.count >= this.max) {
      // Rate limit exceeded
      return {
        success: false,
        limit: this.max,
        remaining: 0,
        reset: entry.resetTime,
      }
    }

    // Increment count
    entry.count += 1
    return {
      success: true,
      limit: this.max,
      remaining: this.max - entry.count,
      reset: entry.resetTime,
    }
  }

  // Check several keys at once and reject if ANY is exhausted; otherwise
  // increment them all. Used to throttle on BOTH a (best-effort) client IP and
  // an un-spoofable identifier (the target username / authenticated user id).
  // IP-only limiting was bypassable via a spoofed X-Forwarded-For header; the
  // second bucket keeps a targeted brute-force throttled even when the attacker
  // rotates IPs. (Brief account lockout is an accepted tradeoff here.)
  public checkMulti(keys: string[]): { success: boolean; limit: number; remaining: number; reset: number } {
    const now = Date.now()
    const max = this.max

    // First pass: if ANY bucket is already exhausted, reject without incrementing.
    let exhaustedReset = 0
    for (const key of keys) {
      const entry = this.store.get(key)
      if (entry && entry.resetTime > now && entry.count >= max) {
        exhaustedReset = Math.max(exhaustedReset, entry.resetTime)
      }
    }
    if (exhaustedReset > 0) {
      return { success: false, limit: max, remaining: 0, reset: exhaustedReset }
    }

    // Second pass: increment every key, tracking the tightest remaining count.
    let minRemaining = max
    let maxReset = 0
    for (const key of keys) {
      const entry = this.store.get(key)
      if (!entry || entry.resetTime <= now) {
        this.store.set(key, { count: 1, resetTime: now + this.windowMs })
        minRemaining = Math.min(minRemaining, max - 1)
      } else {
        entry.count += 1
        minRemaining = Math.min(minRemaining, max - entry.count)
      }
      const refreshed = this.store.get(key)
      if (refreshed) maxReset = Math.max(maxReset, refreshed.resetTime)
    }
    return { success: true, limit: max, remaining: Math.max(0, minRemaining), reset: maxReset }
  }
}

// Rate limit configurations
export const loginRateLimiter = new RateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 attempts per 5 minutes
})

export const signupRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
})

export const changePasswordRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
})

export const forgotPasswordRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
})

// Helper to get client IP
export function getClientIP(req: Request): string {
  // Prefer x-real-ip: proxies like Vercel set it to the actual client IP and
  // overwrite any client-supplied value, so it is far harder to spoof than the
  // x-forwarded-for chain.
  const xRealIP = req.headers.get("x-real-ip")
  if (xRealIP && xRealIP.trim()) {
    return xRealIP.trim()
  }

  // x-forwarded-for is a chain "client, proxy1, proxy2, ...". The LEFTMOST
  // entry is client-controlled and trivially spoofable — a caller can send any
  // header value, which made the old rate limiter bypassable by rotating that
  // value per request. The RIGHTMOST entry is the one appended by our trusted
  // proxy, so use that instead.
  const forwardedFor = req.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean)
    if (parts.length > 0) {
      return parts[parts.length - 1]
    }
  }

  // Fallback (may not work in all environments)
  return "unknown"
}

// Helper to create rate limit response
export function rateLimitResponse(result: { limit: number; remaining: number; reset: number }) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
        "Retry-After": String(Math.ceil((result.reset - Date.now()) / 1000)),
      },
    }
  )
}

// Import NextResponse for the helper
import { NextResponse } from "next/server"
