import { NextResponse } from "next/server";

// TEMP DATA (will be replaced with Neon later)
const mockData = [
  { id: 1, name: "Player1", points: 1200 },
  { id: 2, name: "Player2", points: 900 },
  { id: 3, name: "Player3", points: 500 }
];

export async function GET() {
  try {
    // later: this becomes Neon query
    return NextResponse.json({
      success: true,
      source: "mock",
      data: mockData
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "API failed" },
      { status: 500 }
    );
  }
}
