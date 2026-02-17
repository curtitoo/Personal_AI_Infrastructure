import { NextResponse } from "next/server"
import { readSettingsAuditLog, logSettingsChange } from "@/lib/settings-governance"

export const dynamic = "force-dynamic"

/** GET /api/pai/settings-audit — return recent settings change audit entries. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200)
    const entries = readSettingsAuditLog(limit)
    return NextResponse.json({ entries })
  } catch (error) {
    console.error("Failed to read settings audit log:", error)
    return NextResponse.json({ entries: [] })
  }
}

/** POST /api/pai/settings-audit — log a critical settings change. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      setting?: string
      oldValue?: unknown
      newValue?: unknown
    }
    if (!body.setting) {
      return NextResponse.json({ error: "Missing setting field" }, { status: 400 })
    }
    logSettingsChange({
      timestamp: new Date().toISOString(),
      setting: body.setting,
      oldValue: body.oldValue ?? "unknown",
      newValue: body.newValue ?? "unknown",
      source: "dashboard",
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to log settings change:", error)
    return NextResponse.json({ error: "Failed to log" }, { status: 500 })
  }
}
