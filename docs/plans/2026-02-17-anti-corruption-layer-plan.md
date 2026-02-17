# Anti-Corruption Layer (Phase 3) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decouple all dashboard pages from IronClaw types by introducing PAI-owned types and server-side mappers, enabling selective IronClaw updates.

**Architecture:** Create `types/pai.ts` (PAI vocabulary), `lib/mappers.ts` (IronClaw→PAI translation), new `/api/pai/*` routes that return mapped data, then migrate each page to consume PAI types only.

**Tech Stack:** TypeScript (strict mode), Next.js 15 API routes, existing `lib/ironclaw.ts` proxy

---

All paths relative to `Packs/pai-telos-skill/src/DashboardTemplate/`.

### Task 1: Create PAI Type Definitions

**Files:**
- Create: `types/pai.ts`

**Step 1: Create the PAI types file**

This file defines PAI's own vocabulary for all 8 IronClaw domains. These are the shapes the dashboard will consume — decoupled from IronClaw's API shape.

```typescript
// types/pai.ts

// === Agents (mapped from IronClaw Jobs) ===

export type AgentStatus = "pending" | "in_progress" | "completed" | "failed" | "stuck"

export interface PAIAgent {
  id: string
  title: string
  status: AgentStatus
  userId: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  elapsedSecs?: number
}

export interface AgentSummary {
  total: number
  pending: number
  inProgress: number
  completed: number
  failed: number
  stuck: number
}

export interface PAIAgentDetail extends PAIAgent {
  description: string
  projectDir?: string
  browseUrl?: string
  mode?: string
  transitions: AgentTransition[]
}

export interface AgentTransition {
  from: string
  to: string
  timestamp: string
  reason?: string
}

export interface AgentEvent {
  agentId: string
  eventType: string
  data: unknown
  timestamp: string
}

// === Routines (mapped from IronClaw Routines) ===

export type PAIRoutineStatus = "active" | "enabled" | "disabled" | "failing"

export interface PAIRoutine {
  id: string
  name: string
  description: string
  enabled: boolean
  triggerType: string
  triggerSummary: string
  actionType: "lightweight" | "full_job"
  lastRunAt?: string
  nextFireAt?: string
  runCount: number
  consecutiveFailures: number
  status: PAIRoutineStatus
  source: "ironclaw" | "pai"
}

export interface PAIRoutineSummary {
  total: number
  enabled: number
  disabled: number
  failing: number
  runsToday: number
}

export interface PAIRoutineDetail extends PAIRoutine {
  trigger: Record<string, unknown>
  action: Record<string, unknown>
  guardrails: Record<string, unknown>
  notify: Record<string, unknown>
  createdAt: string
  recentRuns: PAIRoutineRun[]
}

export interface PAIRoutineRun {
  id: string
  triggerType: string
  startedAt: string
  completedAt?: string
  status: string
  resultSummary?: string
  tokensUsed?: number
}

// === Chat (mapped from IronClaw Chat) ===

export interface PAIChatThread {
  id: string
  state: string
  turnCount: number
  createdAt: string
  updatedAt: string
  title?: string
  threadType?: "assistant" | "thread"
}

export interface PAIChatMessage {
  turnNumber: number
  userInput: string
  response?: string
  state: string
  startedAt: string
  completedAt?: string
  toolCalls: { name: string; hasResult: boolean; hasError: boolean }[]
}

// === SSE Events (mapped from IronClaw SSE) ===

export type PAIStreamEventType =
  | "response"
  | "thinking"
  | "tool_started"
  | "tool_completed"
  | "tool_result"
  | "stream_chunk"
  | "status"
  | "job_started"
  | "job_message"
  | "job_tool_use"
  | "job_tool_result"
  | "job_status"
  | "job_result"
  | "approval_needed"
  | "auth_required"
  | "auth_completed"
  | "error"
  | "heartbeat"

export interface PAIStreamEvent {
  type: PAIStreamEventType
  data: Record<string, unknown>
}

// === Extensions (mapped from IronClaw Extensions) ===

export interface PAIExtension {
  name: string
  kind: string
  description?: string
  url?: string
  authenticated: boolean
  active: boolean
  tools: string[]
}

// === Memory (PAI-owned, already used in Phase 2 bridge) ===

export interface PAIMemoryEntry {
  path: string
  isDir: boolean
}

export interface PAIMemoryNode {
  name: string
  path: string
  isDir: boolean
  children: PAIMemoryNode[]
}

export interface PAIMemoryContent {
  path: string
  content: string
  updatedAt: string
}

// === Logs (PAI-owned, already used in Phase 2 bridge) ===

export type PAILogLevel = "trace" | "debug" | "info" | "warn" | "error"

export interface PAILogEntry {
  timestamp: string
  level: PAILogLevel
  target: string
  message: string
  fields?: Record<string, unknown>
}

// === Settings (PAI-owned, already used in Phase 2 bridge) ===

export interface PAISetting {
  key: string
  value: unknown
  updatedAt?: string
  description?: string
}

export interface PAISettingsExport {
  settings: Record<string, string>
}

// === Generic ===

export interface PAIActionResponse {
  success: boolean
  message?: string
}

// === Gateway ===

export interface PAIGatewayStatus {
  sseConnections: number
  wsConnections: number
  totalConnections: number
}
```

