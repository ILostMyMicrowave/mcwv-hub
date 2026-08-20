import { Suspense } from "react";
import ConnectSuccessContent from "./connect-success-content";

export const metadata = { title: "BIG Games Connected · MCWV" };

export default function ConnectSuccessPage() {
  return (
    <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "#e5e7f5" }}>Loading…</div>}>
      <ConnectSuccessContent />
    </Suspense>
  );
}
