import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // Never allow the hub to be iframed (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers must trust declared content types (no MIME sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs (incl. query params) to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Hub pages never need these device features.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

// A Content-Security-Policy is deliberately NOT set here yet: Next inline
// boot scripts + inline style attributes would force 'unsafe-inline' anyway,
// which negates most of the value. Revisit with a nonce-based policy later.

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
