# Unified PAI + IronClaw Architecture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Layered Sovereignty architecture — IronClaw as daemon chassis, PAI as cognitive payload — with a heartbeat bridge, state persistence, and unified dashboard tabs for Memory/Logs/Settings.

**Architecture:** IronClaw cron triggers PAI triage scripts via `claude --print`. State persists in `daemon-state.json` between heartbeats. The dashboard shows both PAI-native and IronClaw data in tab views for the 3 bridged features (Memory, Logs, Settings). A Tabs UI component is added to support this pattern.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`), Tailwind CSS 4, Radix UI primitives, lucide-react icons. No test framework — verification via `next build` + manual check.

**Base path for all dashboard files:** `Packs/pai-telos-skill/src/DashboardTemplate/`

---

## Phase 0: Heartbeat

### Task 1: Create PAI Heartbeat Triage Script

**Files:**
- Create: `Packs/pai-core-install/src/skills/CORE/Tools/heartbeat-triage.sh`

**Context:** This is the script IronClaw's cron routine calls. It uses `claude --print` in lightweight mode (no hooks, no tools) to do a quick triage of PAI state and write results to `daemon-state.json`. Reference `Inference.ts:112-120` for the `--setting-sources '' --tools ''` pattern.

**Step 1: Create the triage script**

```bash
#!/usr/bin/env bash
# heartbeat-triage.sh — Lightweight PAI triage invoked by IronClaw routine.
# Uses claude --print with hooks/tools disabled for fast execution.
# Writes result to daemon-state.json for cross-session continuity.

set -euo pipefail

STATE_DIR="${HOME}/.claude/MEMORY/STATE"
STATE_FILE="${STATE_DIR}/daemon-state.json"
MEMORY_DIR="${HOME}/.claude/MEMORY"

mkdir -p "${STATE_DIR}"

# Read previous state if it exists
PREV_STATE=""
if [ -f "${STATE_FILE}" ]; then
  PREV_STATE=$(cat "${STATE_FILE}")
fi

# Gather quick signals (no expensive operations)
HOOK_ERRORS=$(find "${MEMORY_DIR}/LEARNING/FAILURES" -name "CONTEXT.md" -newer "${STATE_FILE}" 2>/dev/null | wc -l | tr -d ' ')
NEW_LEARNINGS=$(find "${MEMORY_DIR}/LEARNING" -name "*.jsonl" -newer "${STATE_FILE}" 2>/dev/null | wc -l | tr -d ' ')

# Quick triage via claude --print (lightweight — no hooks, no tools)
TRIAGE=$(claude --print \
  --model haiku \
  --tools '' \
  --output-format text \
  --setting-sources '' \
  --system-prompt "You are a triage agent. Given system signals, output a JSON object with: {\"status\": \"clear\"|\"attention\", \"summary\": \"<one line>\", \"escalate\": true|false}. Only escalate if something genuinely needs human or full-agent attention." \
  "Previous state: ${PREV_STATE:-none}. Signals: ${HOOK_ERRORS} new failures, ${NEW_LEARNINGS} new learnings since last check." \
  2>/dev/null || echo '{"status":"clear","summary":"triage failed gracefully","escalate":false}')

# Write state file
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > "${STATE_FILE}" << EOF
{
  "timestamp": "${TIMESTAMP}",
  "triage": ${TRIAGE},
  "signals": {
    "new_failures": ${HOOK_ERRORS},
    "new_learnings": ${NEW_LEARNINGS}
  }
}
EOF

# If triage says escalate, spawn a full Claude session (hooks enabled)
ESCALATE=$(echo "${TRIAGE}" | grep -o '"escalate":\s*true' || true)
if [ -n "${ESCALATE}" ]; then
  claude --print \
    --model sonnet \
    --output-format text \
    --system-prompt "You are PAI running in daemon mode (PAI_DEPLOY_CONTEXT=daemon). Review the triage findings and take appropriate action. Write a session summary to daemon-state.json when done." \
    "Heartbeat escalation. State: $(cat "${STATE_FILE}")" \
    > /dev/null 2>&1 &
