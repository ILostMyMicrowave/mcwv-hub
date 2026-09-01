"use client";

import { useState, type ReactNode } from "react";

/**
 * Shared shell for the pre-auth pages (/login, /signup).
 * Brand-matched to the hub: emerald, starfield, glass card.
 * Purely presentational.
 */

const ACCENT = "#34d399";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="auth-stage">
      {/* Atmosphere */}
      <div className="auth-stars" aria-hidden="true" />
      <div className="auth-glow auth-glow-1" aria-hidden="true" />
      <div className="auth-glow auth-glow-2" aria-hidden="true" />
      <div className="auth-beam" aria-hidden="true" />
      <div className="auth-vignette" aria-hidden="true" />

      <div className="auth-wrap">
        <div className="auth-brand">
          <img src="/mcwv-logo.png" alt="MCWV" className="auth-logo" draggable={false} />
          <div className="auth-eyebrow">{eyebrow}</div>
        </div>

        <section className="auth-card">
          <div className="auth-card-stripe" aria-hidden="true" />
          <div className="auth-card-sheen" aria-hidden="true" />
          <header className="auth-head">
            <h2 className="auth-title">{title}</h2>
            <p className="auth-sub">{subtitle}</p>
          </header>
          {children}
        </section>

        {footer ? <div className="auth-footer">{footer}</div> : null}

        <div className="auth-sig" aria-hidden="true">⚔ FORGED FOR WAR · MCWV HUB</div>
      </div>

      <style jsx>{`
        .auth-stage {
          position: relative;
          min-height: 100dvh;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 7vh 16px 48px;
          background:
            radial-gradient(120% 90% at 50% 115%, rgba(5, 150, 105, 0.16), transparent 55%),
            radial-gradient(80% 55% at 50% -12%, rgba(52, 211, 153, 0.08), transparent 60%),
            #050507;
          font-family: inherit;
        }

        .auth-stars {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }
        .auth-stars::before {
          content: "";
          position: absolute;
          width: 2px;
          height: 2px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.6);
          box-shadow:
            12vw 18vh 0 0 rgba(255,255,255,0.4), 31vw 8vh 0 0 rgba(255,255,255,0.5),
            55vw 21vh 0 0 rgba(255,255,255,0.4), 74vw 12vh 0 0 rgba(196,181,253,0.55),
            91vw 33vh 0 0 rgba(255,255,255,0.4), 8vw 79vh 0 0 rgba(196,181,253,0.4),
            63vw 72vh 0 0 rgba(255,255,255,0.3), 87vw 82vh 0 0 rgba(196,181,253,0.35),
            22vw 66vh 0 0 rgba(255,255,255,0.3), 41vw 44vh 0 0 rgba(255,255,255,0.25);
          animation: auth-star-drift 14s linear infinite;
        }
        @keyframes auth-star-drift {
          from { margin-top: 0; }
          to { margin-top: -4vh; }
        }

        .auth-glow {
          position: fixed;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(70px);
        }
        .auth-glow-1 {
          width: 44vmax; height: 44vmax;
          top: -18vmax; left: -14vmax;
          background: rgba(5, 150, 105, 0.13);
          animation: auth-orb-1 16s ease-in-out infinite;
        }
        .auth-glow-2 {
          width: 40vmax; height: 40vmax;
          bottom: -16vmax; right: -12vmax;
          background: rgba(52, 211, 153, 0.09);
          animation: auth-orb-2 19s ease-in-out infinite;
        }
        @keyframes auth-orb-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(4vmax, 2vmax) scale(1.08); }
        }
        @keyframes auth-orb-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-3vmax, -2vmax) scale(1.1); }
        }

        .auth-beam {
          position: fixed;
          top: 50%; left: 50%;
          width: 160vmax; height: 22vmax;
          translate: -50% -50%;
          background: linear-gradient(100deg, transparent 42%, rgba(52, 211, 153, 0.045) 50%, transparent 58%);
          pointer-events: none;
          animation: auth-beam-pan 24s linear infinite;
        }
        @keyframes auth-beam-pan {
          from { transform: rotate(-14deg) translateX(-30%); }
          to { transform: rotate(-14deg) translateX(30%); }
        }

        .auth-vignette {
          position: fixed;
          inset: 0;
          pointer-events: none;
          box-shadow: inset 0 0 22vmax rgba(0, 0, 0, 0.66);
        }

        .auth-wrap {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 26.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .auth-brand {
          text-align: center;
          margin-bottom: 26px;
          animation: auth-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both;
        }
        .auth-logo {
          width: min(46vw, 168px);
          margin: 0 auto;
          filter: drop-shadow(0 0 22px rgba(52, 211, 153, 0.45));
          animation: auth-logo-float 5.5s ease-in-out infinite;
        }
        @keyframes auth-logo-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .auth-eyebrow {
          margin-top: 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.34em;
          text-indent: 0.34em;
          color: rgba(167, 243, 208, 0.85);
        }

        .auth-card {
          position: relative;
          width: 100%;
          border-radius: 26px;
          border: 1px solid rgba(167, 243, 208, 0.16);
          background: linear-gradient(180deg, rgba(10, 16, 14, 0.86), rgba(6, 10, 8, 0.88));
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5), 0 0 44px rgba(5, 150, 105, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          padding: 26px 24px 24px;
          overflow: hidden;
          animation: auth-card-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.18s both;
        }
        @keyframes auth-card-in {
          from { opacity: 0; transform: translateY(18px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .auth-card-stripe {
          position: absolute;
          inset-inline: 0;
          top: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #059669 25%, ${ACCENT} 50%, #059669 75%, transparent);
          opacity: 0.9;
        }
        .auth-card-sheen {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.07) 50%, transparent 60%);
          background-size: 260% 100%;
          background-position: 120% 0;
          animation: auth-sheen 1.4s ease-in-out 0.55s both;
        }
        @keyframes auth-sheen {
          from { background-position: 120% 0; }
          to { background-position: -120% 0; }
        }

        .auth-head {
          text-align: center;
          margin-bottom: 24px;
        }
        .auth-title {
          font-size: 1.55rem;
          font-weight: 800;
          letter-spacing: 0.01em;
          color: #f4f4f5;
        }
        .auth-sub {
          margin-top: 7px;
          font-size: 0.83rem;
          line-height: 1.55;
          color: #9d9dab;
        }

        .auth-footer {
          margin-top: 18px;
          font-size: 0.84rem;
          color: #9d9dab;
          animation: auth-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.5s both;
        }
        .auth-footer a {
          color: ${ACCENT};
          font-weight: 600;
        }
        .auth-footer a:hover { text-decoration: underline; }

        .auth-sig {
          margin-top: 26px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 9.5px;
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          color: #565668;
          animation: auth-rise 0.5s ease-out 0.62s both;
        }

        @keyframes auth-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .auth-stage *, .auth-stage *::before, .auth-stage *::after {
            animation: none !important;
          }
        }
      `}</style>
    </main>
  );
}

