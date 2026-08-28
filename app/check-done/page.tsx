import { Suspense } from "react";
import CheckDoneContent from "./check-done-content";

export const metadata = { title: "Server check · MCWV" };

export default function CheckDonePage() {
  return (
    <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "#e5e7f5" }}>Loading…</div>}>
      <CheckDoneContent />
    </Suspense>
  );
}
