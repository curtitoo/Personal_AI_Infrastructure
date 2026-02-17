# Anti-Corruption Layer (Phase 3) Design

**Date:** 2026-02-17
**Status:** Approved
**Parent:** [Unified Architecture Design](./2026-02-17-unified-architecture-design.md)
**Approach:** Server-Side Mappers (Approach A)

## Problem

12 dashboard files import directly from `types/ironclaw.ts` (233 LOC, 25 types across 8 domains). When IronClaw updates its API, changes ripple through every importing page. This contradicts User Requirement #3: "Ability to incorporate IronClaw updates selectively."

## Why This Matters

Without a translation layer, "selective updates" means manually auditing 12 files for every IronClaw version bump. The mapper centralizes that work:

```
Without ACL:  IronClaw change → fix 12 files → test 12 pages
With ACL:     IronClaw change → fix 1 mapper file → 0 page changes
```

**Example:** IronClaw v2.0 renames `Job.state` to `Job.status`. Without ACL, 5 pages break. With ACL, one mapper function absorbs the rename. Zero pages change.

## Architecture Decision

**Chosen:** Server-Side Mappers — mapping happens in API routes before data reaches the browser.

```
Page → fetch("/api/pai/agents") → API route → ironclawFetch() → mapper → PAI types
```

**Rejected alternatives:**
- **Client-Side Adapters** — IronClaw types still reach the browser; weaker boundary; developers can skip the adapter.
- **Type Aliases** — No real decoupling; just a rename. If IronClaw changes a field, the alias breaks identically.

## PAI Type Definitions (`types/pai.ts`)

PAI-owned vocabulary for all 8 domains:

| Domain | IronClaw Types | PAI Types | Key Changes |
|--------|---------------|-----------|-------------|
| Jobs | `Job`, `JobDetail`, `JobSummary` | `PAIAgent`, `PAIAgentDetail`, `AgentSummary` | "Agent" aligns with PAI vocabulary |
| Routines | `Routine`, `RoutineDetail`, `RoutineSummary` | `PAIRoutine`, `PAIRoutineDetail`, `PAIRoutineSummary` | Adds `source: "ironclaw" | "pai"` for future PAI routines |
| Chat | `ChatThread`, `ChatTurn`, `SSEEvent` | `PAIChatThread`, `PAIChatMessage`, `PAIStreamEvent` | "Turn" → "Message"; SSEEvent → PAIStreamEvent |
| Extensions | `Extension` | `PAIExtension` | Minimal change |
| Memory | `MemoryEntry`, `MemoryNode`, `MemoryContent` | `PAIMemoryEntry`, `PAIMemoryNode`, `PAIMemoryContent` | Already bridged in Phase 2 |
| Logs | `LogEntry` | `PAILogEntry` | Promote from inline page type to shared |
| Settings | `Setting`, `SettingsExport` | `PAISetting`, `PAISettingsExport` | Promote from inline page type to shared |
| Generic | `ActionResponse` | `PAIActionResponse` | Shared success/error shape |

~25 PAI types total.

## Mapper Functions (`lib/mappers.ts`)

Pure functions converting IronClaw → PAI types. No side effects, no I/O.

```typescript
function toAgent(ic: Job): PAIAgent { ... }
function toAgentDetail(ic: JobDetail): PAIAgentDetail { ... }
function toRoutine(ic: Routine): PAIRoutine { ... }
function toChatThread(ic: ChatThread): PAIChatThread { ... }
// One function per type that needs transformation
```

## New API Routes

| New Route | Replaces | Mapper |
|-----------|----------|--------|
| `/api/pai/agents` | Pages fetching `/api/ironclaw/jobs` | `toAgent()` |
| `/api/pai/agents/[id]` | Pages fetching `/api/ironclaw/jobs/:id` | `toAgentDetail()` |
| `/api/pai/routines` | Pages fetching `/api/ironclaw/routines` | `toRoutine()` |
| `/api/pai/routines/[id]` | Pages fetching `/api/ironclaw/routines/:id` | `toRoutineDetail()` |
| `/api/pai/extensions` | Pages fetching `/api/ironclaw/extensions` | `toExtension()` |
| `/api/pai/summary` | `/api/ironclaw/summary` | `toAgentSummary()` + `toRoutineSummary()` |

Existing Phase 2 routes (`/api/pai/memory`, `/api/pai/logs`, `/api/pai/settings`, `/api/pai/heartbeat`) stay as-is.

The catch-all `/api/ironclaw/[...path]` proxy stays for SSE streaming and raw access.

## Page Migration

Each page switches from `types/ironclaw` → `types/pai` imports and fetches from `/api/pai/*`:

| Page | Import Change | Fetch Change |
|------|---------------|--------------|
| `app/page.tsx` | `JobSummary, Job` → `AgentSummary, PAIAgent` | `/api/ironclaw/summary` → `/api/pai/summary` |
| `app/agents/page.tsx` | `Job, JobSummary, JobStatus` → `PAIAgent, AgentSummary, AgentStatus` | → `/api/pai/agents` |
| `app/agents/[id]/page.tsx` | `JobDetail, JobEvent` → `PAIAgentDetail, PAIAgentEvent` | → `/api/pai/agents/:id` |
| `app/routines/page.tsx` | `Routine, RoutineSummary` → `PAIRoutine, PAIRoutineSummary` | → `/api/pai/routines` |
| `app/routines/[id]/page.tsx` | `RoutineDetail` → `PAIRoutineDetail` | → `/api/pai/routines/:id` |
| `app/extensions/page.tsx` | `Extension` → `PAIExtension` | → `/api/pai/extensions` |
| `app/ask/page.tsx` | `SSEEvent, ChatThread` → `PAIStreamEvent, PAIChatThread` | Chat route stays |
| `lib/use-ironclaw-sse.ts` | `SSEEvent` → `PAIStreamEvent` | Type only |

**Bridge pages** (`memory`, `logs`, `settings`): The IronClaw tabs still import IronClaw types directly — they legitimately render IronClaw data. The PAI tabs already use PAI types.

## Post-Migration Import Rules

After Phase 3, only these files may import from `types/ironclaw.ts`:

1. `lib/ironclaw.ts` — proxy library (server-side only)
2. `lib/mappers.ts` — mapping layer (server-side only)
3. Bridge page IronClaw tabs — legitimate IronClaw data rendering
4. `components/file-tree.tsx` — used inside IronClaw Memory tab

All other files import from `types/pai.ts` only.

## Estimates

| Component | New/Modify | LOC |
|-----------|-----------|-----|
| `types/pai.ts` | NEW | ~200 |
| `lib/mappers.ts` | NEW | ~150 |
| 6 new API routes | NEW | ~180 |
| 8 page migrations | MODIFY | ~100 (import + fetch changes) |
| **Total** | | **~630** |

## Success Criteria

1. Zero dashboard pages import from `types/ironclaw.ts` (except bridge tabs + file-tree)
2. All pages render identically before and after migration
3. `next build` passes with 0 errors
4. Simulated IronClaw field rename requires only mapper changes, not page changes
5. No IronClaw auth tokens exposed in any `/api/pai/*` response