**Step 2: Verify the file compiles**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx tsc --noEmit types/pai.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add types/pai.ts
git commit -m "feat(acl): add PAI-owned type definitions for all 8 domains"
```

---

### Task 2: Create Mapper Functions

**Files:**
- Create: `lib/mappers.ts`

**Step 1: Create the mapper file**

Pure functions converting IronClaw types to PAI types. Import IronClaw types on the left, export PAI types on the right. This is the ONE file that changes when IronClaw updates its API.

```typescript
// lib/mappers.ts

import type {
  Job, JobDetail, JobSummary, JobTransition, JobEvent,
  Routine, RoutineDetail, RoutineSummary, RoutineRun,
  ChatThread, ChatTurn,
  SSEEvent,
  Extension,
  MemoryEntry, MemoryNode, MemoryContent,
  LogEntry,
  Setting, SettingsExport,
  ActionResponse,
  GatewayStatus,
} from "@/types/ironclaw"

import type {
  PAIAgent, PAIAgentDetail, AgentSummary, AgentTransition, AgentEvent,
  PAIRoutine, PAIRoutineDetail, PAIRoutineSummary, PAIRoutineRun,
  PAIChatThread, PAIChatMessage,
  PAIStreamEvent,
  PAIExtension,
  PAIMemoryEntry, PAIMemoryNode, PAIMemoryContent,
  PAILogEntry,
  PAISetting, PAISettingsExport,
  PAIActionResponse,
  PAIGatewayStatus,
} from "@/types/pai"

// === Agents ===

export function toAgent(ic: Job): PAIAgent {
  return {
    id: ic.id,
    title: ic.title,
    status: ic.state,
    userId: ic.user_id,
    createdAt: ic.created_at,
    startedAt: ic.started_at,
    completedAt: ic.completed_at,
    elapsedSecs: ic.elapsed_secs,
  }
}

export function toAgentDetail(ic: JobDetail): PAIAgentDetail {
  return {
    ...toAgent(ic),
    description: ic.description,
    projectDir: ic.project_dir,
    browseUrl: ic.browse_url,
    mode: ic.job_mode,
    transitions: ic.transitions.map(toAgentTransition),
  }
}

export function toAgentSummary(ic: JobSummary): AgentSummary {
  return {
    total: ic.total,
    pending: ic.pending,
    inProgress: ic.in_progress,
    completed: ic.completed,
    failed: ic.failed,
    stuck: ic.stuck,
  }
}

function toAgentTransition(ic: JobTransition): AgentTransition {
  return { from: ic.from, to: ic.to, timestamp: ic.timestamp, reason: ic.reason }
}

export function toAgentEvent(ic: JobEvent): AgentEvent {
  return {
    agentId: ic.job_id,
    eventType: ic.event_type,
    data: ic.data,
    timestamp: ic.timestamp,
  }
}

// === Routines ===

