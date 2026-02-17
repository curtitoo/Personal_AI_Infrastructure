import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"

export const dynamic = "force-dynamic"

const CLAUDE_DIR = path.join(os.homedir(), ".claude")
const GLOBAL_SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json")
const LOCAL_SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.local.json")

const SENSITIVE_PATTERNS = [/token/i, /secret/i, /password/i, /key/i, /auth/i]

/** Returns true if a settings key does NOT match any sensitive pattern. */
function isSafeKey(key: string): boolean {
  return !SENSITIVE_PATTERNS.some((p) => p.test(key))
}

/** Recursively strip sensitive keys from a settings object. */
function filterSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!isSafeKey(key)) continue
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = filterSensitive(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

/** Read and parse a JSON settings file. Returns empty object if missing or invalid. */
function readSettingsFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {}
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** GET /api/pai/settings — return PAI settings with sensitive keys filtered out. */
export async function GET() {
  try {
    const globalRaw = readSettingsFile(GLOBAL_SETTINGS_PATH)
    const localRaw = readSettingsFile(LOCAL_SETTINGS_PATH)

    return NextResponse.json({
      global: filterSensitive(globalRaw),
      local: filterSensitive(localRaw),
      globalPath: GLOBAL_SETTINGS_PATH,
      localPath: LOCAL_SETTINGS_PATH,
    })
  } catch (error) {
    console.error("Failed to read PAI settings:", error)
    return NextResponse.json(
      { error: "Failed to read PAI settings" },
      { status: 500 }
    )
  }
}
