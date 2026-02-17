import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"

export const dynamic = "force-dynamic"

interface SecurityEvent {
  timestamp: string
  session_id: string
  event_type: string
  tool: string
  category: string
  target: string
  pattern_matched?: string
  reason?: string
  action_taken: string
}

const SECURITY_DIR = path.join(os.homedir(), ".claude", "MEMORY", "SECURITY")

/** Recursively find all security-*.jsonl files, sorted newest first. */
function findSecurityFiles(dir: string, limit: number): string[] {
  const files: { path: string; mtime: number }[] = []

  function walk(d: string) {
    if (!fs.existsSync(d)) return
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name.startsWith("security-") && entry.name.endsWith(".jsonl")) {
        const stat = fs.statSync(full)
        files.push({ path: full, mtime: stat.mtimeMs })
      }
    }
  }

  walk(dir)
  files.sort((a, b) => b.mtime - a.mtime)
  return files.slice(0, limit).map(f => f.path)
}

/** GET /api/pai/security-events — return recent security events. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200)

    const filePaths = findSecurityFiles(SECURITY_DIR, limit)
    const events: SecurityEvent[] = []

    for (const fp of filePaths) {
      try {
        const raw = fs.readFileSync(fp, "utf-8").trim()
        if (!raw) continue
        const parsed = JSON.parse(raw) as SecurityEvent
        events.push(parsed)
      } catch {
        // Skip unreadable files
      }
    }

    return NextResponse.json({ events })
  } catch (error) {
    console.error("Failed to read security events:", error)
    return NextResponse.json({ events: [] })
  }
}
