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

class RateLimiter {
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

// Helper to get client IP
export function getClientIP(req: Request): string {
  // Check for common proxy headers
  const forwardedFor = req.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim()
  }

  const xRealIP = req.headers.get("x-real-ip")
  if (xRealIP) {
    return xRealIP.trim()
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
