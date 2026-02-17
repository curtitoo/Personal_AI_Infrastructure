import { NextResponse } from "next/server"
import { getJobsSummary, getRoutinesSummary } from "@/lib/ironclaw"
import { toAgentSummary, toRoutineSummary } from "@/lib/mappers"

export const dynamic = "force-dynamic"

/** GET /api/pai/summary — aggregated agent + routine summaries (mapped). */
export async function GET() {
  try {
    const [jobs, routines] = await Promise.all([
      getJobsSummary(),
      getRoutinesSummary(),
    ])
    return NextResponse.json({
      agents: toAgentSummary(jobs),
      routines: toRoutineSummary(routines),
    })
  } catch (error) {
    console.error("PAI summary error:", error)
    return NextResponse.json(
      { agents: null, routines: null, offline: true },
      { status: 200 }
    )
  }
}
