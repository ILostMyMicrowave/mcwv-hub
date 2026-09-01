"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

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
          transform-origin: 50% 70%;
        }
        .auth-wrap:has(.auth-error) .auth-logo {
          animation: auth-logo-flinch 0.42s ease;
        }
        @keyframes auth-logo-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes auth-logo-flinch {
          0%, 100% { transform: translateY(0) rotate(0); }
          25% { transform: translateY(2px) rotate(-4deg); }
          55% { transform: translateY(-1px) rotate(3deg); }
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
  valid,
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
  valid?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inputType = allowReveal ? (revealed ? "text" : "password") : type;
  const looksValid =
    valid ??
    (maxLength === 6
      ? value.length === 6
      : allowReveal
        ? value.length >= 6
        : value.trim().length >= 3);

  return (
    <div
      className="auth-field"
      data-focused={focused ? "1" : "0"}
      data-valid={looksValid ? "1" : "0"}
      data-reveal={allowReveal ? "1" : "0"}
      style={{ animationDelay: delay }}
    >
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
          color: #8b8b9a;
          transition: color 160ms ease, transform 160ms cubic-bezier(0.34, 1.4, 0.64, 1);
          pointer-events: none;
        }
        .auth-field[data-focused="1"] label {
          color: ${ACCENT};
          transform: translateY(-1px);
        }
        .auth-field-row { position: relative; }
        .auth-field-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.9rem;
          opacity: 0.55;
          pointer-events: none;
          transition: transform 180ms cubic-bezier(0.34, 1.4, 0.64, 1), opacity 180ms ease;
        }
        .auth-field[data-focused="1"] .auth-field-icon {
          transform: translateY(-50%) scale(1.12);
          opacity: 0.9;
        }
        .auth-field input {
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(6, 5, 10, 0.6);
          padding: 13px 14px 13px 40px;
          font-size: 16px;
          color: #f4f4f5;
          transition: border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;
          outline: none;
          touch-action: manipulation;
        }
        .auth-field[data-reveal="1"] input { padding-right: 72px; }
        .auth-field[data-valid="1"]:not([data-reveal="1"]) input { padding-right: 40px; }
        .auth-field[data-focused="1"] input {
          border-color: rgba(52, 211, 153, 0.65);
          background: rgba(52, 211, 153, 0.05);
          box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.16), 0 0 20px rgba(5, 150, 105, 0.14);
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
        .auth-tick {
          position: absolute;
          right: 12px;
          top: 50%;
          width: 18px;
          height: 18px;
          margin-top: -9px;
          border-radius: 50%;
          background: ${ACCENT};
          color: #052e16;
          display: grid;
          place-items: center;
          opacity: 0;
          transform: scale(0.4);
          pointer-events: none;
          transition: opacity 180ms ease, transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .auth-field[data-reveal="1"] .auth-tick { right: 44px; }
        .auth-field[data-valid="1"] .auth-tick {
          opacity: 1;
          transform: scale(1);
        }
        .auth-eye {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: 9px;
          border: none;
          background: transparent;
          color: #8b8b9a;
          cursor: pointer;
          touch-action: manipulation;
          transition: background 150ms ease, color 150ms ease, transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .auth-eye:hover { background: rgba(255, 255, 255, 0.06); color: #d4d4dc; }
        .auth-eye:active { transform: translateY(-50%) scale(0.86); }
        .auth-eye svg {
          transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .auth-eye[data-on="1"] svg {
          transform: rotate(-18deg) scale(1.08);
        }
        .auth-hint { margin-top: 8px; }
        @media (prefers-reduced-motion: reduce) {
          .auth-field, .auth-tick, .auth-eye, .auth-eye svg, .auth-field-icon, .auth-field label {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>

      <label htmlFor={id}>{label}</label>
      <div className="auth-field-row">
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
        <span className="auth-tick" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 9.5 17 19 7" />
          </svg>
        </span>
        {allowReveal ? (
          <button
            type="button"
            className="auth-eye"
            data-on={revealed ? "1" : "0"}
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
      </div>
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
  const [pressed, setPressed] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleId = useRef(0);

  function pointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (disabled || loading) return;
    setPressed(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++rippleId.current;
    setRipples((list) => [...list, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    window.setTimeout(() => {
      setRipples((list) => list.filter((item) => item.id !== id));
    }, 520);
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
  }

  function pointerUp() {
    setPressed(false);
  }

  return (
    <div className="auth-btn-wrap" style={{ animationDelay: delay }}>
      <style jsx>{`
        .auth-btn-wrap {
          display: flex;
          justify-content: center;
          min-height: 48px;
          animation: auth-btn-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes auth-btn-rise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .auth-btn {
          position: relative;
          width: 100%;
          height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 999px;
          padding: 0 20px;
          font-size: 0.92rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #052e16;
          background: #34d399;
          cursor: pointer;
          overflow: hidden;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          box-shadow: 0 10px 28px rgba(52, 211, 153, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.18);
          transition:
            width 0.38s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
            box-shadow 0.2s ease,
            opacity 0.18s ease;
        }
        .auth-btn[data-pressed="1"]:not(:disabled) {
          transform: scale(0.94);
          transition: transform 0.08s ease-out, box-shadow 0.08s ease-out;
          box-shadow: 0 3px 10px rgba(52, 211, 153, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }
        @media (hover: hover) and (pointer: fine) {
          .auth-btn:hover:not(:disabled):not([data-pressed="1"]):not([data-loading="1"]) {
            transform: translateY(-1.5px);
            box-shadow: 0 14px 32px rgba(52, 211, 153, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.22);
          }
        }
        .auth-btn[data-loading="1"] {
          width: 48px;
          padding: 0;
          cursor: wait;
        }
        .auth-btn:disabled:not([data-loading="1"]) { opacity: 0.55; cursor: not-allowed; }
        .auth-btn-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
          transition: opacity 0.14s ease, transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .auth-btn[data-loading="1"] .auth-btn-label {
          opacity: 0;
          transform: scale(0.72);
          position: absolute;
          pointer-events: none;
        }
        .auth-spin {
          position: absolute;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2.5px solid rgba(5, 46, 22, 0.22);
          border-top-color: #052e16;
          opacity: 0;
          transform: scale(0.4);
          transition: opacity 0.16s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .auth-btn[data-loading="1"] .auth-spin {
          opacity: 1;
          transform: scale(1);
          animation: auth-spin 0.7s linear infinite;
        }
        @keyframes auth-spin {
          to { transform: scale(1) rotate(360deg); }
        }
        .auth-ripple {
          position: absolute;
          width: 16px;
          height: 16px;
          margin: -8px 0 0 -8px;
          border-radius: 50%;
          background: rgba(5, 46, 22, 0.22);
          pointer-events: none;
          animation: auth-ripple 0.5s ease-out forwards;
        }
        @keyframes auth-ripple {
          to {
            transform: scale(18);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-btn-wrap, .auth-btn, .auth-btn-label, .auth-spin, .auth-ripple {
            animation: none !important;
            transition: none !important;
          }
          .auth-btn[data-loading="1"] { width: 100%; }
          .auth-ripple { display: none; }
        }
      `}</style>
      <button
        type="submit"
        className="auth-btn"
        disabled={disabled || loading}
        data-pressed={pressed ? "1" : "0"}
        data-loading={loading ? "1" : "0"}
        aria-busy={loading}
        aria-label={loading ? loadingText : undefined}
        onPointerDown={pointerDown}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onPointerLeave={pointerUp}
      >
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="auth-ripple"
            style={{ left: ripple.x, top: ripple.y }}
          />
        ))}
        <span className="auth-btn-label">{children}</span>
        <span className="auth-spin" aria-hidden="true" />
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
