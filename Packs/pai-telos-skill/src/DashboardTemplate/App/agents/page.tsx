"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Bot, Plus } from "lucide-react"
import { JobSpawnPanel } from "@/components/job-spawn-panel"
import type { PAIAgent, AgentSummary, AgentStatus } from "@/types/pai"

const statusVariant: Record<AgentStatus, "success" | "primary" | "warning" | "destructive" | "secondary"> = {
  completed: "success",
  in_progress: "primary",
  pending: "warning",
  failed: "destructive",
  stuck: "secondary",
}

function formatDuration(secs?: number): string {
  if (secs == null) return "-"
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default function AgentsPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<AgentSummary | null>(null)
  const [agents, setAgents] = useState<PAIAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [showSpawnPanel, setShowSpawnPanel] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/pai/agents")
      if (!res.ok) {
        setOffline(true)
        return
      }
      const data = await res.json() as { agents: PAIAgent[]; summary: AgentSummary | null; offline?: boolean }
      if (data.offline) {
        setOffline(true)
        return
      }
      setSummary(data.summary)
      setAgents(data.agents)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading agents...</p>
      </div>
    )
  }

  if (offline) {
    return (
      <div className="p-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
          <Bot className="h-10 w-10 mr-3 text-[#2e7de9]" />
          Active Agents
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">IronClaw background agents and jobs</p>
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
            <Bot className="h-10 w-10 mr-3 text-[#2e7de9]" />
            Active Agents
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">IronClaw background agents and jobs</p>
        </div>
        <Button variant="primary" onClick={() => setShowSpawnPanel(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Agent
        </Button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-5 gap-4 mb-8">
          {([
            { label: "Total", value: summary.total, color: "text-gray-900 dark:text-gray-100" },
            { label: "Running", value: summary.inProgress, color: "text-[#2e7de9]" },
            { label: "Pending", value: summary.pending, color: "text-[#f0a020]" },
            { label: "Completed", value: summary.completed, color: "text-[#33b579]" },
            { label: "Failed", value: summary.failed, color: "text-[#f52a65]" },
          ] as const).map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Jobs table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No agents found
                </TableCell>
              </TableRow>
            ) : (
              agents.map((agent) => (
                <TableRow
                  key={agent.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/agents/${agent.id}`)}
                >
                  <TableCell className="font-medium">{agent.title}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[agent.status]}>{agent.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-gray-500 dark:text-gray-400">{formatDate(agent.createdAt)}</TableCell>
                  <TableCell className="text-gray-500 dark:text-gray-400">{formatDuration(agent.elapsedSecs)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <JobSpawnPanel
        open={showSpawnPanel}
        onClose={() => setShowSpawnPanel(false)}
        onCreated={fetchData}
      />
    </div>
  )
}
