import { NextResponse } from "next/server"
import { ironclawFetch } from "@/lib/ironclaw"
import { toAgentDetail, toAgentEvent, toActionResponse } from "@/lib/mappers"
import type { JobDetail, JobEvent, ActionResponse } from "@/types/ironclaw"

export const dynamic = "force-dynamic"

/** GET /api/pai/agents/:id — return agent detail with events. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const [jobRes, eventsRes] = await Promise.all([
      ironclawFetch(`/api/jobs/${id}`),
      ironclawFetch(`/api/jobs/${id}/events`),
    ])

    if (!jobRes.ok) {
      return NextResponse.json({ error: "Agent not found" }, { status: jobRes.status })
    }

    const jobData: JobDetail = await jobRes.json()
    const agent = toAgentDetail(jobData)

    let events: unknown[] = []
    if (eventsRes.ok) {
      const eventsData: JobEvent[] = await eventsRes.json()
      events = eventsData.map(toAgentEvent)
    }

    return NextResponse.json({ agent, events })
  } catch (error) {
    console.error("Failed to fetch agent detail:", error)
    return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 })
  }
}

/** DELETE /api/pai/agents/:id — cancel an agent. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await ironclawFetch(`/api/jobs/${id}`, { method: "DELETE" })
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to cancel agent" }, { status: res.status })
    }
    const data: ActionResponse = await res.json()
    return NextResponse.json(toActionResponse(data))
  } catch (error) {
    console.error("Failed to cancel agent:", error)
    return NextResponse.json({ error: "Failed to cancel agent" }, { status: 500 })
  }
}