export function AuthField({
  id,
  label,
  icon,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
  autoComplete,
  inputMode,
  maxLength,
  delay = "0.2s",
  allowReveal = false,
  hint,
  onEnter,
}: {
  id: string;
  label: string;
  icon: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "tel" | "email" | "url";
  maxLength?: number;
  delay?: string;
  allowReveal?: boolean;
  hint?: ReactNode;
  onEnter?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inputType = allowReveal ? (revealed ? "text" : "password") : type;

  return (
    <div className="auth-field" data-focused={focused}>
      <style jsx>{`
        .auth-field {
          position: relative;
          animation: auth-field-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes auth-field-rise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .auth-field label {
          position: absolute;
          top: -7px;
          left: 12px;
          z-index: 2;
          padding: 0 6px;
          border-radius: 6px;
          background: #141020;
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: ${focused ? ACCENT : "#8b8b9a"};
          transition: color 160ms ease;
          pointer-events: none;
        }
        .auth-field-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.9rem;
          opacity: 0.55;
          pointer-events: none;
        }
        .auth-field input {
          width: 100%;
          border-radius: 14px;
          border: 1px solid ${focused ? "rgba(52, 211, 153, 0.65)" : "rgba(255, 255, 255, 0.1)"};
          background: ${focused ? "rgba(52, 211, 153, 0.05)" : "rgba(6, 5, 10, 0.6)"};
          padding: 13px ${allowReveal ? "44px" : "14px"} 13px 40px;
          font-size: 16px; /* >=16px stops iOS focus zoom */
          color: #f4f4f5;
          transition: border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;
          outline: none;
          box-shadow: ${focused ? "0 0 0 3px rgba(52, 211, 153, 0.16), 0 0 20px rgba(5, 150, 105, 0.14)" : "none"};
        }
        .auth-field input::placeholder { color: #55555f; }
        .auth-field input:disabled { opacity: 0.55; }
        .auth-field input:-webkit-autofill,
        .auth-field input:-webkit-autofill:hover,
        .auth-field input:-webkit-autofill:focus {
          -webkit-text-fill-color: #f4f4f5;
          caret-color: #f4f4f5;
          transition: background-color 99999s ease-out;
          box-shadow: 0 0 0 1000px #100d1b inset;
        }
        .auth-eye {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border-radius: 9px;
          border: none;
          background: transparent;
          color: #8b8b9a;
          cursor: pointer;
          transition: background 150ms ease, color 150ms ease;
        }
        .auth-eye:hover { background: rgba(255, 255, 255, 0.06); color: #d4d4dc; }
      `}</style>

      <label htmlFor={id}>{label}</label>
      <span className="auth-field-icon" aria-hidden="true">{icon}</span>
      <input
        id={id}
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onEnter ? (e) => { if (e.key === "Enter") onEnter(); } : undefined}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        disabled={disabled}
      />
      {allowReveal ? (
        <button
          type="button"
          className="auth-eye"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {revealed ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      ) : null}
      {hint ? <div className="auth-hint">{hint}</div> : null}
    </div>
  );
}

export function AuthButton({
  loading,
  loadingText = "Working...",
  disabled = false,
  children,
  delay = "0.35s",
}: {
  loading: boolean;
  loadingText?: string;
  disabled?: boolean;
  children: ReactNode;
  delay?: string;
}) {
  return (
    <div style={{ animation: `auth-btn-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) ${delay} both` }}>
      <style jsx>{`
        @keyframes auth-btn-rise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .auth-btn {
          position: relative;
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: none;
          border-radius: 999px;
          padding: 13px 20px;
          font-size: 0.92rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #052e16;
          background: #34d399;
          cursor: pointer;
          box-shadow: 0 10px 28px rgba(52, 211, 153, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.18);
          transition: background-position 240ms ease, transform 160ms ease, box-shadow 240ms ease, opacity 180ms ease;
          overflow: hidden;
        }
        .auth-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 42%, rgba(255, 255, 255, 0.28) 50%, transparent 58%);
          background-size: 240% 100%;
          background-position: 130% 0;
          opacity: 0;
          transition: opacity 160ms ease;
          pointer-events: none;
        }
        .auth-btn:hover:not(:disabled) {
          transform: translateY(-1.5px);
          box-shadow: 0 14px 32px rgba(52, 211, 153, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.22);
        }
        .auth-btn:hover:not(:disabled)::after {
          opacity: 1;
          animation: auth-btn-sheen 0.8s ease-out;
        }
        .auth-btn:active:not(:disabled) { transform: scale(0.98); }
        .auth-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        @keyframes auth-btn-sheen {
          from { background-position: 130% 0; }
          to { background-position: -130% 0; }
        }
        .auth-spin {
          width: 15px;
          height: 15px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: #fff;
          animation: auth-spin 0.7s linear infinite;
        }
        @keyframes auth-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <button type="submit" className="auth-btn" disabled={disabled || loading}>
        {loading ? (
          <>
            <span className="auth-spin" aria-hidden="true" />
            {loadingText}
          </>
        ) : (
          children
        )}
      </button>
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" aria-live="polite" style={{ animation: "auth-error-in 0.3s ease-out both" }}>
      <style jsx>{`
        @keyframes auth-error-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .auth-error {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          border-radius: 14px;
          border: 1px solid rgba(248, 113, 113, 0.32);
          background: rgba(239, 68, 68, 0.12);
          padding: 11px 13px;
          font-size: 0.83rem;
          line-height: 1.5;
          color: #fecaca;
          animation: auth-shake 0.5s ease-in-out;
        }
        .auth-error-badge {
          flex-shrink: 0;
          display: grid;
          place-items: center;
          width: 18px;
          height: 18px;
          margin-top: 1px;
          border-radius: 50%;
          background: rgba(248, 113, 113, 0.22);
          color: #fca5a5;
          font-size: 11px;
          font-weight: 900;
        }
        @keyframes auth-shake {
          0%, 100% { transform: translateX(0); }
          15%, 45%, 75% { transform: translateX(-4px); }
          30%, 60%, 90% { transform: translateX(4px); }
        }
      `}</style>
      <div className="auth-error">
        <span className="auth-error-badge" aria-hidden="true">!</span>
        <span>{message}</span>
      </div>
    </div>
  );
}
