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
