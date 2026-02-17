import { NextResponse } from "next/server"
import { isValidVariantName, updateVariantModels } from "@/lib/cc-mirror"

export const dynamic = "force-dynamic"

interface UpdateBody {
  fast?: string
  standard?: string
  smart?: string
  timeoutMultiplier?: string
}

/** PUT /api/cc-mirror/variants/:name — update model tiers for a variant. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params

    if (!isValidVariantName(name)) {
      return NextResponse.json(
        { error: "Invalid variant name" },
        { status: 400 }
      )
    }

    const body = (await request.json()) as UpdateBody
    const fast = body.fast
    const standard = body.standard
    const smart = body.smart

    if (!fast || !standard || !smart) {
      return NextResponse.json(
        { error: "All three model tiers (fast, standard, smart) are required" },
        { status: 400 }
      )
    }

    const result = updateVariantModels(
      name,
      { fast, standard, smart },
      body.timeoutMultiplier
    )

    if (!result.success) {
      const status = result.error?.includes("not found") ? 404 : 500
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({
      success: true,
      message: `Updated model tiers for ${name}`,
    })
  } catch (error) {
    console.error("Failed to update CC-Mirror variant:", error)
    return NextResponse.json(
      { error: "Failed to update variant" },
      { status: 500 }
    )
  }
}
