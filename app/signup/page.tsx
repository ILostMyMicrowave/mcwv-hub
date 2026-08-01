"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthButton, AuthError, AuthField, AuthShell } from "@/components/AuthShell";

const RESEND_COOLDOWN_S = 30;

function SignupSteps({ step }: { step: 1 | 2 }) {
  return (
    <div className="signup-steps" aria-hidden="true">
      <style jsx>{`
        .signup-steps {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.14em;
          color: #6d6d7d;
        }
        .signup-step {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          transition: color 250ms ease;
        }
        .signup-step.on { color: #c4b5fd; }
        .signup-step-dot {
          display: grid;
          place-items: center;
          width: 19px;
          height: 19px;
          border-radius: 50%;
          border: 1px solid rgba(196, 181, 253, 0.3);
          font-size: 9.5px;
          transition: all 250ms ease;
        }
        .signup-step.on .signup-step-dot {
          background: rgba(167, 139, 250, 0.18);
          border-color: rgba(167, 139, 250, 0.75);
          color: #e9e3ff;
          box-shadow: 0 0 12px rgba(167, 139, 250, 0.4);
        }
        .signup-step-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, rgba(167, 139, 250, 0.4), rgba(255, 255, 255, 0.07));
        }
      `}</style>
      <span className={`signup-step${step >= 1 ? " on" : ""}`}>
        <span className="signup-step-dot">1</span> CREDENTIALS
      </span>
      <span className="signup-step-line" />
      <span className={`signup-step${step === 2 ? " on" : ""}`}>
        <span className="signup-step-dot">2</span> VERIFY
      </span>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [created, setCreated] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function requestCode() {
    if (!username.trim()) {
      setError("Enter your Roblox username first.");
      return false;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/signup/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Failed to send verification code");
        return false;
      }

      setCodeSent(true);
      setResendIn(RESEND_COOLDOWN_S);
      return true;
    } catch {
      setError("Something went wrong while sending your code");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    if (!codeSent) {
      await requestCode();
      return;
    }

    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError("Enter the 6-digit code from your Discord DM.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, verificationCode }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Signup failed");
        return;
      }

      setCreated(true);
      window.setTimeout(() => router.push("/login"), 1200);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="NEW RECRUIT"
      title="Join MCWV"
      subtitle={
        <>
          Enter your Roblox username — the clan bot DMs a one-time
          code to your linked Discord account.
        </>
      }
      footer={
        <>
          Already have an account? <Link href="/login">Log in</Link>
        </>
      }
    >
      {created ? (
        <div>
          <style jsx>{`
            .signup-success {
              text-align: center;
              padding: 26px 8px 10px;
              animation: signup-success-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
            }
            @keyframes signup-success-in {
              from { opacity: 0; transform: scale(0.92); }
              to { opacity: 1; transform: scale(1); }
            }
            .signup-success-ring {
              display: grid;
              place-items: center;
              width: 62px;
              height: 62px;
              margin: 0 auto 16px;
              border-radius: 50%;
              background: rgba(52, 211, 153, 0.12);
              border: 1px solid rgba(52, 211, 153, 0.45);
              color: #6ee7b7;
              font-size: 26px;
              box-shadow: 0 0 30px rgba(52, 211, 153, 0.25);
            }
            .signup-success-title { font-size: 1.15rem; font-weight: 800; color: #f4f4f5; }
            .signup-success-sub { margin-top: 6px; font-size: 0.84rem; color: #9d9dab; }
          `}</style>
          <div className="signup-success" role="status">
            <div className="signup-success-ring">✓</div>
            <div className="signup-success-title">Account created</div>
            <div className="signup-success-sub">Taking you to log in…</div>
          </div>
        </div>
      ) : (
        <>
          <SignupSteps step={codeSent ? 2 : 1} />

          <form onSubmit={handleSignup} className="space-y-5" noValidate>
            <AuthField
              id="username"
              label="Roblox username"
              icon="👤"
              value={username}
              onChange={setUsername}
              placeholder="Your exact Roblox username"
              autoComplete="username"
              disabled={loading}
              delay="0.24s"
            />

            <AuthField
              id="password"
              label="Password"
              icon="🔒"
              value={password}
              onChange={setPassword}
              placeholder="Create a password"
              autoComplete="new-password"
              disabled={loading}
              allowReveal
              delay="0.3s"
            />

            <AuthField
              id="confirm"
              label="Confirm password"
              icon="🔐"
              value={confirm}
              onChange={setConfirm}
              placeholder="Repeat your password"
              autoComplete="new-password"
              disabled={loading}
              allowReveal
              delay="0.36s"
            />

            {codeSent && (
              <div className="signup-verify">
                <style jsx>{`
                  .signup-verify {
                    border-radius: 16px;
                    border: 1px solid rgba(167, 139, 250, 0.22);
                    background: rgba(124, 58, 237, 0.08);
                    padding: 14px;
                    animation: signup-verify-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
                  }
                  @keyframes signup-verify-in {
                    from { opacity: 0; transform: translateY(10px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                  }
                  .signup-verify-note {
                    display: flex;
                    gap: 9px;
                    align-items: flex-start;
                    margin-bottom: 12px;
                    font-size: 0.78rem;
                    line-height: 1.55;
                    color: #c4b5fd;
                  }
                  .signup-verify-note .dot {
                    flex-shrink: 0;
                    width: 7px;
                    height: 7px;
                    margin-top: 6px;
                    border-radius: 50%;
                    background: #34d399;
                    box-shadow: 0 0 10px rgba(52, 211, 153, 0.8);
                  }
                  .signup-resend {
                    margin-top: 10px;
                    background: none;
                    border: none;
                    padding: 0;
                    font-size: 0.76rem;
                    font-weight: 600;
                    color: #a78bfa;
                    cursor: pointer;
                  }
                  .signup-resend:hover:not(:disabled) { text-decoration: underline; }
                  .signup-resend:disabled { color: #6d6d7d; cursor: not-allowed; }
                `}</style>

                <div className="signup-verify-note">
                  <span className="dot" aria-hidden="true" />
                  <span>
                    Code sent — check the Discord DM linked to that Roblox user.
                    It expires in 10 minutes.
                  </span>
                </div>

                <AuthField
                  id="verificationCode"
                  label="Verification code"
                  icon="✉️"
                  value={verificationCode}
                  onChange={(v) => setVerificationCode(v.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  maxLength={6}
                  disabled={loading}
                  delay="0.05s"
                  hint={
                    <button
                      type="button"
                      disabled={loading || resendIn > 0}
                      onClick={() => void requestCode()}
                      className="signup-resend"
                    >
                      {resendIn > 0 ? `Resend available in ${resendIn}s` : "Resend code"}
                    </button>
                  }
                />
              </div>
            )}

            <AuthError message={error} />

            <AuthButton
              loading={loading}
              loadingText={codeSent ? "Verifying..." : "Sending code..."}
              delay="0.42s"
            >
              {codeSent ? "Verify & Create Account" : "Send Verification Code"}
            </AuthButton>
          </form>
        </>
      )}
    </AuthShell>
  );
}
