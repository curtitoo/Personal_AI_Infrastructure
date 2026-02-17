"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollText, Pause, Play, Trash2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LogEntry, LogLevel } from "@/types/ironclaw"

/** PAI log entry shape from GET /api/pai/logs */
interface PaiLogEntry {
  timestamp: string
  level: "debug" | "info" | "warn" | "error"
  message: string
  source: string
}

type PaiLogLevel = PaiLogEntry["level"]

const levelVariant: Record<LogLevel, "secondary" | "primary" | "warning" | "destructive"> = {
  trace: "secondary",
  debug: "secondary",
  info: "primary",
  warn: "warning",
  error: "destructive",
}

/** PAI levels are a subset of LogLevel -- reuse the same variant map */
const paiLevelVariant: Record<PaiLogLevel, "secondary" | "primary" | "warning" | "destructive"> = {
  debug: "secondary",
  info: "primary",
  warn: "warning",
  error: "destructive",
}

const MAX_ENTRIES = 500

export default function LogsPage() {
  // ── IronClaw SSE state (unchanged) ──────────────────────────────────
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [levelFilter, setLevelFilter] = useState<LogLevel | "all">("all")
  const [targetFilter, setTargetFilter] = useState("")
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  const logContainerRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const entriesRef = useRef<LogEntry[]>([])

  // ── PAI logs state ──────────────────────────────────────────────────
  const [paiLogs, setPaiLogs] = useState<PaiLogEntry[]>([])
  const [paiLoading, setPaiLoading] = useState(false)
  const [paiLevelFilter, setPaiLevelFilter] = useState<PaiLogLevel | "all">("all")

  // ── IronClaw SSE logic (unchanged) ──────────────────────────────────

  // Keep pausedRef in sync
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // Fetch initial history + connect SSE
  useEffect(() => {
    let eventSource: EventSource | null = null
    let cancelled = false

    // Connect SSE for live log streaming
    // (IronClaw doesn't have a REST logs endpoint -- SSE only)
    eventSource = new EventSource("/api/ironclaw/logs/events")

    const handleLogEvent = (event: MessageEvent) => {
      if (cancelled) return
      try {
        const raw = JSON.parse(event.data as string) as Record<string, unknown>
        // IronClaw sends levels in UPPERCASE ("INFO"), normalize to lowercase
        const entry: LogEntry = {
          ...raw,
          level: (typeof raw.level === "string" ? raw.level.toLowerCase() : "info") as LogLevel,
        } as LogEntry
        entriesRef.current = [...entriesRef.current.slice(-(MAX_ENTRIES - 1)), entry]
        if (!pausedRef.current) {
          setEntries([...entriesRef.current])
        }
      } catch {
        // Ignore parse errors
      }
    }

    eventSource.addEventListener("log", handleLogEvent)
    eventSource.addEventListener("message", handleLogEvent)

    eventSource.onopen = () => {
      if (!cancelled) {
        setOffline(false)
        setLoading(false)
      }
    }

    eventSource.onerror = () => {
      if (!cancelled) {
        setOffline(true)
        setLoading(false)
      }
    }

    // Mark as loaded after a short delay if SSE connects
    const timer = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 2000)

    return () => {
      cancelled = true
      clearTimeout(timer)
      eventSource?.close()
    }
  }, [])

  // Auto-scroll on entries update
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  // Detect user scroll
  const handleScroll = useCallback(() => {
    const el = logContainerRef.current
    if (!el) return
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50
    setAutoScroll(atBottom)
  }, [])

  // Resume from paused: sync entries from ref
  const togglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev
      if (!next) {
        // Resuming -- sync state from ref
        setEntries([...entriesRef.current])
      }
      return next
    })
  }, [])

  const clearEntries = useCallback(() => {
    entriesRef.current = []
    setEntries([])
  }, [])

  // Client-side filtering (IronClaw)
  const filteredEntries = entries.filter((entry) => {
    if (levelFilter !== "all" && entry.level !== levelFilter) return false
    if (targetFilter && !entry.target.toLowerCase().includes(targetFilter.toLowerCase())) return false
    return true
  })

  // ── PAI logs logic ──────────────────────────────────────────────────

  const fetchPaiLogs = useCallback(async () => {
    setPaiLoading(true)
    try {
      const res = await fetch("/api/pai/logs")
      if (!res.ok) throw new Error("Failed to fetch PAI logs")
      const data = (await res.json()) as { entries: PaiLogEntry[]; total: number }
      setPaiLogs(data.entries)
    } catch {
      // Silently handle -- user can retry with refresh button
    } finally {
      setPaiLoading(false)
    }
  }, [])

  // Fetch PAI logs on mount
  useEffect(() => {
    void fetchPaiLogs()
  }, [fetchPaiLogs])

  // Client-side filtering (PAI)
  const filteredPaiLogs = paiLogs.filter((entry) => {
    if (paiLevelFilter !== "all" && entry.level !== paiLevelFilter) return false
    return true
  })

  // ── Render ──────────────────────────────────────────────────────────

  if (loading && !offline) {
    return (
      <div className="p-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
          <ScrollText className="h-10 w-10 mr-3 text-[#2e7de9]" />
          Logs
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">PAI debug logs and IronClaw system logs</p>
        <div className="flex items-center justify-center py-16 text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
        <ScrollText className="h-10 w-10 mr-3 text-[#2e7de9]" />
        Logs
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">PAI debug logs and IronClaw system logs</p>

      <Tabs defaultValue="ironclaw">
        <TabsList className="mb-4">
          <TabsTrigger value="ironclaw">IronClaw Logs</TabsTrigger>
          <TabsTrigger value="pai">PAI Logs</TabsTrigger>
        </TabsList>

        {/* ── IronClaw Logs Tab ── */}
        <TabsContent value="ironclaw">
          {offline ? (
            <Card className="border-[#f0a020]/30 max-w-lg mx-auto">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <ScrollText className="h-16 w-16 text-[#f0a020] mb-4" />
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300">IronClaw is not running</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Start IronClaw to view logs</p>
                <code className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-600 dark:text-gray-400">
                  cd ~/ironclaw && cargo run
                </code>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Controls */}
              <Card className="mb-4">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-4">
                    <select
                      value={levelFilter}
                      onChange={(e) => setLevelFilter(e.target.value as LogLevel | "all")}
                      className="px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/40 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200"
                    >
                      <option value="all">All levels</option>
                      <option value="trace">Trace</option>
                      <option value="debug">Debug</option>
                      <option value="info">Info</option>
                      <option value="warn">Warn</option>
                      <option value="error">Error</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Filter by target..."
                      value={targetFilter}
                      onChange={(e) => setTargetFilter(e.target.value)}
                      className="px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/40 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
                    />
                    <Button size="sm" onClick={togglePause}>
                      {paused ? <Play className="h-3.5 w-3.5 mr-1" /> : <Pause className="h-3.5 w-3.5 mr-1" />}
                      {paused ? "Resume" : "Pause"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={clearEntries}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Clear
                    </Button>
                    <Badge variant="secondary">{entries.length} entries</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Log entries */}
              <Card>
                <CardContent className="p-0">
                  <div
                    ref={logContainerRef}
                    onScroll={handleScroll}
                    className="h-[calc(100vh-320px)] overflow-y-auto font-mono text-xs"
                  >
                    {filteredEntries.length === 0 ? (
                      <div className="flex items-center justify-center py-16 text-gray-400">
                        <p className="text-sm">No log entries</p>
                      </div>
                    ) : (
                      filteredEntries.map((entry, idx) => (
                        <div
                          key={`${entry.timestamp}-${idx}`}
                          className="flex items-start gap-2 px-4 py-1.5 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
                        >
                          <Badge
                            variant={levelVariant[entry.level]}
                            className="text-[10px] w-14 justify-center shrink-0 mt-0.5"
                          >
                            {entry.level}
                          </Badge>
                          <span className="text-gray-400 shrink-0 w-20">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400 shrink-0 w-32 truncate">
                            {entry.target}
                          </span>
                          <span className="text-gray-700 dark:text-gray-300 break-all">
                            {entry.message}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── PAI Logs Tab ── */}
        <TabsContent value="pai">
          {/* Controls */}
          <Card className="mb-4">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-4">
                <select
                  value={paiLevelFilter}
                  onChange={(e) => setPaiLevelFilter(e.target.value as PaiLogLevel | "all")}
                  className="px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/40 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200"
                >
                  <option value="all">All levels</option>
                  <option value="debug">Debug</option>
                  <option value="info">Info</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error</option>
                </select>
                <Button size="sm" onClick={fetchPaiLogs} disabled={paiLoading}>
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1", paiLoading && "animate-spin")} />
                  Refresh
                </Button>
                <Badge variant="secondary">{filteredPaiLogs.length} entries</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Log entries */}
          <Card>
            <CardContent className="p-0">
              <div className="h-[calc(100vh-320px)] overflow-y-auto font-mono text-xs">
                {filteredPaiLogs.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-400">
                    <p className="text-sm">No PAI log entries</p>
                  </div>
                ) : (
                  filteredPaiLogs.map((entry, idx) => (
                    <div
                      key={`${entry.timestamp}-${idx}`}
                      className="flex items-start gap-2 px-4 py-1.5 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
                    >
                      <Badge
                        variant={paiLevelVariant[entry.level]}
                        className="text-[10px] w-14 justify-center shrink-0 mt-0.5"
                      >
                        {entry.level}
                      </Badge>
                      <span className="text-gray-400 shrink-0 w-20">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 shrink-0 w-32 truncate">
                        {entry.source}
                      </span>
                      <span className="text-gray-700 dark:text-gray-300 break-all">
                        {entry.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
