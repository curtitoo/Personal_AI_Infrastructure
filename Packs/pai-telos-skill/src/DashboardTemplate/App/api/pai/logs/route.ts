import { NextResponse } from "next/server"
import { readdir, stat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

export const dynamic = "force-dynamic"

/** Shape of a single parsed log entry. */
interface LogEntry {
  timestamp: string
  level: string
  message: string
  source: string
}

const DEBUG_DIR = join(homedir(), ".claude", "debug")
const MAX_FILES = 5
const MAX_LINES_PER_FILE = 100
const MAX_ENTRIES = 500

/**
 * Common log format: `2026-02-17T00:11:48.123Z [LEVEL] message`
 * Also handles: `2026-02-17T00:11:48Z [LEVEL] message`
 */
const LOG_LINE_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+\[(\w+)]\s+(.*)$/

/** Try JSON parse, then regex, then raw text. */
function parseLine(raw: string, source: string): LogEntry | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Attempt 1: JSON object
  if (trimmed.startsWith("{")) {
    try {
      const obj: unknown = JSON.parse(trimmed)
      if (typeof obj === "object" && obj !== null) {
        const rec = obj as Record<string, unknown>
        return {
          timestamp: String(rec["timestamp"] ?? rec["ts"] ?? rec["time"] ?? new Date().toISOString()),
          level: String(rec["level"] ?? rec["severity"] ?? "INFO").toUpperCase(),
          message: String(rec["message"] ?? rec["msg"] ?? trimmed),
          source,
        }
      }
    } catch {
      // Fall through to regex
    }
  }

  // Attempt 2: common log format via regex
  const match = LOG_LINE_RE.exec(trimmed)
  if (match) {
    const ts = match[1] ?? new Date().toISOString()
    const level = match[2] ?? "INFO"
    const msg = match[3] ?? trimmed
    return { timestamp: ts, level, message: msg, source }
  }

  // Attempt 3: raw text
  return {
    timestamp: new Date().toISOString(),
    level: "INFO",
    message: trimmed,
    source,
  }
}

/** Read the last N lines of a file without loading the entire buffer into an array first. */
function lastNLines(content: string, n: number): string[] {
  const lines = content.split("\n")
  return lines.slice(-n)
}

/** GET /api/pai/logs -- return parsed entries from the most recent PAI debug logs. */
export async function GET() {
  try {
    let dirEntries: string[]
    try {
      dirEntries = await readdir(DEBUG_DIR)
    } catch {
      // Directory doesn't exist or is unreadable -- return empty
      return NextResponse.json({ entries: [], total: 0 })
    }

    // Stat each file and collect mtime
    const fileStats: Array<{ name: string; mtimeMs: number }> = []
    for (const name of dirEntries) {
      const fullPath = join(DEBUG_DIR, name)
      try {
        const s = await stat(fullPath)
        if (s.isFile()) {
          fileStats.push({ name, mtimeMs: s.mtimeMs })
        }
      } catch {
        // Skip unreadable entries
      }
    }

    // Sort by mtime descending, take top N
    fileStats.sort((a, b) => b.mtimeMs - a.mtimeMs)
    const recentFiles = fileStats.slice(0, MAX_FILES)

    // Parse entries from each file
    const allEntries: LogEntry[] = []
    for (const file of recentFiles) {
      try {
        const content = await readFile(join(DEBUG_DIR, file.name), "utf-8")
        const tail = lastNLines(content, MAX_LINES_PER_FILE)
        for (const line of tail) {
          const entry = parseLine(line, file.name)
          if (entry) {
            allEntries.push(entry)
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Sort by timestamp descending, cap at MAX_ENTRIES
    allEntries.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime()
      const tb = new Date(b.timestamp).getTime()
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
      if (Number.isNaN(ta)) return 1
      if (Number.isNaN(tb)) return -1
      return tb - ta
    })

    const entries = allEntries.slice(0, MAX_ENTRIES)

    return NextResponse.json({ entries, total: entries.length })
  } catch (error) {
    console.error("Failed to read PAI debug logs:", error)
    return NextResponse.json(
      { error: "Failed to read PAI debug logs" },
      { status: 500 }
    )
  }
}
