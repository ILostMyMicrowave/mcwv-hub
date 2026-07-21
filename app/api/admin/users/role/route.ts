import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import { sessionOptions, type SessionData } from "@/lib/session"
import { pool } from "@/lib/db"

export async function POST(req: Request) {
try {
// 1. Verify session
const cookieStore = await cookies()
const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

if (!session.user?.id) {  
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })  
}  

// 2. Query current role from DB - safer than session.role  
const meRes = await pool.query(  
  `SELECT id, role FROM users WHERE id = $1 LIMIT 1`,  
  [session.user.id]  
)  

const me = meRes.rows[0]  
if (!me) {  
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })  
}  

if (me.role !== "owner") {  
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })  
}  

// 3. Validate input  
const body = await req.json().catch(() => ({}))  
const userId = Number(body.user_id)  
const nextRole = String(body.role || "")  

if (!Number.isFinite(userId)) {  
  return NextResponse.json({ error: "Invalid user_id" }, { status: 400 })  
}  

if (!["member", "officer"].includes(nextRole)) {  
  return NextResponse.json(  
    { error: "Invalid role. Only member/officer can be assigned here." },  
    { status: 400 }  
  )  
}  

// 4. Check target exists and is not owner  
const targetRes = await pool.query(  
  `SELECT id, role FROM users WHERE id = $1 LIMIT 1`,  
  [userId]  
)  

const target = targetRes.rows[0]  
if (!target) {  
  return NextResponse.json({ error: "User not found" }, { status: 404 })  
}  

if (target.role === "owner") {  
  return NextResponse.json(  
    { error: "Owner role cannot be changed here" },  
    { status: 400 }  
  )  
}  

// 5. Update  
await pool.query(  
  `UPDATE users SET role = $1 WHERE id = $2`,  
  [nextRole, userId]  
)  

return NextResponse.json({ success: true })

} catch (err) {
console.error("[admin/users/role] POST error:", err)
return NextResponse.json(
{ error: "Failed to update role" },
{ status: 500 }
)
}
}
