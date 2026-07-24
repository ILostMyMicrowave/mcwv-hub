import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { BotAdminApiError, botAdminFetch } from "@/lib/botAdminApi"

export async function POST(req: Request) {
  const auth = await requireAdminUser("officer")
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => ({}))
    const data = await botAdminFetch("/admin/broadcast/preview", {
      method: "POST",
      body: JSON.stringify({ ...body, requested_by: auth.user.username }),
    })

    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BotAdminApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    return NextResponse.json(
      { error: "Broadcast preview failed" },
      { status: 500 }
    )
  }
}
