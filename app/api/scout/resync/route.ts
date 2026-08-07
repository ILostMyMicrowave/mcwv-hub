import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authUser";
import { runScoutPass } from "@/lib/scoutSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// Owner-only: run one chunked sync pass (~45s budget). The client re-fires
// with restart:false until `done` flips true — safe at any plan/time limit.
export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "owner") {
    return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { restart?: boolean };
  try {
    const { state, done } = await runScoutPass({
      budgetMs: 45_000,
      restart: body?.restart === true,
    });
    return NextResponse.json({
      success: true,
      done,
      phase: state.phase,
      battle: state.battle,
      finishedAt: state.finishedAt,
      error: state.error,
      progress: {
        members: state.rows.length,
        matched: state.matches.length,
        enchants: state.enchantRows.length,
        ...state.progress,
      },
    });
  } catch (err) {
    console.error("[scout] resync failed:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "sync_failed" },
      { status: 500 }
    );
  }
}
