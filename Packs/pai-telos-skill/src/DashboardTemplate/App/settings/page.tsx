"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Settings2, Plus, Trash2, Download, Upload, Check, X } from "lucide-react"
import type { Setting, SettingsExport } from "@/types/ironclaw"

interface PaiSettingsData {
  global: Record<string, unknown>
  local: Record<string, unknown>
  globalPath: string
  localPath: string
}

const PAI_SETTINGS_INITIAL: PaiSettingsData = {
  global: {},
  local: {},
  globalPath: "",
  localPath: "",
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [paiSettings, setPaiSettings] = useState<PaiSettingsData>(PAI_SETTINGS_INITIAL)
  const [paiLoading, setPaiLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/ironclaw/settings")
      if (!res.ok) {
        setOffline(true)
        return
      }
      const data: unknown = await res.json()
      // Handle both array and { settings: [...] } response shapes
      if (Array.isArray(data)) {
        setSettings(data as Setting[])
      } else if (
        typeof data === "object" &&
        data !== null &&
        "settings" in data
      ) {
        const wrapped = data as { settings: unknown }
        if (Array.isArray(wrapped.settings)) {
          setSettings(wrapped.settings as Setting[])
        } else {
          // settings is a Record<string, string> -- convert to Setting[]
          const record = wrapped.settings as Record<string, string>
          setSettings(
            Object.entries(record).map(([key, value]) => ({ key, value }))
          )
        }
      } else {
        setSettings([])
      }
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    async function fetchPaiSettings() {
      try {
        const res = await fetch("/api/pai/settings")
        if (!res.ok) return
        const data = (await res.json()) as PaiSettingsData
        setPaiSettings(data)
      } catch {
        // PAI settings unavailable
      } finally {
        setPaiLoading(false)
      }
    }
    void fetchPaiSettings()
  }, [])

  const displayValue = (val: unknown): string => {
    if (typeof val === "string") return val
    return JSON.stringify(val)
  }

  const startEdit = (setting: Setting) => {
    setEditingKey(setting.key)
    setEditValue(displayValue(setting.value))
  }

  const handleSaveEdit = async () => {
    if (!editingKey) return
    const res = await fetch(`/api/ironclaw/settings/${editingKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: editingKey, value: editValue }),
    })
    if (res.ok) {
      setEditingKey(null)
      setEditValue("")
      await fetchSettings()
    }
  }

  const handleAdd = async () => {
    if (!newKey.trim()) return
    const res = await fetch(`/api/ironclaw/settings/${newKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: newKey, value: newValue }),
    })
    if (res.ok) {
      setNewKey("")
      setNewValue("")
      await fetchSettings()
    }
  }

  const handleDelete = async (key: string) => {
    if (!window.confirm(`Delete setting "${key}"?`)) return
    const res = await fetch(`/api/ironclaw/settings/${key}`, {
      method: "DELETE",
    })
    if (res.ok) {
      await fetchSettings()
    }
  }

  const handleExport = async () => {
    try {
      const res = await fetch("/api/ironclaw/settings/export")
      if (!res.ok) return
      const data: unknown = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "ironclaw-settings.json"
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Export failed silently
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const parsed: unknown = JSON.parse(text)
      const res = await fetch("/api/ironclaw/settings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      })
      if (res.ok) {
        // Count imported settings
        const settingsData = parsed as SettingsExport
        const count = settingsData.settings
          ? Object.keys(settingsData.settings).length
          : 0
        setImportResult(`Imported ${String(count)} settings`)
        await fetchSettings()
      }
    } catch {
      // Import failed silently
    } finally {
      setImporting(false)
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
        <Settings2 className="h-10 w-10 mr-3 text-[#2e7de9]" />
        Settings
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">PAI and IronClaw configuration</p>

      <Tabs defaultValue="ironclaw" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="ironclaw">IronClaw Settings</TabsTrigger>
          <TabsTrigger value="pai">PAI Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="ironclaw">
      {offline ? (
        <Card className="border-[#f0a020]/30 max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Settings2 className="h-16 w-16 text-[#f0a020] mb-4" />
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">IronClaw is not running</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Start IronClaw to manage settings</p>
            <code className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-600 dark:text-gray-400">
              cd ~/ironclaw && cargo run
            </code>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Add Setting */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-[#33b579]" />
                Add Setting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Key"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/50 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/50 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
                />
                <Button onClick={handleAdd} disabled={!newKey.trim()}>
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Settings Table */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">All Settings</CardTitle>
            </CardHeader>
            <CardContent>
              {settings.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">No settings configured</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.map((setting) => (
                      <TableRow key={setting.key}>
                        <TableCell className="font-mono text-sm">{setting.key}</TableCell>
                        <TableCell>
                          {editingKey === setting.key ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/50 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200"
                              />
                              <Button size="sm" variant="ghost" onClick={handleSaveEdit}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingKey(null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span
                              className="cursor-pointer hover:text-[#2e7de9]"
                              onClick={() => startEdit(setting)}
                            >
                              {displayValue(setting.value)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-500 dark:text-gray-400 text-sm">
                          {setting.updated_at
                            ? new Date(setting.updated_at).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(setting.key)}
                            className="text-[#f52a65] hover:text-[#f52a65]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Import/Export */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Download className="h-5 w-5 text-[#9854f1]" />
                Import / Export
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Button variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export JSON
                </Button>
                <div className="relative">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    className="hidden"
                    ref={fileInputRef}
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {importing ? "Importing..." : "Import JSON"}
                  </Button>
                </div>
                {importResult && <Badge variant="success">{importResult}</Badge>}
              </div>
            </CardContent>
          </Card>
        </>
      )}
        </TabsContent>

        <TabsContent value="pai">
          {paiLoading ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">Loading PAI settings...</p>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Global Settings</CardTitle>
                  {paiSettings.globalPath && (
                    <p className="text-xs text-gray-400 font-mono mt-1">{paiSettings.globalPath}</p>
                  )}
                </CardHeader>
                <CardContent>
                  {Object.keys(paiSettings.global).length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">No global settings</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Key</TableHead>
                          <TableHead>Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(paiSettings.global).map(([key, value]) => (
                          <TableRow key={key}>
                            <TableCell className="font-mono text-sm">{key}</TableCell>
                            <TableCell className="text-sm">
                              {typeof value === "object" && value !== null ? (
                                <pre className="text-xs bg-gray-50 dark:bg-[#0f1117] p-2 rounded max-h-24 overflow-y-auto">
                                  {JSON.stringify(value, null, 2)}
                                </pre>
                              ) : (
                                String(value)
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Local Settings</CardTitle>
                  {paiSettings.localPath && (
                    <p className="text-xs text-gray-400 font-mono mt-1">{paiSettings.localPath}</p>
                  )}
                </CardHeader>
                <CardContent>
                  {Object.keys(paiSettings.local).length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">No local settings</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Key</TableHead>
                          <TableHead>Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(paiSettings.local).map(([key, value]) => (
                          <TableRow key={key}>
                            <TableCell className="font-mono text-sm">{key}</TableCell>
                            <TableCell className="text-sm">
                              {typeof value === "object" && value !== null ? (
                                <pre className="text-xs bg-gray-50 dark:bg-[#0f1117] p-2 rounded max-h-24 overflow-y-auto">
                                  {JSON.stringify(value, null, 2)}
                                </pre>
                              ) : (
                                String(value)
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