export function toRoutine(ic: Routine): PAIRoutine {
  return {
    id: ic.id,
    name: ic.name,
    description: ic.description,
    enabled: ic.enabled,
    triggerType: ic.trigger_type,
    triggerSummary: ic.trigger_summary,
    actionType: ic.action_type,
    lastRunAt: ic.last_run_at,
    nextFireAt: ic.next_fire_at,
    runCount: ic.run_count,
    consecutiveFailures: ic.consecutive_failures,
    status: ic.status,
    source: "ironclaw",
  }
}

export function toRoutineDetail(ic: RoutineDetail): PAIRoutineDetail {
  return {
    ...toRoutine(ic),
    trigger: ic.trigger,
    action: ic.action,
    guardrails: ic.guardrails,
    notify: ic.notify,
    createdAt: ic.created_at,
    recentRuns: ic.recent_runs.map(toRoutineRun),
  }
}

export function toRoutineSummary(ic: RoutineSummary): PAIRoutineSummary {
  return {
    total: ic.total,
    enabled: ic.enabled,
    disabled: ic.disabled,
    failing: ic.failing,
    runsToday: ic.runs_today,
  }
}

function toRoutineRun(ic: RoutineRun): PAIRoutineRun {
  return {
    id: ic.id,
    triggerType: ic.trigger_type,
    startedAt: ic.started_at,
    completedAt: ic.completed_at,
    status: ic.status,
    resultSummary: ic.result_summary,
    tokensUsed: ic.tokens_used,
  }
}

// === Chat ===

export function toChatThread(ic: ChatThread): PAIChatThread {
  return {
    id: ic.id,
    state: ic.state,
    turnCount: ic.turn_count,
    createdAt: ic.created_at,
    updatedAt: ic.updated_at,
    title: ic.title,
    threadType: ic.thread_type,
  }
}

export function toChatMessage(ic: ChatTurn): PAIChatMessage {
  return {
    turnNumber: ic.turn_number,
    userInput: ic.user_input,
    response: ic.response,
    state: ic.state,
    startedAt: ic.started_at,
    completedAt: ic.completed_at,
    toolCalls: ic.tool_calls.map(t => ({
      name: t.name,
      hasResult: t.has_result,
      hasError: t.has_error,
    })),
  }
}

// === SSE ===

export function toStreamEvent(ic: SSEEvent): PAIStreamEvent {
  return { type: ic.type, data: ic.data }
}

// === Extensions ===

export function toExtension(ic: Extension): PAIExtension {
  return {
    name: ic.name,
    kind: ic.kind,
    description: ic.description,
    url: ic.url,
    authenticated: ic.authenticated,
    active: ic.active,
    tools: ic.tools,
  }
}

// === Memory ===

export function toMemoryEntry(ic: MemoryEntry): PAIMemoryEntry {
  return { path: ic.path, isDir: ic.is_dir }
}

export function toMemoryNode(ic: MemoryNode): PAIMemoryNode {
  return {
    name: ic.name,
    path: ic.path,
    isDir: ic.is_dir,
    children: ic.children.map(toMemoryNode),
  }
}

export function toMemoryContent(ic: MemoryContent): PAIMemoryContent {
  return { path: ic.path, content: ic.content, updatedAt: ic.updated_at }
}

// === Logs ===

export function toLogEntry(ic: LogEntry): PAILogEntry {
  return {
    timestamp: ic.timestamp,
    level: ic.level,
    target: ic.target,
    message: ic.message,
    fields: ic.fields,
  }
}

// === Settings ===

export function toSetting(ic: Setting): PAISetting {
  return {
    key: ic.key,
    value: ic.value,
    updatedAt: ic.updated_at,
    description: ic.description,
  }
}

export function toSettingsExport(ic: SettingsExport): PAISettingsExport {
  return { settings: ic.settings }
}

// === Generic ===

export function toActionResponse(ic: ActionResponse): PAIActionResponse {
  return { success: ic.success, message: ic.message }
}

export function toGatewayStatus(ic: GatewayStatus): PAIGatewayStatus {
  return {
    sseConnections: ic.sse_connections,
    wsConnections: ic.ws_connections,
    totalConnections: ic.total_connections,
  }
}
```

**Step 2: Verify compilation**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/mappers.ts
git commit -m "feat(acl): add IronClaw-to-PAI mapper functions"
```

