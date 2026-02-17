"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Activity,
  Kanban,
  List,
  Upload,
  FileText,
  Table,
  Bot,
  Timer,
  Database,
  ScrollText,
  Circle,
  MessageSquare,
  Puzzle,
  Settings2,
  Wrench,
  ChevronDown,
  ChevronRight,
  Zap,
  Shield,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { useEffect, useState } from "react"

interface FileNav {
  name: string
  slug: string
  href: string
  isCSV: boolean
}

const commandCenterNav = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Agent Tracker", href: "/agent-tracker", icon: Activity },
  { name: "Ask PAI", href: "/ask", icon: MessageSquare },
]

const ideaPipelineNav = [
  { name: "Pipeline Board", href: "/pipeline", icon: Kanban },
  { name: "All Ideas", href: "/ideas", icon: List },
]

const phase2AgentsNav = [
  { name: "Active Agents", href: "/agents", icon: Bot },
  { name: "Routines", href: "/routines", icon: Timer },
]

const phase2SystemNav = [
  { name: "Memory", href: "/memory", icon: Database },
  { name: "Logs", href: "/logs", icon: ScrollText },
  { name: "Inference", href: "/inference", icon: Zap },
  { name: "Governance", href: "/governance", icon: Shield },
  { name: "Extensions", href: "/extensions", icon: Puzzle },
  { name: "Settings", href: "/settings", icon: Settings2 },
]

