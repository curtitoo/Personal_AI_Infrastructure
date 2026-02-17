import { NextResponse } from "next/server"
import { ironclawFetch } from "@/lib/ironclaw"
import { toRoutine, toRoutineSummary } from "@/lib/mappers"
import type { Routine, RoutineSummary } from "@/types/ironclaw"

export const dynamic = "force-dynamic"

/** GET /api/pai/routines — return routines with summary. */
export async function GET() {
  try {
    const [routinesRes, summaryRes] = await Promise.all([
      ironclawFetch("/api/routines"),
      ironclawFetch("/api/routines/summary"),
    ])

    if (!routinesRes.ok) {
      return NextResponse.json({ routines: [], summary: null, offline: true })
    }

    const routinesRaw: unknown = await routinesRes.json()
    const routinesList: Routine[] = Array.isArray(routinesRaw)
      ? routinesRaw
      : (routinesRaw as Record<string, unknown>).routines as Routine[] ?? []

    const routines = routinesList.map(toRoutine)
    let summary = null

    if (summaryRes.ok) {
      const summaryData: RoutineSummary = await summaryRes.json()
      summary = toRoutineSummary(summaryData)
    }

    return NextResponse.json({ routines, summary })
  } catch (error) {
    console.error("Failed to fetch routines:", error)
    return NextResponse.json({ routines: [], summary: null, offline: true })
  }
}
