import { NextResponse } from "next/server"
import { listVariants } from "@/lib/cc-mirror"

export const dynamic = "force-dynamic"

/** GET /api/cc-mirror/variants — list all variants with model tier config. */
export async function GET() {
  try {
    const variants = listVariants()
    return NextResponse.json({ variants })
  } catch (error) {
    console.error("Failed to list CC-Mirror variants:", error)
    return NextResponse.json(
      { error: "Failed to list variants" },
      { status: 500 }
    )
  }
}
