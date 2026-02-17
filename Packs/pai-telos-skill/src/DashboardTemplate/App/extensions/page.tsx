"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Puzzle, Plus, Trash2, ExternalLink, Shield, Circle } from "lucide-react"
import type { PAIExtension } from "@/types/pai"

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState<PAIExtension[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [installName, setInstallName] = useState("")
  const [installUrl, setInstallUrl] = useState("")
  const [installing, setInstalling] = useState(false)
  const [authPending, setAuthPending] = useState<string | null>(null)

  const fetchExtensions = useCallback(async () => {
    try {
      const res = await fetch("/api/pai/extensions")
      if (!res.ok) {
        setOffline(true)
        return
      }
      const data = await res.json() as { extensions: PAIExtension[]; offline?: boolean }
      if (data.offline) {
        setOffline(true)
        return
      }
      setExtensions(data.extensions)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchExtensions()
  }, [fetchExtensions])

  const handleInstall = async () => {
    if (!installName.trim()) return
    setInstalling(true)
    try {
      // Phase 3 deferral: write operations stay on IronClaw proxy until PAI extensions API routes are added
      const res = await fetch("/api/ironclaw/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: installName,
          url: installUrl.trim() || undefined,
        }),
      })
      if (res.ok) {
        setInstallName("")
        setInstallUrl("")
        await fetchExtensions()
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleRemove = async (name: string) => {
    if (!window.confirm(`Remove extension "${name}"?`)) return
    const res = await fetch(`/api/ironclaw/extensions/${name}`, {
      method: "DELETE",
    })
    if (res.ok) {
      await fetchExtensions()
    }
  }

  const handleAuth = async (name: string) => {
    try {
      const res = await fetch(`/api/ironclaw/extensions/${name}/auth`, {
        method: "POST",
      })
      if (!res.ok) return
      const data = (await res.json()) as { auth_url?: string }
      if (data.auth_url) {
        window.open(data.auth_url, "_blank")
        setAuthPending(name)
        setTimeout(() => {
          void fetchExtensions()
          setAuthPending(null)
        }, 5000)
      }
    } catch {
      // Auth request failed silently
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
        <Puzzle className="h-10 w-10 mr-3 text-[#2e7de9]" />
        Extensions
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">Manage IronClaw extensions and integrations</p>

      {offline ? (
        <Card className="border-[#f0a020]/30 max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Puzzle className="h-16 w-16 text-[#f0a020] mb-4" />
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">IronClaw is not running</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Start IronClaw to manage extensions</p>
            <code className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-600 dark:text-gray-400">
              cd ~/ironclaw && cargo run
            </code>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Install Form */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-[#33b579]" />
                Install Extension
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Extension name"
                  value={installName}
                  onChange={(e) => setInstallName(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/50 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
                />
                <input
                  type="text"
                  placeholder="URL (optional)"
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/50 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
                />
                <Button onClick={handleInstall} disabled={installing || !installName.trim()}>
                  {installing ? "Installing..." : "Install"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Extensions Grid */}
          {extensions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Puzzle className="h-16 w-16 text-gray-300 dark:text-gray-500 mb-4" />
                <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No extensions installed</p>
                <p className="text-sm text-gray-400 mt-2">Use the form above to install an extension</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {extensions.map((ext) => (
                <Card key={ext.name}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold">{ext.name}</h3>
                        {ext.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{ext.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Circle
                          className={`h-2.5 w-2.5 ${ext.active ? "fill-[#33b579] text-[#33b579]" : "fill-gray-300 text-gray-300 dark:fill-gray-500 dark:text-gray-500"}`}
                        />
                        <Badge variant="secondary">{ext.kind}</Badge>
                      </div>
                    </div>

                    {/* Tools */}
                    {ext.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {ext.tools.map((tool) => (
                          <Badge key={tool} variant="outline" className="text-xs">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        {!ext.authenticated && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAuth(ext.name)}
                            disabled={authPending === ext.name}
                          >
                            <Shield className="h-4 w-4 mr-1" />
                            {authPending === ext.name ? "Waiting..." : "Authenticate"}
                          </Button>
                        )}
                        {ext.url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(ext.url, "_blank")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(ext.name)}
                        className="text-[#f52a65] hover:text-[#f52a65]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
