import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/adminAuth"
import { BotAdminApiError, botAdminFetch } from "@/lib/botAdminApi"

type ProxyOptions = {
  minimumRole?: "officer" | "owner"
  method?: "POST" | "PATCH" | "DELETE"
}

export async function proxyBotAdminMutation(
  req: Request,
  botPath: string,
  options: ProxyOptions = {}
) {
  const auth = await requireAdminUser(options.minimumRole ?? "officer")
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => ({}))
    const data = await botAdminFetch(botPath, {
      method: options.method ?? "POST",
      body: JSON.stringify({ ...body, requested_by: auth.user.username }),
    })

    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BotAdminApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error(`[admin proxy] ${botPath} error:`, err)
    return NextResponse.json(
      { error: "Bot admin action failed" },
      { status: 500 }
    )
  }
}