export function Sidebar() {
  const pathname = usePathname()
  const [telosFiles, setTelosFiles] = useState<FileNav[]>([])
  const [telosCount, setTelosCount] = useState(0)
  const [ironclawFiles, setIronclawFiles] = useState<FileNav[]>([])
  const [ironclawCount, setIronclawCount] = useState(0)
  const [telosExpanded, setTelosExpanded] = useState(true)
  const [ironclawExpanded, setIronclawExpanded] = useState(false)
  const [ironclawStatus, setIronclawStatus] = useState<"checking" | "online" | "offline">("checking")

  const fetchFiles = (source: string, setFiles: (f: FileNav[]) => void, setCount: (n: number) => void) => {
    fetch(`/api/files/count?source=${source}`)
      .then((res) => res.json())
      .then((data: { count: number; files: string[] }) => {
        setCount(data.count)
        const navItems: FileNav[] = data.files.map((filename: string) => {
          const isCSV = filename.endsWith(".csv")
          const slug = filename
            .replace(".md", "")
            .replace(".csv", "")
            .replace("data/", "")
            .replace("docs/", "")
          return {
            name: slug,
            slug,
            href: `/file/${slug}?source=${source}`,
            isCSV,
          }
        })
        setFiles(navItems)
      })
      .catch((err) => console.error(`Failed to fetch ${source} files:`, err))
  }

  useEffect(() => {
    fetchFiles("telos", setTelosFiles, setTelosCount)
    fetchFiles("ironclaw", setIronclawFiles, setIronclawCount)

    const handleFileUploaded = () => {
      fetchFiles("telos", setTelosFiles, setTelosCount)
    }
    window.addEventListener("telosFileUploaded", handleFileUploaded)

    fetch("/api/ironclaw/health")
      .then((r) => setIronclawStatus(r.ok ? "online" : "offline"))
      .catch(() => setIronclawStatus("offline"))

    return () => {
      window.removeEventListener("telosFileUploaded", handleFileUploaded)
    }
  }, [])

  const renderNavLink = (
    item: { name: string; href: string; icon: React.ComponentType<{ className?: string }> },
    prefixMatch = false
  ) => {
    const isActive = prefixMatch
      ? pathname === item.href || pathname.startsWith(item.href + "/")
      : pathname === item.href
    return (
      <Link
        key={item.name}
        href={item.href}
        className={cn(
          "group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all",
          isActive
            ? "bg-[#2e7de9] text-white shadow-lg shadow-[#2e7de9]/20"
            : "text-gray-700 hover:bg-white hover:text-[#2e7de9] hover:shadow-sm dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-[#5a9ef5]"
        )}
      >
        <item.icon
          className={cn(
            "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
            isActive ? "text-white" : "text-gray-500 group-hover:text-[#2e7de9] dark:text-gray-400"
          )}
        />
        {item.name}
      </Link>
    )
  }

  const renderFileLink = (item: FileNav, source: string) => {
    const isActive = pathname === `/file/${item.slug}` && new URLSearchParams(window.location.search).get("source") === source
    const Icon = source === "ironclaw" ? Wrench : item.isCSV ? Table : FileText
    const iconColor = source === "ironclaw" ? "text-[#f0a020]" : item.isCSV ? "text-[#33b579]" : "text-[#2e7de9]"

    return (
      <Link
        key={`${source}-${item.slug}`}
        href={item.href}
        className={cn(
          "group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all",
          isActive
            ? "bg-[#2e7de9] text-white shadow-lg shadow-[#2e7de9]/20"
            : "text-gray-700 hover:bg-white hover:text-[#2e7de9] hover:shadow-sm dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-[#5a9ef5]"
        )}
      >
        <Icon
          className={cn(
            "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
            isActive ? "text-white" : `${iconColor} group-hover:text-[#2e7de9]`
          )}
        />
        <span className="truncate">{item.name}</span>
      </Link>
    )
  }

  const renderCollapsibleSection = (
    label: string,
    count: number,
    expanded: boolean,
    onToggle: () => void,
    children: React.ReactNode
  ) => (
    <div className="border-t dark:border-gray-700/50 my-3 pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 mb-2 group"
      >
        <div className="flex items-center gap-1.5">
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-gray-400" />
          ) : (
            <ChevronRight className="h-3 w-3 text-gray-400" />
          )}
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {label}
          </span>
        </div>
        {count > 0 && (
          <Badge variant="secondary" className="bg-gray-200 text-gray-700 text-[10px] dark:bg-gray-700 dark:text-gray-300">
            {count}
          </Badge>
        )}
      </button>
      {expanded && children}
    </div>
  )

  return (
    <div className="flex h-screen w-64 flex-col fixed left-0 top-0 bg-gradient-to-b from-[#2e7de9]/5 to-[#9854f1]/5 border-r dark:from-[#2e7de9]/10 dark:to-[#9854f1]/10 dark:border-gray-700/50 dark:bg-[#12141f]">
      {/* Header */}
      <div className="flex flex-col px-6 py-4 border-b dark:border-gray-700/50">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-[#2e7de9] to-[#9854f1] bg-clip-text text-transparent">
          PAI
        </h1>
        <span className="text-xs text-gray-500 dark:text-gray-400">Personal AI Infrastructure</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {/* COMMAND CENTER */}
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
          Command Center
        </div>
        {commandCenterNav.map((item) => renderNavLink(item))}

        {/* IDEA PIPELINE */}
        <div className="border-t dark:border-gray-700/50 my-3 pt-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
            Idea Pipeline
          </div>
        </div>
        {ideaPipelineNav.map((item) => renderNavLink(item))}

        {/* TELOS (collapsible) */}
        {renderCollapsibleSection("Telos", telosCount, telosExpanded, () => setTelosExpanded((p) => !p), (
          <>
            {telosFiles.map((item) => renderFileLink(item, "telos"))}
            {(() => {
              const isActive = pathname === "/add-file"
              return (
                <Link
                  href="/add-file"
                  className={cn(
                    "group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all",
                    isActive
                      ? "bg-[#2e7de9] text-white shadow-lg shadow-[#2e7de9]/20"
                      : "text-gray-700 hover:bg-white hover:text-[#2e7de9] hover:shadow-sm dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-[#5a9ef5]"
                  )}
                >
                  <Upload
                    className={cn(
                      "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                      isActive ? "text-white" : "text-gray-500 group-hover:text-[#2e7de9] dark:text-gray-400"
                    )}
                  />
                  Add File
                </Link>
              )
            })()}
          </>
        ))}

        {/* IRONCLAW FILES (collapsible) */}
        {renderCollapsibleSection("IronClaw Files", ironclawCount, ironclawExpanded, () => setIronclawExpanded((p) => !p), (
          <>
            {ironclawFiles.map((item) => renderFileLink(item, "ironclaw"))}
          </>
        ))}

        {/* AGENTS */}
        <div className="border-t dark:border-gray-700/50 my-3 pt-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
            Agents
          </div>
        </div>
        {phase2AgentsNav.map((item) => renderNavLink(item, true))}

        {/* SYSTEM */}
        <div className="border-t dark:border-gray-700/50 my-3 pt-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
            System
          </div>
        </div>
        {phase2SystemNav.map((item) => renderNavLink(item, true))}
      </nav>

      {/* Footer */}
      <div className="border-t dark:border-gray-700/50 p-3">
        <ThemeToggle className="w-full mb-2" />
        <div className="flex items-center gap-2 px-3 mb-2">
          <Circle
            className={cn(
              "h-2.5 w-2.5",
              ironclawStatus === "online" && "fill-[#33b579] text-[#33b579]",
              ironclawStatus === "offline" && "fill-[#f52a65] text-[#f52a65]",
              ironclawStatus === "checking" && "fill-gray-400 text-gray-400"
            )}
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">IronClaw</span>
          <span className="text-xs text-gray-400">
            {ironclawStatus === "checking" ? "checking..." : ironclawStatus}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          PAI v2.5 &middot; Algo v0.2.24
        </div>
      </div>
    </div>
  )
}