fi

echo "Heartbeat complete: $(echo "${TRIAGE}" | grep -o '"status":"[^"]*"' || echo 'done')"
```

**Step 2: Make it executable**

Run: `chmod +x Packs/pai-core-install/src/skills/CORE/Tools/heartbeat-triage.sh`

**Step 3: Commit**

```bash
git add Packs/pai-core-install/src/skills/CORE/Tools/heartbeat-triage.sh
git commit -m "feat: add PAI heartbeat triage script for IronClaw daemon integration"
```

---

### Task 2: Create HEARTBEAT.md Documentation

**Files:**
- Create: `Packs/pai-core-install/src/skills/CORE/docs/HEARTBEAT.md`

**Context:** Documents the heartbeat pattern so anyone configuring IronClaw knows how to set up the routine.

**Step 1: Write the documentation**

```markdown
# PAI Heartbeat Pattern

## Overview

IronClaw triggers periodic PAI heartbeats via its routine/cron system.
Each heartbeat runs a lightweight triage (no hooks, no tools) to check
PAI system health. If something needs attention, it escalates to a full
Claude session with all hooks enabled.

## Setup

### IronClaw Routine Configuration

Create a routine in IronClaw pointing to the triage script:

```json
{
  "name": "pai-heartbeat",
  "description": "Periodic PAI system health triage",
  "trigger_type": "cron",
  "trigger": {
    "schedule": "*/15 * * * *"
  },
  "action_type": "lightweight",
  "action": {
    "command": "bash ~/.claude/skills/PAI/CORE/Tools/heartbeat-triage.sh"
  }
}
```

### Two Invocation Modes

| Mode | Hooks | Tools | When |
|------|-------|-------|------|
| Lightweight triage | OFF | OFF | Every heartbeat — quick check |
| Full escalation | ON | ON | Only when triage finds something |

### State Persistence

State lives at `~/.claude/MEMORY/STATE/daemon-state.json`.

Each heartbeat reads previous state and writes new state, providing
cross-session continuity (the "clipboard" between sessions).

### Security

- Triage mode: `--setting-sources '' --tools ''` — cannot execute tools or trigger hooks
- Full mode: All PAI hooks fire, including SecurityValidator
- IronClaw's exec approval layer applies to both modes
```

**Step 2: Commit**

```bash
git add Packs/pai-core-install/src/skills/CORE/docs/HEARTBEAT.md
git commit -m "docs: add HEARTBEAT.md documenting IronClaw-PAI daemon pattern"
```

---

## Phase 1: State Bridge

### Task 3: Create daemon-state Library

**Files:**
- Create: `Packs/pai-telos-skill/src/DashboardTemplate/lib/daemon-state.ts`

**Context:** Server-side library for reading `daemon-state.json`. Used by the dashboard to show heartbeat status. Similar pattern to `lib/cc-mirror.ts` — reads from a well-known file path, returns safe typed data.

**Step 1: Write the library**

```typescript
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
```

**Step 2: Verify it compiles**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx tsc --noEmit lib/daemon-state.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/lib/daemon-state.ts
git commit -m "feat: add daemon-state library for reading heartbeat state"
```

---

### Task 4: Create Daemon State API Route

**Files:**
- Create: `Packs/pai-telos-skill/src/DashboardTemplate/app/api/pai/heartbeat/route.ts`

**Context:** GET endpoint returning the current daemon state. Follows the same pattern as `app/api/cc-mirror/variants/route.ts` — `force-dynamic`, try/catch, `NextResponse.json`.

**Step 1: Write the API route**

```typescript
import { NextResponse } from "next/server"
import { readDaemonState, isHeartbeatStale } from "@/lib/daemon-state"

export const dynamic = "force-dynamic"

/** GET /api/pai/heartbeat — return latest daemon heartbeat state. */
export async function GET() {
  try {
    const state = readDaemonState()
    if (!state) {
      return NextResponse.json({
        configured: false,
        state: null,
        stale: false,
      })
    }

    return NextResponse.json({
      configured: true,
      state,
      stale: isHeartbeatStale(state),
    })
  } catch (error) {
    console.error("Failed to read daemon state:", error)
    return NextResponse.json(
      { error: "Failed to read daemon state" },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build`
Expected: Compiles with 0 errors (new route appears in build output)

**Step 3: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/app/api/pai/heartbeat/route.ts
git commit -m "feat: add GET /api/pai/heartbeat endpoint for daemon state"
```

---

## Phase 2: Dashboard Bridges

### Task 5: Install Radix Tabs and Create Tabs UI Component

**Files:**
- Create: `Packs/pai-telos-skill/src/DashboardTemplate/components/ui/tabs.tsx`

**Context:** The dashboard uses Radix UI primitives (see `@radix-ui/react-slot` in `package.json`). The Memory, Logs, and Settings pages need tab navigation to show both PAI and IronClaw views. No tabs component exists yet — create one following the same pattern as `components/ui/button.tsx` (Radix primitive + CVA + cn utility).

**Step 1: Install Radix Tabs**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && bun add @radix-ui/react-tabs`

**Step 2: Create the tabs component**

```tsx
"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-500 dark:bg-[#1a1d2e] dark:text-gray-400",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2e7de9] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-[#2e7de9] data-[state=active]:shadow-sm dark:ring-offset-[#12141f] dark:data-[state=active]:bg-[#12141f] dark:data-[state=active]:text-[#5a9ef5]",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2e7de9] focus-visible:ring-offset-2 dark:ring-offset-[#12141f]",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

**Step 3: Verify it compiles**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx tsc --noEmit components/ui/tabs.tsx`
Expected: No errors

**Step 4: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/components/ui/tabs.tsx Packs/pai-telos-skill/src/DashboardTemplate/bun.lock Packs/pai-telos-skill/src/DashboardTemplate/package.json
git commit -m "feat: add Radix Tabs UI component for bridged dashboard views"
```

---

### Task 6: Create PAI Memory API Route

**Files:**
- Create: `Packs/pai-telos-skill/src/DashboardTemplate/app/api/pai/memory/route.ts`

**Context:** Reads PAI's native memory from `~/.claude/MEMORY/LEARNING/learnings.jsonl` and the LEARNING subdirectories (ALGORITHM, SYSTEM, FAILURES, SYNTHESIS). Returns structured data the dashboard can display. Does NOT touch IronClaw memory — that stays on the existing proxy.

**Step 1: Write the API route**

```typescript
import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"

export const dynamic = "force-dynamic"

const MEMORY_BASE = path.join(os.homedir(), ".claude", "MEMORY")
const LEARNINGS_FILE = path.join(MEMORY_BASE, "LEARNING", "learnings.jsonl")

interface PAILearning {
  id: string
  text: string
  concept?: string
  tier?: string
  timestamp?: string
  source?: string
}

interface PAIMemoryFile {
  name: string
  path: string
  category: string
}

/** GET /api/pai/memory — list PAI native memory entries. */
export async function GET() {
  try {
    const learnings: PAILearning[] = []
    const files: PAIMemoryFile[] = []

    // Read structured learnings from JSONL
    if (fs.existsSync(LEARNINGS_FILE)) {
      const raw = fs.readFileSync(LEARNINGS_FILE, "utf-8")
      const lines = raw.split("\n").filter((l) => l.trim())
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as PAILearning
          learnings.push(entry)
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Scan LEARNING subdirectories for markdown files
    const categories = ["ALGORITHM", "SYSTEM", "FAILURES", "SYNTHESIS"]
    for (const cat of categories) {
      const catDir = path.join(MEMORY_BASE, "LEARNING", cat)
      if (!fs.existsSync(catDir)) continue
      const entries = fs.readdirSync(catDir, { withFileTypes: true, recursive: true })
      for (const entry of entries) {
        if (entry.isDirectory()) continue
        if (!entry.name.endsWith(".md")) continue
        const relPath = path.relative(MEMORY_BASE, path.join(catDir, entry.name))
        files.push({
          name: entry.name,
          path: relPath,
          category: cat,
        })
      }
    }

    return NextResponse.json({
      learningCount: learnings.length,
      learnings: learnings.slice(-50), // Last 50
      fileCount: files.length,
      files,
    })
  } catch (error) {
    console.error("Failed to read PAI memory:", error)
    return NextResponse.json(
      { error: "Failed to read PAI memory" },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build`
Expected: Compiles, new `/api/pai/memory` route in output

**Step 3: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/app/api/pai/memory/route.ts
git commit -m "feat: add GET /api/pai/memory for PAI native memory data"
```

---

### Task 7: Create PAI Logs API Route

**Files:**
- Create: `Packs/pai-telos-skill/src/DashboardTemplate/app/api/pai/logs/route.ts`

**Context:** Reads PAI's debug logs from `~/.claude/debug/` directory. Returns the most recent log entries. IronClaw logs stay on their SSE-based proxy (`/api/ironclaw/logs/events`).

**Step 1: Write the API route**

```typescript
import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"

export const dynamic = "force-dynamic"

const DEBUG_DIR = path.join(os.homedir(), ".claude", "debug")

interface PAILogEntry {
  timestamp: string
  level: string
  message: string
  source: string
}

/** GET /api/pai/logs — return recent PAI debug log entries. */
export async function GET() {
  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      return NextResponse.json({ entries: [], total: 0 })
    }

    // Find log files sorted by modification time (newest first)
    const logFiles = fs.readdirSync(DEBUG_DIR)
      .filter((f) => f.endsWith(".log") || f.endsWith(".jsonl"))
      .map((f) => ({
        name: f,
        mtime: fs.statSync(path.join(DEBUG_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 5) // Last 5 log files

    const entries: PAILogEntry[] = []

    for (const file of logFiles) {
      const content = fs.readFileSync(path.join(DEBUG_DIR, file.name), "utf-8")
      const lines = content.split("\n").filter((l) => l.trim()).slice(-100) // Last 100 lines per file

      for (const line of lines) {
        // Try JSON parse first
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>
          entries.push({
            timestamp: (parsed.timestamp as string) || new Date(file.mtime).toISOString(),
            level: (parsed.level as string) || "info",
            message: (parsed.message as string) || line,
            source: file.name,
          })
          continue
        } catch {
          // Not JSON — treat as plain text log line
        }

        // Plain text: try to extract timestamp and level from common formats
        // e.g., "2026-02-17T00:11:48Z [INFO] message"
        const match = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\S*)\s+\[?(\w+)]?\s+(.+)/)
        if (match) {
          entries.push({
            timestamp: match[1] ?? new Date(file.mtime).toISOString(),
            level: (match[2] ?? "info").toLowerCase(),
            message: match[3] ?? line,
            source: file.name,
          })
        } else {
          entries.push({
            timestamp: new Date(file.mtime).toISOString(),
            level: "info",
            message: line,
            source: file.name,
          })
        }
      }
    }

    // Sort by timestamp descending, return last 500
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    return NextResponse.json({
      entries: entries.slice(0, 500),
      total: entries.length,
    })
  } catch (error) {
    console.error("Failed to read PAI logs:", error)
    return NextResponse.json(
      { error: "Failed to read PAI logs" },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build`
Expected: Compiles with 0 errors

**Step 3: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/app/api/pai/logs/route.ts
git commit -m "feat: add GET /api/pai/logs for PAI debug log entries"
```

---

### Task 8: Create PAI Settings API Route

**Files:**
- Create: `Packs/pai-telos-skill/src/DashboardTemplate/app/api/pai/settings/route.ts`

**Context:** Reads PAI's settings from `~/.claude/settings.json` and `~/.claude/settings.local.json`. Returns safe keys only (no auth tokens). IronClaw settings stay on their existing proxy.

**Step 1: Write the API route**

```typescript
import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"

export const dynamic = "force-dynamic"

const CLAUDE_DIR = path.join(os.homedir(), ".claude")
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json")
const LOCAL_SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.local.json")

/** Keys that are safe to expose to the dashboard. Never expose auth tokens. */
const SAFE_KEYS = new Set([
  "principal",
  "daidentity",
  "model",
  "theme",
  "permissions",
  "preferredNotifType",
])

/** Sensitive key patterns to always exclude. */
const SENSITIVE_PATTERNS = [/token/i, /secret/i, /password/i, /key/i, /auth/i]

function isSafeKey(key: string): boolean {
  if (SENSITIVE_PATTERNS.some((p) => p.test(key))) return false
  return true
}

interface SettingsFile {
  [key: string]: unknown
}

function readSettings(filePath: string): SettingsFile {
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SettingsFile
  } catch {
    return {}
  }
}

/** GET /api/pai/settings — return safe PAI settings (no auth tokens). */
export async function GET() {
  try {
    const global = readSettings(SETTINGS_FILE)
    const local = readSettings(LOCAL_SETTINGS_FILE)

    // Filter to safe keys only
    const safeGlobal: SettingsFile = {}
    for (const [key, value] of Object.entries(global)) {
      if (isSafeKey(key)) safeGlobal[key] = value
    }

    const safeLocal: SettingsFile = {}
    for (const [key, value] of Object.entries(local)) {
      if (isSafeKey(key)) safeLocal[key] = value
    }

    return NextResponse.json({
      global: safeGlobal,
      local: safeLocal,
      globalPath: SETTINGS_FILE,
      localPath: LOCAL_SETTINGS_FILE,
    })
  } catch (error) {
    console.error("Failed to read PAI settings:", error)
    return NextResponse.json(
      { error: "Failed to read PAI settings" },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build`
Expected: Compiles with 0 errors

**Step 3: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/app/api/pai/settings/route.ts
git commit -m "feat: add GET /api/pai/settings for safe PAI config display"
```

---

### Task 9: Bridge the Memory Page with Tabs

**Files:**
- Modify: `Packs/pai-telos-skill/src/DashboardTemplate/app/memory/page.tsx` (rewrite ~240 lines → ~310 lines)

**Context:** The existing memory page (line 1-239) shows only IronClaw memory. Transform it into a tabbed view: "PAI Memory" tab (reads `/api/pai/memory`) and "IronClaw Memory" tab (keeps existing tree browser). The IronClaw tab preserves all existing behavior including the `FileTree` component, edit/save, and offline handling.

**Step 1: Rewrite the memory page with tabs**

The full page has two tabs. The IronClaw tab contains all the existing code from `MemoryPage` (the tree browser with edit/save). The PAI tab shows learnings from JSONL + markdown file listing.

Key changes:
- Add imports: `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`
- Add `Brain` icon from lucide-react for the PAI tab
- Add state for PAI memory data: `paiLearnings`, `paiFiles`, `paiLoading`
- Fetch `/api/pai/memory` on mount alongside the existing IronClaw fetch
- Default tab: "pai" (since PAI memory works even when IronClaw is offline)

```tsx
// New imports to ADD at top (keep all existing imports):
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Brain } from "lucide-react"  // ADD to existing lucide import
```

**Structure:**

```
<Tabs defaultValue="pai">
  <TabsList>
    <TabsTrigger value="pai">PAI Memory</TabsTrigger>
    <TabsTrigger value="ironclaw">IronClaw Memory</TabsTrigger>
  </TabsList>
  <TabsContent value="pai">
    {/* Learnings list + file listing from /api/pai/memory */}
  </TabsContent>
  <TabsContent value="ironclaw">
    {/* Existing tree browser — ALL existing code moves here unchanged */}
  </TabsContent>
</Tabs>
```

**PAI Memory tab content:**

```tsx
// Inside TabsContent value="pai"
{paiLoading ? (
  <div className="flex items-center justify-center py-16 text-gray-400">Loading...</div>
) : (
  <div className="space-y-6">
    {/* Recent Learnings */}
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Brain className="h-5 w-5 text-[#9854f1]" />
          Recent Learnings
          <Badge variant="secondary">{paiLearnings.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {paiLearnings.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No learnings captured yet</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {paiLearnings.map((learning, idx) => (
              <div key={learning.id || idx} className="p-3 border rounded-lg dark:border-gray-700">
                <p className="text-sm text-gray-700 dark:text-gray-300">{learning.text}</p>
                <div className="flex gap-2 mt-2">
                  {learning.concept && <Badge variant="secondary" className="text-[10px]">{learning.concept}</Badge>}
                  {learning.tier && <Badge variant="secondary" className="text-[10px]">{learning.tier}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Memory Files by Category */}
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Memory Files</CardTitle>
      </CardHeader>
      <CardContent>
        {paiFiles.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No memory files found</p>
        ) : (
          <div className="space-y-1">
            {paiFiles.map((file) => (
              <div key={file.path} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <Badge variant="secondary" className="text-[10px] w-20 justify-center">{file.category}</Badge>
                <span className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  </div>
)}
```

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build`
Expected: Compiles with 0 errors. Memory page route still present.

**Step 3: Manual verification**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && bun dev`
Navigate to `/memory` — should see two tabs. PAI Memory tab shows learnings. IronClaw Memory tab shows tree browser (or offline message).

**Step 4: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/app/memory/page.tsx
git commit -m "feat: bridge Memory page with PAI + IronClaw tabs"
```

---

### Task 10: Bridge the Logs Page with Tabs

**Files:**
- Modify: `Packs/pai-telos-skill/src/DashboardTemplate/app/logs/page.tsx` (rewrite ~247 lines → ~330 lines)

**Context:** The existing logs page (line 1-247) shows only IronClaw SSE logs. Transform it into a tabbed view: "PAI Logs" tab (reads `/api/pai/logs`, static list with refresh) and "IronClaw Logs" tab (keeps existing SSE stream with pause/play/filter). The IronClaw tab preserves ALL existing behavior.

**Step 1: Rewrite the logs page with tabs**

Key changes:
- Add imports: `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`
- Add `RefreshCw` icon from lucide-react for PAI logs refresh button
- Add state: `paiLogs`, `paiLoading`, `paiLevelFilter`
- Fetch `/api/pai/logs` on mount
- Default tab: "ironclaw" (since live streaming is the primary use case)

**PAI Logs tab content:**

```tsx
// Inside TabsContent value="pai"
<Card className="mb-4">
  <CardContent className="pt-4 pb-4">
    <div className="flex items-center gap-4">
      <select
        value={paiLevelFilter}
        onChange={(e) => setPaiLevelFilter(e.target.value)}
        className="px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/40 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200"
      >
        <option value="all">All levels</option>
        <option value="debug">Debug</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
      </select>
      <Button size="sm" onClick={fetchPaiLogs} disabled={paiLoading}>
        <RefreshCw className={cn("h-3.5 w-3.5 mr-1", paiLoading && "animate-spin")} />
        Refresh
      </Button>
      <Badge variant="secondary">{filteredPaiLogs.length} entries</Badge>
    </div>
  </CardContent>
</Card>
{/* Same log entry rendering pattern as IronClaw tab */}
```

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build`
Expected: Compiles with 0 errors

**Step 3: Manual verification**

Navigate to `/logs` — two tabs. IronClaw Logs tab streams live. PAI Logs tab shows debug log entries with refresh.

**Step 4: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/app/logs/page.tsx
git commit -m "feat: bridge Logs page with PAI + IronClaw tabs"
```

---

### Task 11: Bridge the Settings Page with Tabs

**Files:**
- Modify: `Packs/pai-telos-skill/src/DashboardTemplate/app/settings/page.tsx` (rewrite ~337 lines → ~420 lines)

**Context:** The existing settings page (line 1-337) shows only IronClaw settings with CRUD + import/export. Transform it into a tabbed view: "PAI Settings" tab (reads `/api/pai/settings`, read-only display of safe config) and "IronClaw Settings" tab (keeps ALL existing behavior including add/edit/delete/import/export). The IronClaw tab preserves everything unchanged.

**Step 1: Rewrite the settings page with tabs**

Key changes:
- Add imports: `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`
- Add state: `paiSettings`, `paiLoading`
- Fetch `/api/pai/settings` on mount
- Default tab: "ironclaw" (since CRUD is the primary use case)

**PAI Settings tab content:**

```tsx
// Inside TabsContent value="pai"
{paiLoading ? (
  <div className="flex items-center justify-center py-16 text-gray-400">Loading...</div>
) : (
  <div className="space-y-6">
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Global Settings</CardTitle>
        <p className="text-xs text-gray-400 font-mono mt-1">{paiSettings.globalPath}</p>
      </CardHeader>
      <CardContent>
        {Object.keys(paiSettings.global).length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No global settings</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(paiSettings.global).map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell className="font-mono text-sm">{key}</TableCell>
                  <TableCell className="text-sm">
                    {typeof value === "object" ? (
                      <pre className="text-xs bg-gray-50 dark:bg-[#0f1117] p-2 rounded max-h-24 overflow-y-auto">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      String(value)
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>

    {/* Same pattern for local settings */}
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Local Settings</CardTitle>
        <p className="text-xs text-gray-400 font-mono mt-1">{paiSettings.localPath}</p>
      </CardHeader>
      <CardContent>
        {/* Same Table pattern as global */}
      </CardContent>
    </Card>
  </div>
)}
```

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build`
Expected: Compiles with 0 errors

**Step 3: Manual verification**

Navigate to `/settings` — two tabs. IronClaw Settings works exactly as before. PAI Settings shows read-only config tables.

**Step 4: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/app/settings/page.tsx
git commit -m "feat: bridge Settings page with PAI + IronClaw tabs"
```

---

### Task 12: Add SSE Circuit Breaker (RedTeam Fix)

**Files:**
- Modify: `Packs/pai-telos-skill/src/DashboardTemplate/lib/use-ironclaw-sse.ts` (55 lines → ~75 lines)

**Context:** RedTeam flagged the SSE reconnect loop as MEDIUM risk — it retries every 3 seconds indefinitely with no backoff, which can hammer IronClaw if it's flapping. Add exponential backoff with a max retry cap.

**Step 1: Add backoff to the SSE hook**

Modify `use-ironclaw-sse.ts` to track retry count and use exponential backoff:

```typescript
// Add inside the hook, before connect():
const retryCountRef = useRef(0)
const MAX_RETRIES = 10
const BASE_DELAY = 3000 // 3s

// Replace the onerror handler's setTimeout:
es.onerror = () => {
  es.close()
  retryCountRef.current += 1
  if (retryCountRef.current > MAX_RETRIES) return // Stop after max retries
  const delay = Math.min(BASE_DELAY * Math.pow(2, retryCountRef.current - 1), 60000) // Cap at 60s
  setTimeout(() => {
    if (enabled) connect()
  }, delay)
}

// Reset retry count on successful connection:
es.onopen = () => {
  retryCountRef.current = 0
}
```

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build`
Expected: Compiles with 0 errors

**Step 3: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/lib/use-ironclaw-sse.ts
git commit -m "fix: add exponential backoff to SSE reconnect (RedTeam MEDIUM fix)"
```

---

### Task 13: Update Page Descriptions in Sidebar and Headers

**Files:**
- Modify: `Packs/pai-telos-skill/src/DashboardTemplate/app/memory/page.tsx` (header text only)
- Modify: `Packs/pai-telos-skill/src/DashboardTemplate/app/logs/page.tsx` (header text only)
- Modify: `Packs/pai-telos-skill/src/DashboardTemplate/app/settings/page.tsx` (header text only)

**Context:** The page headers currently say "IronClaw memory and knowledge base", "System logs and audit trail", "IronClaw configuration and preferences". Update to reflect unified views.

**Step 1: Update header descriptions**

Memory page `<p>` tag (line 143 in current file):
- Old: `IronClaw memory and knowledge base`
- New: `PAI and IronClaw memory systems`

Logs page `<p>` tag (line 152 in current file):
- Old: `System logs and audit trail`
- New: `PAI debug logs and IronClaw system logs`

Settings page `<p>` tag (line 177 in current file):
- Old: `IronClaw configuration and preferences`
- New: `PAI and IronClaw configuration`

**Step 2: Commit**

```bash
git add Packs/pai-telos-skill/src/DashboardTemplate/app/memory/page.tsx Packs/pai-telos-skill/src/DashboardTemplate/app/logs/page.tsx Packs/pai-telos-skill/src/DashboardTemplate/app/settings/page.tsx
git commit -m "chore: update page descriptions for unified PAI + IronClaw views"
```

---

### Task 14: Full Build Verification

**Files:** None (verification only)

**Step 1: Run the full build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build`
Expected: Compiles with 0 errors. All routes present:
- `/api/pai/heartbeat`
- `/api/pai/memory`
- `/api/pai/logs`
- `/api/pai/settings`
- All existing routes unchanged

**Step 2: Verify no regressions**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && bun dev`

Check each bridged page:
- `/memory` — Two tabs. PAI Memory loads. IronClaw Memory loads (or shows offline).
- `/logs` — Two tabs. IronClaw Logs streams (or offline). PAI Logs shows debug entries.
- `/settings` — Two tabs. IronClaw Settings has full CRUD. PAI Settings shows read-only config.
- `/inference` — Still works (CC-Mirror variants).
- `/agents` — Still works (IronClaw proxy).
- `/` — Overview still loads.

**Step 3: Commit summary**

No commit needed — this is a verification step.

---

## Phase 3-4: Future Tasks (Skeleton Only)

These phases are documented in the design doc but not detailed here. They should get their own implementation plans when Phase 2 is complete.

### Phase 3: Anti-Corruption Layer
- Create `types/pai.ts` with PAI-owned type definitions
- Create `lib/pai-adapters.ts` with mapping functions from IronClaw types
- Migrate dashboard components to use PAI types
- Confine IronClaw types to `lib/ironclaw.ts` proxy layer

### Phase 4: Security Hierarchy
- Create policy compiler (IronClaw constraints + SecurityValidator rules)
- Add `PAI_DEPLOY_CONTEXT=daemon` handling to SecurityValidator
- Create build-time validator for policy conflicts

---

## File Summary

| Task | File | Action | Est. LOC |
|------|------|--------|----------|
| 1 | `Tools/heartbeat-triage.sh` | CREATE | ~60 |
| 2 | `docs/HEARTBEAT.md` | CREATE | ~45 |
| 3 | `lib/daemon-state.ts` | CREATE | ~35 |
| 4 | `app/api/pai/heartbeat/route.ts` | CREATE | ~30 |
| 5 | `components/ui/tabs.tsx` | CREATE | ~55 |
| 6 | `app/api/pai/memory/route.ts` | CREATE | ~70 |
| 7 | `app/api/pai/logs/route.ts` | CREATE | ~80 |
| 8 | `app/api/pai/settings/route.ts` | CREATE | ~65 |
| 9 | `app/memory/page.tsx` | MODIFY | +70 |
| 10 | `app/logs/page.tsx` | MODIFY | +80 |
| 11 | `app/settings/page.tsx` | MODIFY | +80 |
| 12 | `lib/use-ironclaw-sse.ts` | MODIFY | +20 |
| 13 | 3 page headers | MODIFY | +3 |
| 14 | (verification only) | — | — |

**Total: 8 new files, 6 modified. ~690 LOC across Phases 0-2.**
