"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Lightbulb,
  TrendingUp,
  Bot,
  Timer,
  Target,
  AlertTriangle,
  BarChart3,
  Clock,
} from "lucide-react"
import type { StatusReport, ScoreResult } from "@/types/idea-os"
import type { AgentSummary, PAIRoutineSummary, PAIAgent } from "@/types/pai"

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

interface IronclawSummary {
  agents: AgentSummary | null
  routines: PAIRoutineSummary | null
  offline?: boolean
}

export default function OverviewPage() {
  const [status, setStatus] = useState<StatusReport | null>(null)
  const [scores, setScores] = useState<ScoreResult[] | null>(null)
  const [ironclawSummary, setIronclawSummary] = useState<IronclawSummary>({ agents: null, routines: null })
  const [recentAgents, setRecentAgents] = useState<PAIAgent[]>([])
  const [recentAgentsOffline, setRecentAgentsOffline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/ideas/status").then(r => {
        if (!r.ok) throw new Error("Failed to fetch status")
        return r.json()
      }),
      fetch("/api/ideas/scores").then(r => {
        if (!r.ok) throw new Error("Failed to fetch scores")
        return r.json()
      }),
      fetch("/api/pai/summary").then(r => {
        if (!r.ok) return { agents: null, routines: null, offline: true }
        return r.json()
      }),
      fetch("/api/pai/agents?status=completed&limit=5&summary=false").then(r => {
        if (!r.ok) return null
        return r.json()
      }),
    ])
      .then(([statusData, scoresData, summaryData, agentsData]) => {
        setStatus(statusData as StatusReport)
        setScores(scoresData as ScoreResult[])
        setIronclawSummary(summaryData as IronclawSummary)
        if (agentsData && typeof agentsData === "object" && "agents" in agentsData) {
          setRecentAgents((agentsData as { agents: PAIAgent[] }).agents)
        } else {
          setRecentAgentsOffline(true)
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-[#f52a65]/30">
          <CardContent className="pt-6">
            <p className="text-[#f52a65]">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const ideaCount = status?.nodeCounts?.["idea"] ?? 0
  const activeCount = status?.activeIdeas?.length ?? 0
  const pipelineAvg = scores && scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.pipeline, 0) / scores.length)
    : 0

  const noHypothesisBonus = scores?.filter(s => s.hypothesisBonus === 0) ?? []
  const hasAssumptionPenalty = scores?.filter(s => s.assumptionPenalty < 0) ?? []

  const { agents: agentsSummary, routines } = ironclawSummary

  const agentsValue = agentsSummary ? agentsSummary.inProgress : "\u2014"
  const agentsSubtitle = agentsSummary ? `${agentsSummary.total} total` : "offline"

  const routinesValue = routines ? routines.enabled : "\u2014"
  const routinesSubtitle = routines ? `${routines.runsToday} today` : "offline"

  const statCards = [
    { label: "Ideas", value: ideaCount, subtitle: `${activeCount} active`, icon: Lightbulb, color: "#2e7de9" },
    { label: "Pipeline Avg", value: pipelineAvg, subtitle: "stable", icon: TrendingUp, color: "#9854f1" },
    { label: "Agents", value: agentsValue, subtitle: agentsSubtitle, icon: Bot, color: "#33b579" },
    { label: "Routines", value: routinesValue, subtitle: routinesSubtitle, icon: Timer, color: "#f0a020" },
    { label: "Goals", value: "\u2014", subtitle: "Phase 2", icon: Target, color: "#f52a65" },
  ]

  return (
    <div className="p-8">
      {/* Greeting Banner */}
      <div className="mb-8 rounded-2xl bg-gradient-to-br from-[#2e7de9]/10 via-[#9854f1]/5 to-[#33b579]/10 p-8 border border-[#2e7de9]/20 dark:from-[#2e7de9]/20 dark:via-[#9854f1]/10 dark:to-[#33b579]/20 dark:border-[#2e7de9]/30">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          {getGreeting()}, curtitoo
        </h1>
        <p className="text-gray-500 dark:text-gray-400">{formatDate()}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map(card => (
          <Card key={card.label} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <card.icon className="h-4 w-4" style={{ color: card.color }} />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {card.label}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* What Needs Attention */}
      <Card className="mb-8 border-[#f0a020]/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#f0a020]" />
            What Needs Attention
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {scores && scores.length > 0 && (
              <div className="flex items-start gap-3 text-sm">
                <Badge variant="warning" className="mt-0.5 shrink-0">Score</Badge>
                <span className="text-gray-700 dark:text-gray-300">
                  {scores.length} ideas may have unscored dimensions -- check individual scorecards
                </span>
              </div>
            )}
            {noHypothesisBonus.length > 0 && (
              <div className="flex items-start gap-3 text-sm">
                <Badge variant="warning" className="mt-0.5 shrink-0">Hypothesis</Badge>
                <span className="text-gray-700 dark:text-gray-300">
                  {noHypothesisBonus.length} idea{noHypothesisBonus.length !== 1 ? "s" : ""} with 0 hypothesis bonus:{" "}
                  {noHypothesisBonus.map(s => s.title).join(", ")}
                </span>
              </div>
            )}
            {hasAssumptionPenalty.length > 0 && (
              <div className="flex items-start gap-3 text-sm">
                <Badge variant="destructive" className="mt-0.5 shrink-0">Risk</Badge>
                <span className="text-gray-700 dark:text-gray-300">
                  {hasAssumptionPenalty.length} idea{hasAssumptionPenalty.length !== 1 ? "s" : ""} with assumption penalty:{" "}
                  {hasAssumptionPenalty.map(s => `${s.title} (${s.assumptionPenalty})`).join(", ")}
                </span>
              </div>
            )}
            {scores?.length === 0 && (
              <p className="text-sm text-gray-400">No ideas scored yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Snapshot + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Snapshot */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#2e7de9]" />
              Pipeline Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            {status?.ideasByStage && Object.keys(status.ideasByStage).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(status.ideasByStage).map(([stage, count]) => (
                  <div key={stage} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{stage}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No pipeline data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#9854f1]" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentAgentsOffline || ironclawSummary.offline ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Bot className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-400 font-medium">IronClaw offline</p>
                <p className="text-xs text-gray-300 dark:text-gray-500 mt-1">Start IronClaw to see agent activity</p>
              </div>
            ) : recentAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-400 font-medium">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentAgents.map(agent => (
                  <div key={agent.id} className="flex items-start gap-3 py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-[#33b579] mt-1.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{agent.title}</p>
                      <p className="text-xs text-gray-400">
                        {agent.completedAt ? formatTimestamp(agent.completedAt) : formatTimestamp(agent.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
