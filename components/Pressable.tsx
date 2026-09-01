"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  ink?: "dark" | "light";
  onClick?: (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
  title?: string;
  "aria-label"?: string;
};

export default function Pressable({
  children,
  className = "",
  style,
  href,
  type = "button",
  disabled = false,
  loading = false,
  ink,
  onClick,
  title,
  "aria-label": ariaLabel,
}: Props) {
  const [pressed, setPressed] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleId = useRef(0);
  const busy = disabled || loading;
  const tone =
    ink ??
    (/\bbg-emerald|\bfrom-emerald|\bto-teal|\bto-emerald/.test(className) ? "dark" : "light");

  function pointerDown(e: PointerEvent<HTMLButtonElement | HTMLAnchorElement>) {
    if (busy) return;
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

  const cls = `pressable ${className}`.trim();
  const shared = {
    className: cls,
    style,
    title,
    "aria-label": ariaLabel,
    "aria-busy": loading || undefined,
    "data-pressed": pressed ? "1" : "0",
    "data-ink": tone,
    onPointerDown: pointerDown,
    onPointerUp: pointerUp,
    onPointerCancel: pointerUp,
    onPointerLeave: pointerUp,
    onClick,
  };

  const inner = (
    <>
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="pressable-ripple"
          style={{ left: ripple.x, top: ripple.y }}
        />
      ))}
      <span className="pressable-label">{children}</span>
    </>
  );

  if (href) {
    return (
      <a href={busy ? undefined : href} aria-disabled={busy || undefined} {...shared}>
        {inner}
      </a>
    );
  }

  return (
    <button type={type} disabled={busy} {...shared}>
      {inner}
    </button>
  );
}