---

### Task 3: Create PAI Agents API Routes

**Files:**
- Create: `app/api/pai/agents/route.ts`
- Create: `app/api/pai/agents/[id]/route.ts`

**Step 1: Create the agents list route**

```typescript
// app/api/pai/agents/route.ts
import { NextResponse } from "next/server"
import { ironclawFetch } from "@/lib/ironclaw"
import { toAgent, toAgentSummary } from "@/lib/mappers"
import type { Job, JobSummary } from "@/types/ironclaw"

export const dynamic = "force-dynamic"

/** GET /api/pai/agents — return agents with optional status filter and summary. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const limit = searchParams.get("limit")
    const includeSummary = searchParams.get("summary") !== "false"

    // Build IronClaw query
    const params = new URLSearchParams()
    if (status) params.set("status", status)
    if (limit) params.set("limit", limit)
    const query = params.toString() ? `?${params.toString()}` : ""

    const results: { agents: unknown[]; summary: unknown } = { agents: [], summary: null }

    const [jobsRes, summaryRes] = await Promise.all([
      ironclawFetch(`/api/jobs${query}`),
      includeSummary ? ironclawFetch("/api/jobs/summary") : null,
    ])

    if (!jobsRes.ok) {
      return NextResponse.json({ agents: [], summary: null, offline: true })
    }

    const jobsRaw: unknown = await jobsRes.json()
    const jobsList: Job[] = Array.isArray(jobsRaw)
      ? jobsRaw
      : (jobsRaw as Record<string, unknown>).jobs as Job[] ?? []
    results.agents = jobsList.map(toAgent)

    if (summaryRes?.ok) {
      const summaryData: JobSummary = await summaryRes.json()
      results.summary = toAgentSummary(summaryData)
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error("Failed to fetch agents:", error)
    return NextResponse.json({ agents: [], summary: null, offline: true })
  }
}
```

**Step 2: Create the agent detail route**

```typescript
// app/api/pai/agents/[id]/route.ts
import { NextResponse } from "next/server"
import { ironclawFetch } from "@/lib/ironclaw"
import { toAgentDetail, toAgentEvent, toActionResponse } from "@/lib/mappers"
import type { JobDetail, JobEvent, ActionResponse } from "@/types/ironclaw"

export const dynamic = "force-dynamic"

/** GET /api/pai/agents/:id — return agent detail with events. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const [jobRes, eventsRes] = await Promise.all([
      ironclawFetch(`/api/jobs/${id}`),
      ironclawFetch(`/api/jobs/${id}/events`),
    ])

    if (!jobRes.ok) {
      return NextResponse.json({ error: "Agent not found" }, { status: jobRes.status })
    }

    const jobData: JobDetail = await jobRes.json()
    const agent = toAgentDetail(jobData)

    let events: unknown[] = []
    if (eventsRes.ok) {
      const eventsData: JobEvent[] = await eventsRes.json()
      events = eventsData.map(toAgentEvent)
    }

    return NextResponse.json({ agent, events })
  } catch (error) {
    console.error("Failed to fetch agent detail:", error)
    return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 })
  }
}

/** DELETE /api/pai/agents/:id — cancel an agent. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await ironclawFetch(`/api/jobs/${id}`, { method: "DELETE" })
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to cancel agent" }, { status: res.status })
    }
    const data: ActionResponse = await res.json()
    return NextResponse.json(toActionResponse(data))
  } catch (error) {
    console.error("Failed to cancel agent:", error)
    return NextResponse.json({ error: "Failed to cancel agent" }, { status: 500 })
  }
}
```

**Step 3: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build 2>&1 | tail -5`
Expected: Build succeeds, routes `/api/pai/agents` and `/api/pai/agents/[id]` listed

**Step 4: Commit**

```bash
git add app/api/pai/agents/
git commit -m "feat(acl): add /api/pai/agents and /api/pai/agents/[id] routes"
```

---

### Task 4: Create PAI Routines API Routes

**Files:**
- Create: `app/api/pai/routines/route.ts`
- Create: `app/api/pai/routines/[id]/route.ts`

**Step 1: Create the routines list route**

```typescript
// app/api/pai/routines/route.ts
import { NextResponse } from "next/server"
import { ironclawFetch } from "@/lib/ironclaw"
import { toRoutine, toRoutineSummary } from "@/lib/mappers"
import type { Routine, RoutineSummary } from "@/types/ironclaw"

