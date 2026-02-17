import fs from "fs"
import path from "path"
import os from "os"

export type SettingTier = "critical" | "operational" | "informational"

/** Prefixes that define critical settings — changes to these weaken the outer security boundary. */
const CRITICAL_PREFIXES = ["safety.", "sandbox.policy", "sandbox.timeout_secs"]

/** Prefixes for operational settings — affect performance/behavior but not security posture. */
const OPERATIONAL_PREFIXES = ["agent.", "wasm.", "sandbox.memory_limit_mb"]

/** Classify an IronClaw setting key into its governance tier. */
export function classifySetting(key: string): SettingTier {
  if (CRITICAL_PREFIXES.some(p => key === p || key.startsWith(p + "."))) {
    return "critical"
  }
  if (OPERATIONAL_PREFIXES.some(p => key === p || key.startsWith(p + "."))) {
    return "operational"
  }
  return "informational"
}

export interface SettingsAuditEntry {
  timestamp: string
  setting: string
  oldValue: unknown
  newValue: unknown
  source: string
}

const MEMORY_SECURITY_DIR = path.join(os.homedir(), ".claude", "MEMORY", "SECURITY")
const AUDIT_LOG_PATH = path.join(MEMORY_SECURITY_DIR, "settings-audit.jsonl")

/** Append an audit entry for a critical settings change. */
export function logSettingsChange(entry: SettingsAuditEntry): void {
  if (!fs.existsSync(MEMORY_SECURITY_DIR)) {
    fs.mkdirSync(MEMORY_SECURITY_DIR, { recursive: true })
  }
  const line = JSON.stringify(entry) + "\n"
  fs.appendFileSync(AUDIT_LOG_PATH, line)
}

/** Read all settings audit entries. Returns newest first. */
export function readSettingsAuditLog(limit = 50): SettingsAuditEntry[] {
  if (!fs.existsSync(AUDIT_LOG_PATH)) return []
  const raw = fs.readFileSync(AUDIT_LOG_PATH, "utf-8").trim()
  if (!raw) return []
  const entries: SettingsAuditEntry[] = []
  for (const line of raw.split("\n")) {
    try {
      entries.push(JSON.parse(line) as SettingsAuditEntry)
    } catch {
      // Skip malformed lines
    }
  }
  return entries.reverse().slice(0, limit)
}

/** Tier display metadata for the UI. */
export const TIER_META: Record<SettingTier, { label: string; color: string; variant: string }> = {
  critical: { label: "Critical", color: "#f52a65", variant: "destructive" },
  operational: { label: "Operational", color: "#f0a020", variant: "warning" },
  informational: { label: "Info", color: "#9854f1", variant: "secondary" },
}
