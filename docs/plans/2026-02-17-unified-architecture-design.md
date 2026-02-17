# Unified PAI + IronClaw Architecture Design

**Date:** 2026-02-17
**Status:** Approved
**Approach:** IronClaw-First (Approach A — Layered Sovereignty)

## Problem Statement

PAI and IronClaw were producing contradictory architecture recommendations:
- "Build a PAI daemon (~400 LOC), IronClaw is optional"
- "Keep IronClaw as the daemon, don't need a PAI daemon"

**Root cause:** Category conflation — treating "daemon" as a single slot instead of three orthogonal concerns: persistence, intelligence, and security.

## Architecture: Layered Sovereignty

Three layers, each owning a distinct concern:

```
Layer 3: PAI Cognitive    — Skills, Hooks, Algorithm, Memory
Layer 2: IronClaw Exec    — Rust daemon, WASM sandbox, scheduling, exec approval
Layer 1: CC-Mirror Infer  — Provider routing (OpenRouter, Ollama, Anthropic)
```

**Key insight:** IronClaw is the daemon chassis. PAI is the cognitive payload. CC-Mirror is the inference router. They are layers, not competitors.

### Security Hierarchy

IronClaw = **outer authority** (hard boundaries in Rust, WASM sandboxing, exec approvals)
PAI SecurityValidator = **inner authority** (smart contextual policy, YAML pattern matching)

On conflict, IronClaw wins. PAI refines within IronClaw's boundaries.

### Two Invocation Modes

| Mode | Command | Hooks | Tools | Use Case |
|------|---------|-------|-------|----------|
| Lightweight triage | `claude --print --setting-sources '' --tools ''` | OFF | OFF | Quick classification, heartbeat checks |
| Full work | `claude --print` or `claude` | ON | ON | Real analysis, implementation, all "superpowers" |

The hooks bypass in `Inference.ts` (line 117) is intentional — lightweight triage doesn't need the full PAI stack.

## Feature Classification

All 11 IronClaw dashboard features classified by integration strategy:

### KEEP AS PROXY (6 features)

IronClaw owns these. Dashboard proxies via `/api/ironclaw/[...path]`.

| Feature | Why Keep | Dashboard Page |
|---------|----------|----------------|
| Jobs / Active Agents | IronClaw's core — Rust process management | `/agents`, `/agents/[id]` |
| Routines | IronClaw cron scheduling, heartbeat host | `/routines`, `/routines/[id]` |
| Ask PAI / Chat | IronClaw approval flow + streaming | `/ask` |
| Extensions | IronClaw plugin system | `/extensions` |
| IronClaw Files | IronClaw-managed documents | Sidebar collapsible |
| Status Indicator | Health check, online/offline | Sidebar footer |

### BRIDGE (3 features)

Show BOTH PAI and IronClaw data in unified tab views.

| Feature | PAI Source | IronClaw Source | UI Pattern |
|---------|-----------|-----------------|------------|
| Memory | `~/.claude/MEMORY/` (JSONL, Markdown) | IronClaw `/memory` API (tree nodes) | Tab: "PAI Memory" / "IronClaw Memory" |
| Logs | `~/.claude/debug/` + hook output | IronClaw `/logs` API | Tab: "PAI Logs" / "IronClaw Logs" |
| Settings | `settings.json`, `settings.local.json` | IronClaw `/settings` API | Tab: "PAI Settings" / "IronClaw Settings" |

### PAI-NATIVE (5 features)

PAI owns these entirely. No IronClaw involvement.

| Feature | Source | Dashboard Page |
|---------|--------|----------------|
| Inference Config | `~/.cc-mirror/*/config/settings.json` | `/inference` |
| Pipeline Board | PAI idea pipeline | `/pipeline` |
| All Ideas | PAI idea list | `/ideas` |
| Telos Files | PAI documents | Sidebar collapsible |
| Add File | PAI document upload | `/add-file` |

## State Bridge: The Heartbeat Pattern

IronClaw cron triggers periodic heartbeats:

```
IronClaw Routine (cron) → Lightweight triage (claude --print, no hooks)
  ├── Nothing notable → Write "all clear" to daemon-state.json
  └── Something needs attention → Full Claude session (all hooks fire)
        └── SessionSummary → daemon-state.json → next heartbeat reads it
```

**State file:** `daemon-state.json` — written by PAI sessions, read by IronClaw heartbeats. Provides multi-heartbeat continuity (the "clipboard" between sessions).

## Anti-Corruption Layer

PAI-owned types map to/from IronClaw types at the boundary. This prevents the **integration ratchet** — where each absorbed IronClaw feature increases coupling, making future changes harder.

