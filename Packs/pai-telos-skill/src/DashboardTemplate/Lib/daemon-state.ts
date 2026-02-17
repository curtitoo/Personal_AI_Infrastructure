import fs from "fs"
import path from "path"
import os from "os"

const STATE_FILE = path.join(os.homedir(), ".claude", "MEMORY", "STATE", "daemon-state.json")

/** Shape written by heartbeat-triage.sh via jq. */
export interface DaemonState {
  last_check: number
  status: string
  last_reason?: string
  escalation_count: number
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
  const lastBeatMs = state.last_check * 1000
  const now = Date.now()
  return (now - lastBeatMs) > thresholdMinutes * 60 * 1000
}
