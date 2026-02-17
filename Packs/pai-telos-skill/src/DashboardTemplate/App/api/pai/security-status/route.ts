import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"

export const dynamic = "force-dynamic"

const CLAUDE_DIR = path.join(os.homedir(), ".claude")
const OVERRIDE_PATH = path.join(CLAUDE_DIR, "SECURITY_OVERRIDE")
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks")

interface HookStatus {
  state: "healthy" | "degraded" | "missing"
  hookCount: number
}

function checkHookHealth(): HookStatus {
  if (!fs.existsSync(HOOKS_DIR)) {
    return { state: "missing", hookCount: 0 }
  }

  try {
    const entries = fs.readdirSync(HOOKS_DIR)
    const hookFiles = entries.filter(e => e.endsWith(".js") || e.endsWith(".ts") || e.endsWith(".sh"))
    if (hookFiles.length === 0) {
      return { state: "missing", hookCount: 0 }
    }
    return { state: "healthy", hookCount: hookFiles.length }
  } catch {
    return { state: "degraded", hookCount: 0 }
  }
}

/** GET /api/pai/security-status — escape hatch + hook health. */
export async function GET() {
  try {
    const overrideActive = fs.existsSync(OVERRIDE_PATH)
    const hooks = checkHookHealth()

    return NextResponse.json({
      overrideActive,
      overridePath: OVERRIDE_PATH,
      hooks,
    })
  } catch (error) {
    console.error("Failed to check security status:", error)
    return NextResponse.json(
      { error: "Failed to check security status" },
      { status: 500 }
    )
  }
}
