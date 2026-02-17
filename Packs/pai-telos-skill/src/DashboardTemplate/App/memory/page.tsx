"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Database, Edit3, Save, X, Brain } from "lucide-react"
import { FileTree } from "@/components/file-tree"
import type { MemoryEntry, MemoryNode, MemoryContent } from "@/types/ironclaw"

/** PAI learning entry from /api/pai/memory */
interface PaiLearning {
  id: string
  text: string
  concept?: string
  tier?: string
}

/** PAI memory file from /api/pai/memory */
interface PaiMemoryFile {
  name: string
  path: string
  category: string
}

/** Build a nested tree from IronClaw's flat entries list */
function buildTree(entries: MemoryEntry[]): MemoryNode[] {
  const root: MemoryNode[] = []
  const dirMap = new Map<string, MemoryNode>()

  // Sort so directories come before their children
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path))

  for (const entry of sorted) {
    const parts = entry.path.split("/")
    const name = parts[parts.length - 1] ?? entry.path
    const node: MemoryNode = { name, path: entry.path, is_dir: entry.is_dir, children: [] }

    if (entry.is_dir) {
      dirMap.set(entry.path, node)
    }

    // Find parent directory
    const parentPath = parts.slice(0, -1).join("/")
    const parent = parentPath ? dirMap.get(parentPath) : undefined

    if (parent) {
      parent.children.push(node)
    } else {
      root.push(node)
    }
  }

  return root
}

