import fs from "fs"
import path from "path"
import os from "os"

const CC_MIRROR_DIR = path.join(os.homedir(), ".cc-mirror")

/** Only these env vars are exposed/writable through the dashboard. */
const WRITABLE_ENV_KEYS = [
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "PAI_INFERENCE_TIMEOUT_MULTIPLIER",
] as const

export interface VariantInfo {
  name: string
  provider: string
  baseUrl: string
  models: {
    fast: string
    standard: string
    smart: string
  }
  timeoutMultiplier: string
}

interface VariantMeta {
  name: string
  provider: string
  baseUrl: string
}

/** Alphanumeric, dash, underscore only — no path traversal. */
export function isValidVariantName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name)
}

/** List all CC-Mirror variants with their model tier config (no auth tokens). */
export function listVariants(): VariantInfo[] {
  if (!fs.existsSync(CC_MIRROR_DIR)) return []

  const entries = fs.readdirSync(CC_MIRROR_DIR, { withFileTypes: true })
  const variants: VariantInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!isValidVariantName(entry.name)) continue

    const variantJsonPath = path.join(CC_MIRROR_DIR, entry.name, "variant.json")
    const settingsPath = path.join(CC_MIRROR_DIR, entry.name, "config", "settings.json")

    if (!fs.existsSync(variantJsonPath) || !fs.existsSync(settingsPath)) continue

    try {
      const meta = JSON.parse(fs.readFileSync(variantJsonPath, "utf-8")) as VariantMeta
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as { env?: Record<string, string> }
      const env = settings.env ?? {}

      variants.push({
        name: meta.name,
        provider: meta.provider,
        baseUrl: meta.baseUrl,
        models: {
          fast: env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? "",
          standard: env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? "",
          smart: env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? "",
        },
        timeoutMultiplier: env.PAI_INFERENCE_TIMEOUT_MULTIPLIER ?? "1",
      })
    } catch {
      // Skip unreadable variants
    }
  }

  return variants
}

/** Update only whitelisted model tier env vars for a variant. */
export function updateVariantModels(
  name: string,
  models: { fast: string; standard: string; smart: string },
  timeoutMultiplier?: string
): { success: boolean; error?: string } {
  if (!isValidVariantName(name)) {
    return { success: false, error: "Invalid variant name" }
  }

  const settingsPath = path.join(CC_MIRROR_DIR, name, "config", "settings.json")
  if (!fs.existsSync(settingsPath)) {
    return { success: false, error: `Variant "${name}" not found` }
  }

  try {
    const raw = fs.readFileSync(settingsPath, "utf-8")
    const settings = JSON.parse(raw) as { env?: Record<string, string> }

    if (!settings.env) {
      settings.env = {}
    }

    // Only write whitelisted keys
    settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = models.fast
    settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL = models.standard
    settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL = models.smart

    if (timeoutMultiplier !== undefined) {
      settings.env.PAI_INFERENCE_TIMEOUT_MULTIPLIER = timeoutMultiplier
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8")
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to update: ${String(err)}` }
  }
}
