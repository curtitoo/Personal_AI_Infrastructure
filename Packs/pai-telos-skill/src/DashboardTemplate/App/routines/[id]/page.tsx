"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Timer, ArrowLeft, Play, ToggleLeft, ToggleRight, Trash2 } from "lucide-react"
import type { PAIRoutineDetail, PAIRoutineStatus } from "@/types/pai"

const statusVariant: Record<PAIRoutineStatus, "success" | "secondary" | "destructive"> = {
  active: "success",
  enabled: "success",
  disabled: "secondary",
  failing: "destructive",
}

function formatDate(iso?: string): string {
  if (!iso) return "-"
  return new Date(iso).toLocaleString()
}

function formatDuration(startIso: string, endIso?: string): string {
  if (!endIso) return "-"
  const secs = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

export default function RoutineDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [routine, setRoutine] = useState<PAIRoutineDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/pai/routines/${id}`)
      if (!res.ok) {
        setOffline(true)
        return
      }
      const data: PAIRoutineDetail = await res.json()
      setRoutine(data)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleToggle = async () => {
    await fetch(`/api/pai/routines/${id}?action=toggle`, { method: "POST" })
    fetchData()
  }

  const handleTrigger = async () => {
    await fetch(`/api/pai/routines/${id}?action=trigger`, { method: "POST" })
    fetchData()
  }

  const handleDelete = async () => {
    if (!window.confirm("Delete this routine? This cannot be undone.")) return
    try {
      await fetch(`/api/pai/routines/${id}`, { method: "DELETE" })
      router.push("/routines")
    } catch {
      // Ignore
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading routine details...</p>
      </div>
    )
  }

  if (offline || !routine) {
    return (
      <div className="p-8">
        <button
          onClick={() => router.push("/routines")}
          className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-[#2e7de9] mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Routines
        </button>
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
      <button
        onClick={() => router.push("/routines")}
        className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-[#2e7de9] mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Routines
      </button>

      {/* Routine Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                {routine.name}
                <Badge variant={statusVariant[routine.status]}>{routine.status}</Badge>
              </CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{routine.description}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleToggle}>
                {routine.enabled ? (
                  <><ToggleRight className="h-4 w-4 mr-1 text-[#33b579]" />Disable</>
                ) : (
                  <><ToggleLeft className="h-4 w-4 mr-1 text-gray-400" />Enable</>
                )}
              </Button>
              <Button variant="primary" size="sm" onClick={handleTrigger}>
                <Play className="h-4 w-4 mr-1" />
                Trigger Now
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Trigger</p>
              <p className="font-medium">{routine.triggerSummary}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Action Type</p>
              <p className="font-medium">{routine.actionType}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Run Count</p>
              <p className="font-medium">{routine.runCount}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Next Fire</p>
              <p className="font-medium">{formatDate(routine.nextFireAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Run History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run History</CardTitle>
        </CardHeader>
        <CardContent>
          {routine.recentRuns.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">No runs yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routine.recentRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-gray-500 dark:text-gray-400">{formatDate(run.startedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={run.status === "completed" ? "success" : run.status === "failed" ? "destructive" : "secondary"}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 dark:text-gray-400">
                      {formatDuration(run.startedAt, run.completedAt)}
                    </TableCell>
                    <TableCell className="text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {run.resultSummary ?? "-"}
                    </TableCell>
                    <TableCell className="text-gray-500 dark:text-gray-400">
                      {run.tokensUsed != null ? run.tokensUsed.toLocaleString() : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