export const dynamic = "force-dynamic"

/** GET /api/pai/routines — return routines with summary. */
export async function GET() {
  try {
    const [routinesRes, summaryRes] = await Promise.all([
      ironclawFetch("/api/routines"),
      ironclawFetch("/api/routines/summary"),
    ])

    if (!routinesRes.ok) {
      return NextResponse.json({ routines: [], summary: null, offline: true })
    }

    const routinesRaw: unknown = await routinesRes.json()
    const routinesList: Routine[] = Array.isArray(routinesRaw)
      ? routinesRaw
      : (routinesRaw as Record<string, unknown>).routines as Routine[] ?? []

    const routines = routinesList.map(toRoutine)
    let summary = null

    if (summaryRes.ok) {
      const summaryData: RoutineSummary = await summaryRes.json()
      summary = toRoutineSummary(summaryData)
    }

    return NextResponse.json({ routines, summary })
  } catch (error) {
    console.error("Failed to fetch routines:", error)
    return NextResponse.json({ routines: [], summary: null, offline: true })
  }
}
```

**Step 2: Create the routine detail route**

```typescript
// app/api/pai/routines/[id]/route.ts
import { NextResponse } from "next/server"
import { ironclawFetch } from "@/lib/ironclaw"
import { toRoutineDetail, toActionResponse } from "@/lib/mappers"
import type { RoutineDetail, ActionResponse } from "@/types/ironclaw"

export const dynamic = "force-dynamic"

/** GET /api/pai/routines/:id — return routine detail. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await ironclawFetch(`/api/routines/${id}`)
    if (!res.ok) {
      return NextResponse.json({ error: "Routine not found" }, { status: res.status })
    }
    const data: RoutineDetail = await res.json()
    return NextResponse.json(toRoutineDetail(data))
  } catch (error) {
    console.error("Failed to fetch routine detail:", error)
    return NextResponse.json({ error: "Failed to fetch routine" }, { status: 500 })
  }
}

/** POST /api/pai/routines/:id/toggle — toggle routine enabled state. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const action = searchParams.get("action") // "toggle" | "trigger"

  const endpoint = action === "trigger"
    ? `/api/routines/${id}/trigger`
    : `/api/routines/${id}/toggle`

  try {
    const res = await ironclawFetch(endpoint, { method: "POST" })
    if (!res.ok) {
      return NextResponse.json({ error: `Failed to ${action} routine` }, { status: res.status })
    }
    const data: ActionResponse = await res.json()
    return NextResponse.json(toActionResponse(data))
  } catch (error) {
    console.error(`Failed to ${action} routine:`, error)
    return NextResponse.json({ error: `Failed to ${action} routine` }, { status: 500 })
  }
}

/** DELETE /api/pai/routines/:id — delete a routine. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await ironclawFetch(`/api/routines/${id}`, { method: "DELETE" })
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to delete routine" }, { status: res.status })
    }
    const data: ActionResponse = await res.json()
    return NextResponse.json(toActionResponse(data))
  } catch (error) {
    console.error("Failed to delete routine:", error)
    return NextResponse.json({ error: "Failed to delete routine" }, { status: 500 })
  }
}
```

**Step 3: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add app/api/pai/routines/
git commit -m "feat(acl): add /api/pai/routines and /api/pai/routines/[id] routes"
```

---

### Task 5: Create PAI Extensions and Summary API Routes

**Files:**
- Create: `app/api/pai/extensions/route.ts`
- Modify: `app/api/ironclaw/summary/route.ts` → Create: `app/api/pai/summary/route.ts`

**Step 1: Create the extensions route**

```typescript
// app/api/pai/extensions/route.ts
import { NextResponse } from "next/server"
import { ironclawFetch } from "@/lib/ironclaw"
import { toExtension } from "@/lib/mappers"
import type { Extension } from "@/types/ironclaw"

export const dynamic = "force-dynamic"

/** GET /api/pai/extensions — return mapped extensions list. */
export async function GET() {
  try {
    const res = await ironclawFetch("/api/extensions")
    if (!res.ok) {
      return NextResponse.json({ extensions: [], offline: true })
    }
    const raw: unknown = await res.json()
    const list: Extension[] = Array.isArray(raw)
      ? raw
      : (raw as Record<string, unknown>).extensions as Extension[] ?? []

    return NextResponse.json({ extensions: list.map(toExtension) })
  } catch (error) {
    console.error("Failed to fetch extensions:", error)
    return NextResponse.json({ extensions: [], offline: true })
  }
}
```

**Step 2: Create the PAI summary route**

```typescript
// app/api/pai/summary/route.ts
import { NextResponse } from "next/server"
import { getJobsSummary, getRoutinesSummary } from "@/lib/ironclaw"
import { toAgentSummary, toRoutineSummary } from "@/lib/mappers"

