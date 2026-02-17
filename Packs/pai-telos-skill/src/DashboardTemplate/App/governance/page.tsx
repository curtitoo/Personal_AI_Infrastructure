"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Shield, AlertTriangle, Activity, BookOpen, Circle } from "lucide-react"

interface SecurityEvent {
  timestamp: string
  event_type: string
  tool: string
  target: string
  pattern_matched?: string
  reason?: string
}

interface SecurityStatus {
  overrideActive: boolean
  overridePath: string
  hooks: {
    state: "healthy" | "degraded" | "missing"
    hookCount: number
  }
}

interface AuditEntry {
  timestamp: string
  setting: string
  oldValue: unknown
  newValue: unknown
}

const HOOK_STATE_META: Record<string, { label: string; color: string; badgeVariant: string }> = {
  healthy: { label: "Healthy", color: "#33b579", badgeVariant: "success" },
  degraded: { label: "Degraded", color: "#f0a020", badgeVariant: "warning" },
  missing: { label: "No Hooks", color: "#f52a65", badgeVariant: "destructive" },
}

const GOVERNANCE_TABLE = [
  { domain: "Safety", outer: "8 compiled rules, injection detection", inner: "YAML patterns, PreToolUse", dashboard: "IronClaw: editable (guarded). PAI: read-only" },
  { domain: "Sandbox", outer: "WASM isolation, 3 policy levels", inner: "N/A", dashboard: "IronClaw: editable (guarded)" },
  { domain: "Settings", outer: "Daemon config (timeouts, limits)", inner: "Cognitive config (models, memory)", dashboard: "Each controls its own" },
  { domain: "Extensions", outer: "Extension lifecycle (install/remove/auth)", inner: "N/A", dashboard: "Write ops through IronClaw" },
  { domain: "Memory", outer: "Agent execution logs", inner: "Learnings, state, work", dashboard: "Each controls its own" },
  { domain: "Logs", outer: "Daemon + agent logs", inner: "Hook + security audit logs", dashboard: "Each generates its own" },
]

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function GovernancePage() {
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null)
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch("/api/pai/security-status").then(r => r.ok ? r.json() : null),
      fetch("/api/pai/security-events?limit=50").then(r => r.ok ? r.json() : { events: [] }),
      fetch("/api/pai/settings-audit?limit=20").then(r => r.ok ? r.json() : { entries: [] }),
    ])
      .then(([statusData, eventsData, auditData]) => {
        setSecurityStatus(statusData as SecurityStatus | null)
        setEvents((eventsData as { events: SecurityEvent[] }).events)
        setAuditEntries((auditData as { entries: AuditEntry[] }).entries)
      })
      .catch(() => {
        // Governance data unavailable
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-400">Loading governance data...</p>
      </div>
    )
  }

  const hookMeta = HOOK_STATE_META[securityStatus?.hooks.state ?? "missing"] ?? HOOK_STATE_META["missing"]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
          <Shield className="h-10 w-10 mr-3 text-[#2e7de9]" />
          Governance
        </h1>
        <div className="flex items-center gap-4">
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Security visibility and authority model
          </p>
          {/* Hook Health Badge */}
          <div className="flex items-center gap-1.5">
            <Circle
              className="h-2.5 w-2.5"
              style={{ color: hookMeta.color, fill: hookMeta.color }}
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Hooks: {hookMeta.label}
              {securityStatus?.hooks.hookCount
                ? ` (${securityStatus.hooks.hookCount})`
                : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Escape Hatch Alert */}
      {securityStatus?.overrideActive && (
        <Card className="border-[#f52a65] bg-[#f52a65]/5 mb-6">
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <AlertTriangle className="h-5 w-5 text-[#f52a65] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#f52a65]">Security Override Active</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                PAI SecurityValidator is bypassed. All commands execute without pattern checking.
              </p>
              <code className="text-xs text-gray-500 dark:text-gray-400 mt-2 block">
                Remove {securityStatus.overridePath} to restore protection.
              </code>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Security Events */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#9854f1]" />
              Security Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Shield className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-400 font-medium">No security events recorded</p>
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Tool</TableHead>
                      <TableHead>Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                          {formatTimestamp(event.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              event.event_type === "block"
                                ? "destructive"
                                : event.event_type === "confirm"
                                  ? "warning"
                                  : event.event_type === "alert"
                                    ? "warning"
                                    : "secondary"
                            }
                            className="text-xs"
                          >
                            {event.event_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{event.tool}</TableCell>
                        <TableCell className="text-xs font-mono max-w-[200px] truncate" title={event.target}>
                          {event.target}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings Audit Log */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#f0a020]" />
              Settings Audit Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Shield className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-400 font-medium">No settings changes recorded</p>
                <p className="text-xs text-gray-300 dark:text-gray-500 mt-1">
                  Changes to critical IronClaw settings will appear here
                </p>
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Setting</TableHead>
                      <TableHead>Old</TableHead>
                      <TableHead>New</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEntries.map((entry, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                          {formatTimestamp(entry.timestamp)}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{entry.setting}</TableCell>
                        <TableCell className="text-xs">{String(entry.oldValue)}</TableCell>
                        <TableCell className="text-xs font-semibold">{String(entry.newValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Governance Reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-[#2e7de9]" />
            Authority Model Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            IronClaw is the outer authority (Rust hard boundaries). PAI is the inner authority (contextual YAML policy).
            The dashboard respects this hierarchy — critical IronClaw settings require confirmation before changes.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>IronClaw (Outer)</TableHead>
                <TableHead>PAI (Inner)</TableHead>
                <TableHead>Dashboard</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GOVERNANCE_TABLE.map(row => (
                <TableRow key={row.domain}>
                  <TableCell className="font-medium">{row.domain}</TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-400">{row.outer}</TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-400">{row.inner}</TableCell>
                  <TableCell className="text-sm">{row.dashboard}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
