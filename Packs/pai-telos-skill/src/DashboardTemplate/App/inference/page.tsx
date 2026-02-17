"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Zap, Pencil, Save, X } from "lucide-react"

interface VariantModels {
  fast: string
  standard: string
  smart: string
}

interface VariantInfo {
  name: string
  provider: string
  baseUrl: string
  models: VariantModels
  timeoutMultiplier: string
}

const TIER_LABELS: { key: keyof VariantModels; label: string; hint: string }[] = [
  { key: "fast", label: "Fast (Haiku)", hint: "Quick classification, simple generation" },
  { key: "standard", label: "Standard (Sonnet)", hint: "Balanced reasoning, typical analysis" },
  { key: "smart", label: "Smart (Opus)", hint: "Deep reasoning, strategic decisions" },
]

export default function InferencePage() {
  const [variants, setVariants] = useState<VariantInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [editingVariant, setEditingVariant] = useState<string | null>(null)
  const [editModels, setEditModels] = useState<VariantModels>({ fast: "", standard: "", smart: "" })
  const [editTimeout, setEditTimeout] = useState("1")
  const [isSaving, setIsSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ variant: string; status: "success" | "error" } | null>(null)

  const fetchVariants = useCallback(async () => {
    try {
      const res = await fetch("/api/cc-mirror/variants")
      if (!res.ok) return
      const data = (await res.json()) as { variants: VariantInfo[] }
      setVariants(data.variants)
    } catch {
      // Fetch failed
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchVariants()
  }, [fetchVariants])

  // Clear save feedback after 3s
  useEffect(() => {
    if (!saveResult) return
    const timer = setTimeout(() => setSaveResult(null), 3000)
    return () => clearTimeout(timer)
  }, [saveResult])

  const startEdit = (variant: VariantInfo) => {
    setEditingVariant(variant.name)
    setEditModels({ ...variant.models })
    setEditTimeout(variant.timeoutMultiplier)
  }

  const cancelEdit = () => {
    setEditingVariant(null)
  }

  const handleSave = async (name: string) => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/cc-mirror/variants/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fast: editModels.fast,
          standard: editModels.standard,
          smart: editModels.smart,
          timeoutMultiplier: editTimeout,
        }),
      })
      if (res.ok) {
        setSaveResult({ variant: name, status: "success" })
        setEditingVariant(null)
        await fetchVariants()
      } else {
        setSaveResult({ variant: name, status: "error" })
      }
    } catch {
      setSaveResult({ variant: name, status: "error" })
    } finally {
      setIsSaving(false)
    }
  }

  const providerColor = (provider: string): string => {
    switch (provider) {
      case "openrouter": return "#9854f1"
      case "ollama": return "#33b579"
      default: return "#2e7de9"
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
          <Zap className="h-10 w-10 mr-3 text-[#2e7de9]" />
          Inference
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">Configure LLM models for each CC-Mirror variant</p>
        <div className="flex items-center justify-center py-16 text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
        <Zap className="h-10 w-10 mr-3 text-[#2e7de9]" />
        Inference
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">Configure LLM models for each CC-Mirror variant</p>

      {variants.length === 0 ? (
        <Card className="border-[#f0a020]/30 max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="h-16 w-16 text-[#f0a020] mb-4" />
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">No CC-Mirror variants found</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Install CC-Mirror to configure alternative LLM providers
            </p>
            <code className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-600 dark:text-gray-400">
              npm install -g cc-mirror
            </code>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {variants.map((variant) => {
            const isEditing = editingVariant === variant.name
            const justSaved = saveResult?.variant === variant.name

            return (
              <Card key={variant.name} className={isEditing ? "ring-2 ring-[#2e7de9]/30" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-3">
                      {variant.name}
                      <Badge
                        style={{ backgroundColor: providerColor(variant.provider), color: "white" }}
                      >
                        {variant.provider}
                      </Badge>
                      {justSaved && (
                        <Badge variant={saveResult.status === "success" ? "success" : "destructive"}>
                          {saveResult.status === "success" ? "Saved" : "Error"}
                        </Badge>
                      )}
                    </CardTitle>
                    {!isEditing && (
                      <Button size="sm" variant="outline" onClick={() => startEdit(variant)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono">{variant.baseUrl}</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {TIER_LABELS.map(({ key, label, hint }) => (
                      <div key={key} className="flex items-center gap-4">
                        <div className="w-40 shrink-0">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</div>
                          <div className="text-xs text-gray-400">{hint}</div>
                        </div>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editModels[key]}
                            onChange={(e) =>
                              setEditModels((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className="flex-1 px-3 py-1.5 text-sm font-mono border rounded-md focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/40 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
                            placeholder="model-name/variant"
                          />
                        ) : (
                          <code className="flex-1 px-3 py-1.5 text-sm bg-gray-50 dark:bg-[#0f1117] rounded-md text-gray-700 dark:text-gray-300">
                            {variant.models[key] || "\u2014"}
                          </code>
                        )}
                      </div>
                    ))}

                    {/* Timeout multiplier */}
                    <div className="flex items-center gap-4">
                      <div className="w-40 shrink-0">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Timeout multiplier</div>
                        <div className="text-xs text-gray-400">Scale default timeouts</div>
                      </div>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editTimeout}
                          onChange={(e) => setEditTimeout(e.target.value)}
                          className="w-20 px-3 py-1.5 text-sm font-mono border rounded-md focus:outline-none focus:ring-2 focus:ring-[#2e7de9]/40 dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200"
                          placeholder="1"
                        />
                      ) : (
                        <code className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-[#0f1117] rounded-md text-gray-700 dark:text-gray-300">
                          {variant.timeoutMultiplier}x
                        </code>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t dark:border-gray-700">
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleSave(variant.name)}
                        disabled={isSaving}
                      >
                        <Save className="h-3.5 w-3.5 mr-1" />
                        {isSaving ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