export const dynamic = "force-dynamic"

/** GET /api/pai/summary — aggregated agent + routine summaries (mapped). */
export async function GET() {
  try {
    const [jobs, routines] = await Promise.all([
      getJobsSummary(),
      getRoutinesSummary(),
    ])
    return NextResponse.json({
      agents: toAgentSummary(jobs),
      routines: toRoutineSummary(routines),
    })
  } catch (error) {
    console.error("PAI summary error:", error)
    return NextResponse.json(
      { agents: null, routines: null, offline: true },
      { status: 200 }
    )
  }
}
```

**Step 3: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add app/api/pai/extensions/ app/api/pai/summary/
git commit -m "feat(acl): add /api/pai/extensions and /api/pai/summary routes"
```

---

### Task 6: Migrate Agents Pages

**Files:**
- Modify: `app/agents/page.tsx`
- Modify: `app/agents/[id]/page.tsx`
- Modify: `components/job-spawn-panel.tsx`

**What changes per file:**

**`app/agents/page.tsx`:**
- Change import: `from "@/types/ironclaw"` → `from "@/types/pai"`
- Rename types: `Job` → `PAIAgent`, `JobSummary` → `AgentSummary`, `JobStatus` → `AgentStatus`
- Rename state: `jobs` → `agents`, `setJobs` → `setAgents`
- Change fetch: `/api/ironclaw/jobs/summary` + `/api/ironclaw/jobs` → `/api/pai/agents?summary=true`
- Parse response: `data.agents` and `data.summary` from single fetch
- Update field access: `job.state` → `agent.status`, `job.user_id` → `agent.userId`, `job.created_at` → `agent.createdAt`, `job.elapsed_secs` → `agent.elapsedSecs`
- Update `statusVariant` key type from `JobStatus` to `AgentStatus`

**`app/agents/[id]/page.tsx`:**
- Change import: `from "@/types/ironclaw"` → `from "@/types/pai"`
- Rename types: `JobDetail` → `PAIAgentDetail`, `JobEvent` → `AgentEvent`, `JobStatus` → `AgentStatus`
- Rename state: `job` → `agent`, `setJob` → `setAgent`
- Change fetch: `/api/ironclaw/jobs/${id}` + `/api/ironclaw/jobs/${id}/events` → `/api/pai/agents/${id}`
- Parse response: `data.agent` and `data.events` from single fetch
- Change cancel: `/api/ironclaw/jobs/${id}` DELETE → `/api/pai/agents/${id}` DELETE
- Update field access: `job.state` → `agent.status`, `job.project_dir` → `agent.projectDir`, `job.browse_url` → `agent.browseUrl`, `job.created_at` → `agent.createdAt`, etc.

