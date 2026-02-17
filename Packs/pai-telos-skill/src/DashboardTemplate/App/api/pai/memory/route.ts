import { NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

export const dynamic = "force-dynamic"

const MEMORY_DIR = path.join(os.homedir(), ".claude", "MEMORY")
const LEARNINGS_FILE = path.join(MEMORY_DIR, "LEARNING", "learnings.jsonl")

/** Categories to scan for .md learning files. */
const SCAN_CATEGORIES = ["ALGORITHM", "SYSTEM", "FAILURES", "SYNTHESIS"] as const

interface Learning {
  id: string
  text: string
  concept?: string
  tier?: string
  timestamp?: string
  source?: string
}

interface MemoryFile {
  name: string
  path: string
  category: string
}

/**
 * Parse a single JSONL line into a Learning, returning undefined on failure.
 * Handles `noUncheckedIndexedAccess` by validating required fields.
 */
function parseLearningLine(line: string): Learning | undefined {
  try {
    const raw: unknown = JSON.parse(line)
    if (typeof raw !== "object" || raw === null) return undefined

    const obj = raw as Record<string, unknown>
    const id = obj["id"]
    const content = obj["content"] ?? obj["title"]

    if (typeof id !== "string" || typeof content !== "string") return undefined

    const learning: Learning = {
      id,
      text: content,
    }

    const concept = obj["concept"]
    if (typeof concept === "string") learning.concept = concept

    const tier = obj["tier"]
    if (typeof tier === "string") learning.tier = tier

    const timestamp = obj["created_at"]
    if (typeof timestamp === "string") learning.timestamp = timestamp

    const source = obj["context"]
    if (typeof source === "string") learning.source = source

    return learning
  } catch {
    return undefined
  }
}

/**
 * Read learnings.jsonl and return the last N entries.
 */
function readLearnings(limit: number): Learning[] {
  if (!fs.existsSync(LEARNINGS_FILE)) return []

  const content = fs.readFileSync(LEARNINGS_FILE, "utf-8")
  const lines = content.split("\n").filter((l) => l.trim().length > 0)

  const learnings: Learning[] = []
  for (const line of lines) {
    const parsed = parseLearningLine(line)
    if (parsed) learnings.push(parsed)
  }

  return learnings.slice(-limit)
}

/**
 * Recursively collect .md files from a directory.
 * For FAILURES, specifically looks for CONTEXT.md files.
 */
function collectMdFiles(
  dir: string,
  category: string,
  basePath: string,
): MemoryFile[] {
  if (!fs.existsSync(dir)) return []

  const files: MemoryFile[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectMdFiles(fullPath, category, basePath))
    } else if (entry.name.endsWith(".md")) {
      files.push({
        name: entry.name,
        path: path.relative(basePath, fullPath),
        category,
      })
    }
  }

  return files
}

/**
 * Scan all LEARNING subdirectories for .md files.
 */
function scanLearningFiles(): MemoryFile[] {
  const learningDir = path.join(MEMORY_DIR, "LEARNING")
  const files: MemoryFile[] = []

  for (const category of SCAN_CATEGORIES) {
    const categoryDir = path.join(learningDir, category)
    files.push(...collectMdFiles(categoryDir, category, MEMORY_DIR))
  }

  return files
}

/** GET /api/pai/memory -- return PAI native memory data. */
export async function GET() {
  try {
    const learnings = readLearnings(50)
    const files = scanLearningFiles()

    return NextResponse.json({
      learningCount: learnings.length,
      learnings,
      fileCount: files.length,
      files,
    })
  } catch (error) {
    console.error("Failed to read PAI memory:", error)
    return NextResponse.json(
      { error: "Failed to read PAI memory" },
      { status: 500 },
    )
  }
}
