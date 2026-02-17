"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Timer, Play, ToggleLeft, ToggleRight } from "lucide-react"
import type { PAIRoutine, PAIRoutineSummary, PAIRoutineStatus } from "@/types/pai"

const statusVariant: Record<PAIRoutineStatus, "success" | "secondary" | "destructive"> = {
  active: "success",
  enabled: "success",
  disabled: "secondary",
  failing: "destructive",
}

function formatDate(iso?: string): string {
  if (!iso) return "Never"
  return new Date(iso).toLocaleString()
}

export default function RoutinesPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<PAIRoutineSummary | null>(null)
  const [routines, setRoutines] = useState<PAIRoutine[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/pai/routines")
      if (!res.ok) {
        setOffline(true)
        return
      }
      const data = await res.json() as { routines: PAIRoutine[]; summary: PAIRoutineSummary | null; offline?: boolean }
      if (data.offline) {
        setOffline(true)
        return
      }
      setSummary(data.summary)
      setRoutines(data.routines)
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

  const handleToggle = async (routineId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/pai/routines/${routineId}?action=toggle`, { method: "POST" })
      fetchData()
    } catch {
      // Silently fail - user will see stale state
    }
  }

  const handleTrigger = async (routineId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/pai/routines/${routineId}?action=trigger`, { method: "POST" })
      fetchData()
    } catch {
      // Silently fail
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading routines...</p>
      </div>
    )
  }

  if (offline) {
    return (
      <div className="p-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
          <Timer className="h-10 w-10 mr-3 text-[#2e7de9]" />
          Routines
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">Scheduled automation and recurring tasks</p>
        <Card className="border-[#f0a020]/30 max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Timer className="h-16 w-16 text-[#f0a020] mb-4" />
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">IronClaw is not running</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Start IronClaw to manage routines</p>
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
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
          <Timer className="h-10 w-10 mr-3 text-[#2e7de9]" />
          Routines
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">Scheduled automation and recurring tasks</p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-5 gap-4 mb-8">
          {([
            { label: "Total", value: summary.total, color: "text-gray-900 dark:text-gray-100" },
            { label: "Enabled", value: summary.enabled, color: "text-[#33b579]" },
            { label: "Disabled", value: summary.disabled, color: "text-gray-500 dark:text-gray-400" },
            { label: "Failing", value: summary.failing, color: "text-[#f52a65]" },
            { label: "Runs Today", value: summary.runsToday, color: "text-[#2e7de9]" },
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

      {/* Routine cards */}
      {routines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Timer className="h-16 w-16 text-gray-300 dark:text-gray-500 mb-4" />
            <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No routines configured</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {routines.map((routine) => (
            <Card
              key={routine.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/routines/${routine.id}`)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{routine.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{routine.description}</p>
                  </div>
                  <Badge variant={statusVariant[routine.status]} className="ml-3 flex-shrink-0">
                    {routine.status}
                  </Badge>
                </div>
                <p className="text-xs text-gray-400 mb-4">{routine.triggerSummary}</p>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <span>Last run: {formatDate(routine.lastRunAt)}</span>
                    {routine.consecutiveFailures > 0 && (
                      <span className="text-[#f52a65] ml-2">
                        ({routine.consecutiveFailures} failures)
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleToggle(routine.id, e)}
                      title={routine.enabled ? "Disable" : "Enable"}
                    >
                      {routine.enabled ? (
                        <ToggleRight className="h-4 w-4 text-[#33b579]" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-gray-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleTrigger(routine.id, e)}
                      title="Trigger Now"
                    >
                      <Play className="h-4 w-4 text-[#2e7de9]" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
