"use client";

import { useSearchParams } from "next/navigation";

export default function CheckDoneContent() {
  const params = useSearchParams();
  const error = params.get("error");
  const ok = params.get("ok");
  const isError = Boolean(error);
  const message = isError ? error : ok || "Done. You can close this tab and go back to Discord.";

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
          {isError ? "Server check not finished" : "Server check complete"}
        </h1>
        <p style={{ fontSize: 15, color: "#b9c0dd", lineHeight: 1.55, margin: "0 0 20px" }}>
          {message}
        </p>
        <p style={{ fontSize: 13.5, color: "#8d94b5" }}>
          {isError
            ? "Return to Discord and ask staff for a fresh link if you still need to complete this."
            : "You can close this tab and go back to Discord."}
        </p>
      </div>
    </main>
  );
}