**`components/job-spawn-panel.tsx`:**
- Change spawn fetch: `/api/ironclaw/jobs` POST → `/api/pai/agents` POST (note: we need to add POST to the agents route, or keep using the ironclaw proxy for spawning since it's a write-through operation)
- Actually, since spawning creates a job on IronClaw and we don't need to map the response, keep the spawn going through `/api/ironclaw/jobs` for now. The spawn panel doesn't import any IronClaw types.

**Step 1: Apply all import, type, state, fetch, and field access changes**

Apply the changes described above. The key pattern for each field rename is:
- `snake_case` (IronClaw) → `camelCase` (PAI types)

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/agents/ components/job-spawn-panel.tsx
git commit -m "feat(acl): migrate agents pages to PAI types"
```

---

### Task 7: Migrate Routines Pages

**Files:**
- Modify: `app/routines/page.tsx`
- Modify: `app/routines/[id]/page.tsx`

**What changes per file:**

**`app/routines/page.tsx`:**
- Change import: `from "@/types/ironclaw"` → `from "@/types/pai"`
- Rename types: `Routine` → `PAIRoutine`, `RoutineSummary` → `PAIRoutineSummary`, `RoutineStatus` → `PAIRoutineStatus`
- Change fetch: Two fetches (`/api/ironclaw/routines/summary` + `/api/ironclaw/routines`) → single `/api/pai/routines`
- Parse response: `data.routines` and `data.summary`
- Update field access: `routine.trigger_type` → `routine.triggerType`, `routine.trigger_summary` → `routine.triggerSummary`, `routine.last_run_at` → `routine.lastRunAt`, `routine.next_fire_at` → `routine.nextFireAt`, `routine.run_count` → `routine.runCount`, `routine.consecutive_failures` → `routine.consecutiveFailures`
- Update `statusVariant` key type from `RoutineStatus` to `PAIRoutineStatus`

**`app/routines/[id]/page.tsx`:**
- Change import: `from "@/types/ironclaw"` → `from "@/types/pai"`
- Rename types: `RoutineDetail` → `PAIRoutineDetail`, `RoutineStatus` → `PAIRoutineStatus`
- Change fetch: `/api/ironclaw/routines/${id}` → `/api/pai/routines/${id}`
- Change actions: toggle → `POST /api/pai/routines/${id}?action=toggle`, trigger → `POST /api/pai/routines/${id}?action=trigger`, delete → `DELETE /api/pai/routines/${id}`
- Update field access: `routine.created_at` → `routine.createdAt`, `routine.recent_runs` → `routine.recentRuns`, run fields: `run.trigger_type` → `run.triggerType`, `run.started_at` → `run.startedAt`, `run.completed_at` → `run.completedAt`, `run.result_summary` → `run.resultSummary`, `run.tokens_used` → `run.tokensUsed`

**Step 1: Apply all changes**

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/routines/
git commit -m "feat(acl): migrate routines pages to PAI types"
```

---

### Task 8: Migrate Extensions Page

**Files:**
- Modify: `app/extensions/page.tsx`

**What changes:**
- Change import: `from "@/types/ironclaw"` → `from "@/types/pai"`
- Rename type: `Extension` → `PAIExtension`
- Change fetch: `/api/ironclaw/extensions` → `/api/pai/extensions`
- Parse response: `data.extensions` from wrapper
- Field access: No changes needed (Extension fields are already camelCase-compatible)

**Step 1: Apply changes**

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add app/extensions/page.tsx
git commit -m "feat(acl): migrate extensions page to PAI types"
```

---

### Task 9: Migrate Overview Page and Ask Page

**Files:**
- Modify: `app/page.tsx` (Overview)
- Modify: `app/ask/page.tsx`
- Modify: `lib/use-ironclaw-sse.ts`

**Overview page changes:**
- Change import: `JobSummary, RoutineSummary, Job` → `AgentSummary, PAIRoutineSummary, PAIAgent` from `@/types/pai`
- Rename `IronclawSummary` interface to use `AgentSummary` and `PAIRoutineSummary`
- Change fetch: `/api/ironclaw/summary` → `/api/pai/summary`
- Change jobs fetch: `/api/ironclaw/jobs?status=completed&limit=5` → `/api/pai/agents?status=completed&limit=5&summary=false`
- Update field names: `summaryData.jobs` → `summaryData.agents`, `summaryData.routines` stays
- Rename state: `recentJobs` → `recentAgents`, field access: `job.state` → `agent.status`, etc.

**Ask page changes:**
- Change import: `SSEEvent, ChatThread` → `PAIStreamEvent, PAIChatThread` from `@/types/pai`
- Update `handleSSEEvent` parameter type: `SSEEvent` → `PAIStreamEvent`
- Update threads state type: `ChatThread[]` → `PAIChatThread[]`
- Change thread fetch: `/api/ironclaw/chat/threads` → keep as-is (chat proxies directly; SSE events are already type-compatible since PAIStreamEvent has same shape)

**SSE hook changes (`lib/use-ironclaw-sse.ts`):**
- Change import: `SSEEvent` → `PAIStreamEvent` from `@/types/pai`
- Update `UseIronclawSSEOptions.onEvent` type: `(event: SSEEvent)` → `(event: PAIStreamEvent)`
- Update `es.onmessage` parse type: `SSEEvent` → `PAIStreamEvent`

**Step 1: Apply all changes**

**Step 2: Verify build**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add app/page.tsx app/ask/page.tsx lib/use-ironclaw-sse.ts
git commit -m "feat(acl): migrate overview, ask, and SSE hook to PAI types"
```

---

### Task 10: Verify Import Boundary and Final Build

**Files:**
- No new files

**Step 1: Verify import boundary**

Run a grep to ensure `types/ironclaw` is only imported where allowed:

```bash
cd Packs/pai-telos-skill/src/DashboardTemplate
grep -rn 'from.*@/types/ironclaw' --include='*.ts' --include='*.tsx' | grep -v 'lib/ironclaw.ts' | grep -v 'lib/mappers.ts' | grep -v 'node_modules'
```

Expected output — ONLY these files should appear (bridge page IronClaw tabs + file-tree):
- `app/memory/page.tsx` (IronClaw Memory tab)
- `app/settings/page.tsx` (IronClaw Settings tab)
- `components/file-tree.tsx` (IronClaw Memory tree component)

If any other file appears, it needs migration.

**Step 2: Full build verification**

Run: `cd Packs/pai-telos-skill/src/DashboardTemplate && npx next build`
Expected: 0 errors, all routes present including new `/api/pai/*` routes

**Step 3: Commit (if any fixes were needed)**

```bash
git commit -m "fix(acl): resolve remaining import boundary violations"
```

---

## File Summary

| File | Action | Est. LOC |
|------|--------|----------|
| `types/pai.ts` | NEW | ~200 |
| `lib/mappers.ts` | NEW | ~180 |
| `app/api/pai/agents/route.ts` | NEW | ~50 |
| `app/api/pai/agents/[id]/route.ts` | NEW | ~55 |
| `app/api/pai/routines/route.ts` | NEW | ~45 |
| `app/api/pai/routines/[id]/route.ts` | NEW | ~60 |
| `app/api/pai/extensions/route.ts` | NEW | ~30 |
| `app/api/pai/summary/route.ts` | NEW | ~25 |
| `app/agents/page.tsx` | MODIFY | ~30 changed |
| `app/agents/[id]/page.tsx` | MODIFY | ~25 changed |
| `app/routines/page.tsx` | MODIFY | ~25 changed |
| `app/routines/[id]/page.tsx` | MODIFY | ~25 changed |
| `app/extensions/page.tsx` | MODIFY | ~10 changed |
| `app/page.tsx` | MODIFY | ~20 changed |
| `app/ask/page.tsx` | MODIFY | ~10 changed |
| `lib/use-ironclaw-sse.ts` | MODIFY | ~5 changed |

**Total: 8 new files, 8 modified. ~650 new LOC + ~150 changed LOC**

## Verification Checklist

1. `npx next build` passes with 0 errors
2. All `/api/pai/*` routes present in build output
3. `grep 'types/ironclaw'` shows only allowed files (ironclaw.ts, mappers.ts, bridge tabs, file-tree)
4. Agents page renders with data from `/api/pai/agents`
5. Routines page renders with data from `/api/pai/routines`
6. Extensions page renders with data from `/api/pai/extensions`
7. Overview page renders with data from `/api/pai/summary`
8. Ask page SSE streaming still works
9. Bridge pages (Memory, Logs, Settings) unaffected — both tabs work
10. Agent cancel, routine toggle/trigger/delete all work through PAI routes
