import { NextResponse } from "next/server"
import { ironclawFetch } from "@/lib/ironclaw"
import { toAgent, toAgentSummary } from "@/lib/mappers"
import type { Job, JobSummary } from "@/types/ironclaw"

export const dynamic = "force-dynamic"

/** GET /api/pai/agents — return agents with optional status filter and summary. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const limit = searchParams.get("limit")
    const includeSummary = searchParams.get("summary") !== "false"

    // Build IronClaw query
    const params = new URLSearchParams()
    if (status) params.set("status", status)
    if (limit) params.set("limit", limit)
    const query = params.toString() ? `?${params.toString()}` : ""

    const results: { agents: unknown[]; summary: unknown } = { agents: [], summary: null }

    const [jobsRes, summaryRes] = await Promise.all([
      ironclawFetch(`/api/jobs${query}`),
      includeSummary ? ironclawFetch("/api/jobs/summary") : null,
    ])

    if (!jobsRes.ok) {
      return NextResponse.json({ agents: [], summary: null, offline: true })
    }

    const jobsRaw: unknown = await jobsRes.json()
    const jobsList: Job[] = Array.isArray(jobsRaw)
      ? jobsRaw
      : (jobsRaw as Record<string, unknown>).jobs as Job[] ?? []
    results.agents = jobsList.map(toAgent)

    if (summaryRes?.ok) {
      const summaryData: JobSummary = await summaryRes.json()
      results.summary = toAgentSummary(summaryData)
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error("Failed to fetch agents:", error)
    return NextResponse.json({ agents: [], summary: null, offline: true })
  }
}
