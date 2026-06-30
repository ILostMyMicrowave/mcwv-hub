import { NextResponse } from "next/server";

export async function GET() {
  // temporary fake data (we replace with Neon next)
  const data = [
    { name: "Player1", points: 1200 },
    { name: "Player2", points: 900 },
    { name: "Player3", points: 500 }
  ];

  return NextResponse.json(data);
}
