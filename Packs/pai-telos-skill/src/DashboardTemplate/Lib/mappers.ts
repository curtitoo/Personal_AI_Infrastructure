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
