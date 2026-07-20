import type { SessionOptions } from "iron-session";

export type SessionUser = {
  id: number;
  username: string;
  role?: string | null;
};

export type SessionData = {
  user?: SessionUser;
};

function requireSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters long."
    );
  }

  return secret;
}

export const sessionOptions: SessionOptions = {
  cookieName: "mcwv_session",
  password: requireSessionSecret(),
  ttl: 60 * 60 * 24 * 14, // 14 days
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};
