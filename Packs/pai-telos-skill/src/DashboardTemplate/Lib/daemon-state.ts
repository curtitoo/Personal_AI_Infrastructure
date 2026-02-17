import fs from "fs"
import path from "path"
import os from "os"

const STATE_FILE = path.join(os.homedir(), ".claude", "MEMORY", "STATE", "daemon-state.json")

export interface TriageResult {
  status: "clear" | "attention"
  summary: string
  escalate: boolean
}

export interface DaemonState {
  timestamp: string
  triage: TriageResult
  signals: {
    new_failures: number
    new_learnings: number
  }
}

/** Read the latest daemon state. Returns null if no state file exists. */
export function readDaemonState(): DaemonState | null {
  if (!fs.existsSync(STATE_FILE)) return null
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8")
    return JSON.parse(raw) as DaemonState
  } catch {
    return null
  }
}

/** Check if the heartbeat is stale (older than threshold minutes). */
export function isHeartbeatStale(state: DaemonState, thresholdMinutes = 30): boolean {
  const lastBeat = new Date(state.timestamp).getTime()
  const now = Date.now()
  return (now - lastBeat) > thresholdMinutes * 60 * 1000
}
