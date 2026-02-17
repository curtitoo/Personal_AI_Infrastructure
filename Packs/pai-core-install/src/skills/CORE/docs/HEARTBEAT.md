# PAI Heartbeat Triage

Periodic health check for the PAI system, designed to be invoked by IronClaw's cron scheduler.

## Overview

The heartbeat pattern separates **triage** (cheap, fast, read-only) from **action** (full session with tools and hooks). This keeps background monitoring costs minimal while preserving the ability to escalate when something actually needs attention.

```
IronClaw cron --> heartbeat-triage.sh --> lightweight Claude (haiku, no tools)
                                              |
                                         idle? done.
                                              |
                                         escalate? --> full Claude session (sonnet, hooks enabled)
```

## IronClaw Routine Configuration

Register the heartbeat as an IronClaw routine:

```json
{
  "id": "pai-heartbeat",
  "schedule": "*/15 * * * *",
  "command": "Packs/pai-core-install/src/skills/CORE/Tools/heartbeat-triage.sh",
  "timeout_seconds": 30,
  "retry": {
    "max_attempts": 1,
    "backoff_ms": 0
  },
  "tags": ["health", "triage"]
}
```

The 15-minute interval balances responsiveness with API cost. Adjust based on system activity.

## Invocation Modes

| Aspect | Lightweight Triage | Full Escalation |
|---|---|---|
| **Model** | haiku | sonnet |
| **Tools** | Disabled (`--tools ''`) | All available |
| **Hooks** | Disabled (`--setting-sources ''`) | All enabled |
| **Output** | JSON decision only | Investigative session |
| **Cost** | Minimal | Standard |
| **Duration** | < 5 seconds | Variable |
| **Trigger** | IronClaw cron | Triage script (background) |

## State Persistence

Triage state lives at `~/.claude/MEMORY/STATE/daemon-state.json`:

```json
{
  "last_check": 1708185600,
  "status": "idle",
  "last_reason": "no actionable signals",
  "escalation_count": 0
}
```

| Field | Purpose |
|---|---|
| `last_check` | Unix timestamp of last triage run |
| `status` | Result of last triage (`idle` or `escalate`) |
| `last_reason` | Human-readable explanation from triage model |
| `escalation_count` | Running total of escalations for observability |

The state file also serves as a timestamp reference -- `find -newer` uses it to scope signal gathering to only what's changed since the last check.

## Security Model

**Triage session (haiku):**
- Cannot execute tools (`--tools ''`)
- Cannot trigger hooks (`--setting-sources ''`)
- Read-only analysis of log snippets and file names
- Can only output a JSON verdict

**Escalated session (sonnet):**
- Full tool access for investigation and remediation
- All security hooks active (SecurityValidator, etc.)
- Runs as a background process with output logged
- Standard PAI permission model applies

This two-tier design ensures that the high-frequency triage path has zero write capability, while escalated sessions get the full security stack.