export default function MemoryPage() {
  // --- IronClaw state (unchanged) ---
  const [tree, setTree] = useState<MemoryNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState<MemoryContent | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [saving, setSaving] = useState(false)

  // --- PAI memory state ---
  const [paiLearnings, setPaiLearnings] = useState<PaiLearning[]>([])
  const [paiFiles, setPaiFiles] = useState<PaiMemoryFile[]>([])
  const [paiLoading, setPaiLoading] = useState(true)
  const [paiLearningCount, setPaiLearningCount] = useState(0)
  const [paiFileCount, setPaiFileCount] = useState(0)

  // Fetch PAI memory on mount
  useEffect(() => {
    let cancelled = false
    async function fetchPaiMemory() {
      try {
        const res = await fetch("/api/pai/memory")
        if (!res.ok) return
        const data = await res.json() as {
          learningCount?: number
          learnings?: PaiLearning[]
          fileCount?: number
          files?: PaiMemoryFile[]
        }
        if (!cancelled) {
          setPaiLearnings(data.learnings ?? [])
          setPaiFiles(data.files ?? [])
          setPaiLearningCount(data.learningCount ?? 0)
          setPaiFileCount(data.fileCount ?? 0)
        }
      } catch {
        // PAI memory fetch failed silently
      } finally {
        if (!cancelled) setPaiLoading(false)
      }
    }
    void fetchPaiMemory()
    return () => { cancelled = true }
  }, [])

  // Fetch IronClaw tree on mount
  useEffect(() => {
    let cancelled = false
    async function fetchTree() {
      try {
        const res = await fetch("/api/ironclaw/memory/tree")
        if (!res.ok) {
          setOffline(true)
          return
        }
        const data = await res.json() as { entries?: MemoryEntry[] }
        if (!cancelled && data.entries) {
          setTree(buildTree(data.entries))
        }
      } catch {
        if (!cancelled) setOffline(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchTree()
    return () => { cancelled = true }
  }, [])

  // Fetch content when selectedPath changes
  useEffect(() => {
    if (!selectedPath) {
      setContent(null)
      return
    }
    let cancelled = false
    async function fetchContent() {
      try {
        const res = await fetch(`/api/ironclaw/memory/read?path=${encodeURIComponent(selectedPath!)}`)
        if (!res.ok) return
        const data = await res.json() as MemoryContent
        if (!cancelled) {
          setContent(data)
          setIsEditing(false)
        }
      } catch {
        // Silently handle fetch errors
      }
    }
    void fetchContent()
    return () => { cancelled = true }
  }, [selectedPath])

  const handleSave = useCallback(async () => {
    if (!selectedPath || !content) return
    setSaving(true)
    try {
      const res = await fetch("/api/ironclaw/memory/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedPath, content: editContent }),
      })
      if (res.ok) {
        const refreshRes = await fetch(`/api/ironclaw/memory/read?path=${encodeURIComponent(selectedPath)}`)
        if (refreshRes.ok) {
          const data = await refreshRes.json() as MemoryContent
          setContent(data)
        }
        setIsEditing(false)
      }
    } catch {
      // Silently handle save errors
    } finally {
      setSaving(false)
    }
  }, [selectedPath, content, editContent])

  // Page-level loading: only while initial PAI fetch is running
  if (paiLoading) {
    return (
      <div className="p-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
          <Database className="h-10 w-10 mr-3 text-[#2e7de9]" />
          Memory
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">PAI and IronClaw memory systems</p>
        <div className="flex items-center justify-center py-16 text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
        <Database className="h-10 w-10 mr-3 text-[#2e7de9]" />
        Memory
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">PAI and IronClaw memory systems</p>

      <Tabs defaultValue="pai">
        <TabsList>
          <TabsTrigger value="pai" className="gap-2">
            <Brain className="h-4 w-4" />
            PAI Memory
          </TabsTrigger>
          <TabsTrigger value="ironclaw" className="gap-2">
            <Database className="h-4 w-4" />
            IronClaw Memory
          </TabsTrigger>
        </TabsList>

        {/* ===== PAI Memory Tab ===== */}
        <TabsContent value="pai">
          <div className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Recent Learnings
                  <Badge variant="secondary">{paiLearningCount}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {paiLearnings.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No learnings recorded yet</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {paiLearnings.map((learning) => (
                      <div key={learning.id} className="p-3 border rounded-lg dark:border-gray-700">
                        <p className="text-sm text-gray-700 dark:text-gray-300">{learning.text}</p>
                        <div className="flex gap-2 mt-2">
                          {learning.concept && (
                            <Badge variant="outline" className="text-xs">{learning.concept}</Badge>
                          )}
                          {learning.tier && (
                            <Badge variant="secondary" className="text-xs">{learning.tier}</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Memory Files
                  <Badge variant="secondary">{paiFileCount}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {paiFiles.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No memory files found</p>
                ) : (
                  <div className="space-y-1">
                    {paiFiles.map((file) => (
                      <div
                        key={file.path}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <Badge className="text-[10px] w-20 justify-center">{file.category}</Badge>
                        <span className="text-sm font-mono truncate text-gray-700 dark:text-gray-300">
                          {file.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== IronClaw Memory Tab (existing functionality, unchanged) ===== */}
        <TabsContent value="ironclaw">
          {loading && !offline ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading IronClaw memory...</div>
          ) : offline ? (
            <Card className="border-[#f0a020]/30 max-w-lg mx-auto mt-4">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Database className="h-16 w-16 text-[#f0a020] mb-4" />
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300">IronClaw is not running</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Start IronClaw to browse memory</p>
                <code className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-600 dark:text-gray-400">
                  cd ~/ironclaw && cargo run
                </code>
              </CardContent>
            </Card>
          ) : (
            <div className="flex gap-6 mt-4" style={{ height: "calc(100vh - 280px)" }}>
              {/* Left panel -- file tree */}
              <Card className="w-80 flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-500 dark:text-gray-400">Files</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  {tree.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">No files in memory</p>
                  ) : (
                    <FileTree nodes={tree} selectedPath={selectedPath} onSelect={setSelectedPath} />
                  )}
                </CardContent>
              </Card>

              {/* Right panel -- content viewer / editor */}
              <Card className="flex-1 flex flex-col">
                {content ? (
                  <>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm font-mono truncate">{content.path}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">
                            Updated {new Date(content.updated_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {isEditing ? (
                          <>
                            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                              <Save className="h-3.5 w-3.5 mr-1" />
                              {saving ? "Saving..." : "Save"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                              <X className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setIsEditing(true)
                              setEditContent(content.content)
                            }}
                          >
                            <Edit3 className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto">
                      {isEditing ? (
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full h-full font-mono text-sm p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/40 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200"
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap font-mono text-sm text-gray-700 dark:text-gray-300 p-3">
                          {content.content}
                        </pre>
                      )}
                    </CardContent>
                  </>
                ) : (
                  <CardContent className="flex-1 flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Select a file from the tree</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
