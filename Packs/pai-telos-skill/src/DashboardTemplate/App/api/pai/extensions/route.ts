import { NextResponse } from "next/server"
import { ironclawFetch } from "@/lib/ironclaw"
import { toExtension } from "@/lib/mappers"
import type { Extension } from "@/types/ironclaw"

export const dynamic = "force-dynamic"

/** GET /api/pai/extensions — return mapped extensions list. */
export async function GET() {
  try {
    const res = await ironclawFetch("/api/extensions")
    if (!res.ok) {
      return NextResponse.json({ extensions: [], offline: true })
    }
    const raw: unknown = await res.json()
    const list: Extension[] = Array.isArray(raw)
      ? raw
      : (raw as Record<string, unknown>).extensions as Extension[] ?? []

    return NextResponse.json({ extensions: list.map(toExtension) })
  } catch (error) {
    console.error("Failed to fetch extensions:", error)
    return NextResponse.json({ extensions: [], offline: true })
  }
}
