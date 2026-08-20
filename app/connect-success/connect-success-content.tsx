"use client";

import { useSearchParams } from "next/navigation";

export default function ConnectSuccessContent() {
  const params = useSearchParams();
  const bgError = params.get("bg_error");
  const bgSuccess = params.get("bg_success");

  const isError = Boolean(bgError);
  const message = isError ? bgError : bgSuccess || "Connected to BIG Games!";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "#070b1a",
        color: "#e5e7f5",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          borderRadius: 18,
          padding: "2rem 2.25rem",
          background: "rgba(15,20,40,.75)",
          border: "1px solid rgba(120,135,220,.35)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 46, marginBottom: 8 }}>{isError ? "⚠️" : "✅"}</div>
        <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>
          {isError ? "BIG Games connection failed" : "Connected to BIG Games"}
        </h1>
        <p style={{ fontSize: 15, color: "#b9c0dd", lineHeight: 1.55, margin: "0 0 20px" }}>
          {message}
        </p>
        <p style={{ fontSize: 13.5, color: "#8d94b5" }}>
          {isError
            ? "Return to Discord and try again, or ask staff for a fresh link."
            : "You can now return to Discord and open your application ticket."}
        </p>
      </div>
    </main>
  );
}