```typescript
// PAI types (owned, stable)
interface PAIJob { id: string; status: PAIJobStatus; ... }

// Mapping at boundary
function fromIronclawJob(ic: IronclawJob): PAIJob { ... }
```

## User Requirements (10 gathered across sessions)

1. PAI daemon capability using PAI's own functionality
2. IronClaw as the security backbone (strongest security for entire infrastructure)
3. Ability to incorporate IronClaw updates selectively
4. Hooks ("superpowers") must work for real tasks
5. Lightweight triage mode without full hook overhead
6. Unified dashboard showing both PAI and IronClaw data
7. No feature regression — existing IronClaw pages keep working
8. CC-Mirror inference routing preserved
9. Clear security hierarchy (IronClaw outer, PAI inner)
10. Phased rollout — not a big-bang rewrite

## Implementation Phases

### Phase 0: Heartbeat (Hours)

- One IronClaw routine config pointing to a PAI triage script
- `HEARTBEAT.md` documenting the pattern
- Validates: IronClaw can trigger PAI cognitive work

### Phase 1: State Bridge (Days)

- `daemon-state.json` schema and read/write helpers
- `session-bootstrap.sh` that reads state before spawning Claude
- `PAI_DEPLOY_CONTEXT=daemon` env var for SecurityValidator awareness
- Validates: Multi-heartbeat continuity works

### Phase 2: Dashboard Bridges (~1-2 Weeks, ~410 LOC)

- Memory page: Tab view with PAI Memory (read JSONL/Markdown) + IronClaw Memory (existing proxy)
- Logs page: Tab view with PAI Logs (read debug dir) + IronClaw Logs (existing proxy)
- Settings page: Tab view with PAI Settings (read settings.json) + IronClaw Settings (existing proxy)
- New API routes: `/api/pai/memory`, `/api/pai/logs`, `/api/pai/settings`

### Phase 3: Anti-Corruption Layer (~2-3 Weeks)

- PAI-owned type definitions for Jobs, Routines, Memory, etc.
- Mapping functions at IronClaw boundary
- Dashboard components consume PAI types only
- IronClaw types confined to proxy layer

### Phase 4: Security Hierarchy (~3-4 Weeks)

- Policy compiler: IronClaw constraints + PAI SecurityValidator rules → unified policy
- Build-time validator: catch conflicts before deployment
- Runtime: IronClaw enforces outer boundary, PAI refines within

### Phase 5: Adaptive Heartbeat (Months)

- Dynamic heartbeat intervals based on activity
- Channel routing (which findings go where: dashboard, notification, log)
- Graduated response (triage → partial hooks → full session)

## RedTeam Findings to Address

| Severity | Finding | Mitigation Phase |
|----------|---------|-----------------|
| CRITICAL | `claude --print` hooks bypass | Phase 1 — documented as intentional for triage mode |
| HIGH | Security policy conflict (no resolution protocol) | Phase 4 — policy compiler |
| HIGH | Overlapping enforcement planes | Phase 3 — anti-corruption layer clarifies boundaries |
| MEDIUM | CC-Mirror capability leakage | Phase 3 — type boundary prevents leakage |
| MEDIUM | SSE reconnection storm | Phase 2 — add circuit breaker to `use-ironclaw-sse.ts` |
| MEDIUM | Integration ratchet | Phase 3 — anti-corruption layer is the mitigation |

## Key Files

| File | Role |
|------|------|
| `Packs/pai-core-install/src/skills/CORE/Tools/Inference.ts` | PAI inference with `claude --print` |
| `Packs/pai-hook-system/src/hooks/SecurityValidator.hook.ts` | PAI security policy (703 LOC) |
| `Packs/pai-telos-skill/src/DashboardTemplate/lib/ironclaw.ts` | IronClaw proxy library |
| `Packs/pai-telos-skill/src/DashboardTemplate/types/ironclaw.ts` | IronClaw type definitions (233 LOC) |
| `Packs/pai-telos-skill/src/DashboardTemplate/lib/use-ironclaw-sse.ts` | SSE hook with reconnect |
| `Packs/pai-telos-skill/src/DashboardTemplate/lib/cc-mirror.ts` | CC-Mirror config library |

## Success Criteria

1. IronClaw heartbeat triggers PAI triage successfully
2. State persists across heartbeat sessions via daemon-state.json
3. Dashboard shows unified Memory/Logs/Settings with tab navigation
4. No existing IronClaw features regress
5. PAI types decoupled from IronClaw types at boundary
6. Security hierarchy enforced: IronClaw outer, PAI inner
7. Hooks fire for all full work sessions
8. Integration ratchet contained by anti-corruption layer
