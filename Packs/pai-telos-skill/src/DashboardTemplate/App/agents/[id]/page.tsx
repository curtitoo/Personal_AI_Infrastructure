"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bot, ArrowLeft, XCircle, RotateCcw } from "lucide-react"
import type { PAIAgentDetail, AgentEvent, AgentStatus } from "@/types/pai"

const statusVariant: Record<AgentStatus, "success" | "primary" | "warning" | "destructive" | "secondary"> = {
  completed: "success",
  in_progress: "primary",
  pending: "warning",
  failed: "destructive",
  stuck: "secondary",
}

function formatDate(iso?: string): string {
  if (!iso) return "-"
  return new Date(iso).toLocaleString()
}

function formatDuration(secs?: number): string {
  if (secs == null) return "-"
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [agent, setAgent] = useState<PAIAgentDetail | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/pai/agents/${id}`)
        if (!res.ok) {
          setOffline(true)
          return
        }
        const data = await res.json() as { agent: PAIAgentDetail; events: AgentEvent[] }
        setAgent(data.agent)
        setEvents(data.events)
        setOffline(false)
      } catch {
        setOffline(true)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  const handleCancel = async () => {
    if (!window.confirm("Cancel this agent?")) return
    try {
      await fetch(`/api/pai/agents/${id}`, { method: "DELETE" })
      router.push("/agents")
    } catch {
      // Ignore - user will see the job is still active
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading agent details...</p>
      </div>
    )
  }

  if (offline || !agent) {
    return (
      <div className="p-8">
        <button
          onClick={() => router.push("/agents")}
          className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-[#2e7de9] mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Agents
        </button>
        <Card className="border-[#f0a020]/30 max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="h-16 w-16 text-[#f0a020] mb-4" />
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">IronClaw is not running</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Start IronClaw to manage agents</p>
            <code className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-600 dark:text-gray-400">
              cd ~/ironclaw && cargo run
            </code>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8">
      <button
        onClick={() => router.push("/agents")}
        className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-[#2e7de9] mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Agents
      </button>

      {/* Agent Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                {agent.title}
                <Badge variant={statusVariant[agent.status]}>{agent.status.replace("_", " ")}</Badge>
              </CardTitle>
              {agent.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{agent.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              {(agent.status === "pending" || agent.status === "in_progress") && (
                <Button variant="destructive" size="sm" onClick={handleCancel}>
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
              {(agent.status === "failed" || agent.status === "stuck") && (
                <Button variant="outline" size="sm" onClick={() => router.refresh()}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Restart
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Created</p>
              <p className="font-medium">{formatDate(agent.createdAt)}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Started</p>
              <p className="font-medium">{formatDate(agent.startedAt)}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Completed</p>
              <p className="font-medium">{formatDate(agent.completedAt)}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Duration</p>
              <p className="font-medium">{formatDuration(agent.elapsedSecs)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transition Timeline */}
      {agent.transitions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">State Transitions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agent.transitions.map((t, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full bg-[#2e7de9]" />
                    {i < agent.transitions.length - 1 && (
                      <div className="w-0.5 h-8 bg-gray-200 dark:bg-gray-700" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {t.from} → {t.to}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(t.timestamp)}</p>
                    {t.reason && (
                      <p className="text-xs text-gray-400 mt-1">{t.reason}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Timeline */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {events.map((event, i) => (
                <div key={i} className="flex items-start gap-3 border-b dark:border-gray-700 last:border-0 pb-3 last:pb-0">
                  <div className="flex flex-col items-center pt-1">
                    <div className="h-2 w-2 rounded-full bg-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">{event.eventType}</Badge>
                      <span className="text-xs text-gray-400">{formatDate(event.timestamp)}</span>
                    </div>
                    {event.data != null && (
                      <pre className="text-xs text-gray-500 dark:text-gray-400 mt-1 overflow-x-auto whitespace-pre-wrap break-words">
                        {typeof event.data === "string" ? event.data : JSON.stringify(event.data, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
