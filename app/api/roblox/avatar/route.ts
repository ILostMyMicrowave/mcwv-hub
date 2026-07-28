import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userId = String(url.searchParams.get("userId") ?? "").trim()

  if (!/^\d+$/.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(userId)}&size=150x150&format=Png&isCircular=true`,
      { cache: "no-store" }
    )
    const data = await res.json().catch(() => ({}))
    const imageUrl = data?.data?.[0]?.imageUrl

    if (typeof imageUrl === "string" && imageUrl.startsWith("https://")) {
      return NextResponse.redirect(imageUrl, { status: 302 })
    }
  } catch {
    // fall through to Roblox's legacy thumbnail endpoint
  }

  return NextResponse.redirect(
    `https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(userId)}&width=150&height=150&format=png`,
    { status: 302 }
  )
}
