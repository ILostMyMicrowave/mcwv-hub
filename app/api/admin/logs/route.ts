import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { getAdminLogs } from "@/lib/adminAudit"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  try {
    const limitParam = new URL(req.url).searchParams.get("limit")
    const limit = limitParam ? Number(limitParam) : 500

    return NextResponse.json({
      success: true,
      source: "hub-db",
      logs: await getAdminLogs(Number.isFinite(limit) ? limit : 500),
    })
  } catch (err) {
    console.error("[api/admin/logs] error:", err)
    return NextResponse.json(
      { success: false, error: "Failed to load admin logs", logs: [] },
      { status: 500 }
    )
  }
}
