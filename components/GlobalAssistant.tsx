"use client";

import { usePathname } from "next/navigation";

import AssistantBubble from "@/components/AssistantBubble";

// Bubble hides where it could cover dense data UI, auth forms, the cutscene,
// or the AFK room (calm zone — no chat bubbles over the pixels).
const HIDDEN_PREFIXES = ["/admin", "/login", "/signup", "/cutscene", "/afk"];

export default function GlobalAssistant() {
  const pathname = usePathname() ?? "";
  if (HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return null;
  }
  return <AssistantBubble />;
}
