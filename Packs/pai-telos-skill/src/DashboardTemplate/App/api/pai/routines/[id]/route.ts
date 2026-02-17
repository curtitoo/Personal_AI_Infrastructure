import { NextResponse } from "next/server"
import { ironclawFetch } from "@/lib/ironclaw"
import { toRoutineDetail, toActionResponse } from "@/lib/mappers"
import type { RoutineDetail, ActionResponse } from "@/types/ironclaw"

export const dynamic = "force-dynamic"

/** GET /api/pai/routines/:id — return routine detail. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await ironclawFetch(`/api/routines/${id}`)
    if (!res.ok) {
      return NextResponse.json({ error: "Routine not found" }, { status: res.status })
    }
    const data: RoutineDetail = await res.json()
    return NextResponse.json(toRoutineDetail(data))
  } catch (error) {
    console.error("Failed to fetch routine detail:", error)
    return NextResponse.json({ error: "Failed to fetch routine" }, { status: 500 })
  }
}

/** POST /api/pai/routines/:id — toggle or trigger a routine. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const action = searchParams.get("action") // "toggle" | "trigger"

  const endpoint = action === "trigger"
    ? `/api/routines/${id}/trigger`
    : `/api/routines/${id}/toggle`

  try {
    const res = await ironclawFetch(endpoint, { method: "POST" })
    if (!res.ok) {
      return NextResponse.json({ error: `Failed to ${action} routine` }, { status: res.status })
    }
    const data: ActionResponse = await res.json()
    return NextResponse.json(toActionResponse(data))
  } catch (error) {
    console.error(`Failed to ${action} routine:`, error)
    return NextResponse.json({ error: `Failed to ${action} routine` }, { status: 500 })
  }
}

/** DELETE /api/pai/routines/:id — delete a routine. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await ironclawFetch(`/api/routines/${id}`, { method: "DELETE" })
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to delete routine" }, { status: res.status })
    }
    const data: ActionResponse = await res.json()
    return NextResponse.json(toActionResponse(data))
  } catch (error) {
    console.error("Failed to delete routine:", error)
    return NextResponse.json({ error: "Failed to delete routine" }, { status: 500 })
  }
}
