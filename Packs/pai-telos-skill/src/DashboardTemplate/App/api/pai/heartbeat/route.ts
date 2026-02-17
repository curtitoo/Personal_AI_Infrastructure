import { NextResponse } from "next/server"
import { readDaemonState, isHeartbeatStale } from "@/lib/daemon-state"

export const dynamic = "force-dynamic"

/** GET /api/pai/heartbeat — return latest daemon heartbeat state. */
export async function GET() {
  try {
    const state = readDaemonState()
    if (!state) {
      return NextResponse.json({
        configured: false,
        state: null,
        stale: false,
      })
    }
    return NextResponse.json({
      configured: true,
      state,
      stale: isHeartbeatStale(state),
    })
  } catch (error) {
    console.error("Failed to read daemon state:", error)
    return NextResponse.json(
      { error: "Failed to read daemon state" },
      { status: 500 }
    )
  }
}
