"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Send, Bot, User } from "lucide-react"
import { useIronclawSSE } from "@/lib/use-ironclaw-sse"
import type { PAIStreamEvent, PAIChatThread } from "@/types/pai"

interface Message {
  role: "user" | "assistant" | "system"
  content: string
  timestamp: Date
  tools?: { name: string; status: "started" | "completed" | "error" }[]
  isStreaming?: boolean
}

interface ToolIndicator {
  name: string
  status: "started" | "completed" | "error"
}

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [threadId, setThreadId] = useState<string | undefined>(undefined)
  const [threads, setThreads] = useState<PAIChatThread[]>([])
  const [activeTools, setActiveTools] = useState<ToolIndicator[]>([])
  const [pendingApproval, setPendingApproval] = useState<Record<string, unknown> | null>(null)
  const [sseEnabled, setSseEnabled] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Phase 3 deferral: chat operations stay on IronClaw proxy until PAI chat API routes are added
  useEffect(() => {
    fetch("/api/ironclaw/chat/threads")
      .then(r => {
        if (!r.ok) return { threads: [] }
        return r.json()
      })
      .then((data: { threads?: PAIChatThread[] }) => {
        setThreads(data.threads ?? [])
      })
      .catch(() => {
        // IronClaw offline — threads unavailable
      })
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isThinking, activeTools])

  const handleSSEEvent = useCallback((event: PAIStreamEvent) => {
    switch (event.type) {
      case "response":
      case "stream_chunk": {
        const content = typeof event.data.content === "string" ? event.data.content : ""
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === "assistant" && last.isStreaming) {
            return [...prev.slice(0, -1), { ...last, content: last.content + content }]
          }
          return [...prev, { role: "assistant", content, timestamp: new Date(), isStreaming: true }]
        })
        break
      }
      case "thinking":
        setIsThinking(true)
        break
      case "tool_started":
        setActiveTools(prev => [...prev, { name: String(event.data.name ?? "unknown"), status: "started" as const }])
        break
      case "tool_completed":
        setActiveTools(prev =>
          prev.map(t =>
            t.name === String(event.data.name ?? "") ? { ...t, status: "completed" as const } : t
          )
        )
        break
      case "approval_needed":
        setPendingApproval(event.data)
        break
      case "error":
        setMessages(prev => [
          ...prev,
          { role: "system", content: `Error: ${String(event.data.message ?? "Unknown error")}`, timestamp: new Date() },
        ])
        break
      case "status":
        if (event.data.state === "completed") {
          setIsLoading(false)
          setIsThinking(false)
          setActiveTools([])
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.isStreaming) {
              return [...prev.slice(0, -1), { ...last, isStreaming: false }]
            }
            return prev
          })
        }
        break
    }
  }, [])

  useIronclawSSE({ threadId, onEvent: handleSSEEvent, enabled: sseEnabled })

  const handleApproval = async (approved: boolean) => {
    if (!pendingApproval) return
    try {
      await fetch("/api/ironclaw/chat/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_id: pendingApproval.approval_id, approved }),
      })
    } catch {
      // Approval request failed
    }
    setPendingApproval(null)
  }

  const handleNewThread = () => {
    setThreadId(undefined)
    setMessages([])
    setActiveTools([])
    setPendingApproval(null)
    setIsThinking(false)
    setIsLoading(false)
    setSseEnabled(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    setSseEnabled(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content, thread_id: threadId }),
      })

      if (response.status === 502) {
        setMessages(prev => [
          ...prev,
          { role: "system", content: "IronClaw is not running. Start IronClaw to use the PAI agent.", timestamp: new Date() },
        ])
        setIsLoading(false)
        setSseEnabled(false)
        return
      }

      if (!response.ok) {
        throw new Error("Failed to get response")
      }

      const data = await response.json() as { response?: string; thread_id?: string }

      if (data.thread_id && !threadId) {
        setThreadId(data.thread_id)
      }

      // If SSE didn't already stream a response, use poll result
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === "assistant") {
          // SSE already delivered response
          return prev
        }
        return [
          ...prev,
          { role: "assistant", content: data.response ?? "", timestamp: new Date() },
        ]
      })
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "system", content: "Sorry, I encountered an error. Please try again.", timestamp: new Date() },
      ])
    } finally {
      setIsLoading(false)
      setIsThinking(false)
      setActiveTools([])
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
          <MessageSquare className="h-10 w-10 mr-3 text-[#2e7de9]" />
          Ask PAI
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Chat with your PAI agent for context-aware answers
        </p>
      </div>

      <Card className="border-l-4 border-l-[#2e7de9] max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Chat Interface</span>
            <Badge variant="primary" className="bg-[#2e7de9]">
              PAI Agent
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Thread Selector */}
          <div className="flex items-center gap-2 mb-4">
            <select
              value={threadId ?? ""}
              onChange={(e) => setThreadId(e.target.value || undefined)}
              className="px-3 py-1.5 border rounded-lg text-sm dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200"
            >
              <option value="">Default Thread</option>
              {threads.map(t => (
                <option key={t.id} value={t.id}>{t.title ?? `Thread ${t.id.slice(0, 8)}`}</option>
              ))}
            </select>
            <button
              onClick={handleNewThread}
              className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              + New Thread
            </button>
          </div>

          {/* Tool Execution Indicators */}
          {activeTools.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {activeTools.map((tool, i) => (
                <Badge key={i} variant={tool.status === "completed" ? "success" : "primary"} className="text-xs">
                  {tool.status === "started" ? "\u26A1" : "\u2713"} {tool.name}
                </Badge>
              ))}
            </div>
          )}

          {/* Messages Container */}
          <div className="space-y-4 mb-6 min-h-[400px] max-h-[600px] overflow-y-auto p-4 bg-gray-50 dark:bg-[#0f1117] rounded-lg">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <div className="text-center">
                  <Bot className="h-12 w-12 mx-auto mb-4 text-[#2e7de9] opacity-50" />
                  <p>Start a conversation by typing a message below</p>
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role !== "user" && (
                    <div className="flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        message.role === "system" ? "bg-[#f0a020]" : "bg-[#2e7de9]"
                      }`}>
                        <Bot className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-4 py-3 max-w-[80%] ${
                      message.role === "user"
                        ? "bg-[#2e7de9] text-white"
                        : message.role === "system"
                          ? "bg-[#f0a020]/10 border border-[#f0a020]/30"
                          : "bg-white border border-gray-200 dark:bg-[#1a1d2e] dark:border-gray-700/50"
                    }`}
                  >
                    <div className={`text-sm whitespace-pre-wrap ${
                      message.role === "system" ? "dark:text-gray-200" : message.role === "assistant" ? "dark:text-gray-200" : ""
                    }`}>
                      {message.content}
                      {message.isStreaming && (
                        <span className="inline-block w-1.5 h-4 bg-[#2e7de9] ml-0.5 animate-pulse" />
                      )}
                    </div>
                    <div
                      className={`text-xs mt-2 ${
                        message.role === "user"
                          ? "text-blue-100"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                  {message.role === "user" && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-[#9854f1] flex items-center justify-center">
                        <User className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Thinking Indicator */}
            {isThinking && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-[#9854f1] flex items-center justify-center">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div className="bg-[#9854f1]/10 border border-[#9854f1]/20 rounded-lg px-4 py-3">
                  <span className="text-sm text-[#9854f1]">Thinking...</span>
                </div>
              </div>
            )}

            {/* Loading dots (when waiting but not thinking) */}
            {isLoading && !isThinking && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-[#2e7de9] flex items-center justify-center">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div className="bg-white border border-gray-200 dark:bg-[#1a1d2e] dark:border-gray-700/50 rounded-lg px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-[#2e7de9] rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-[#2e7de9] rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-[#2e7de9] rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Approval Flow */}
          {pendingApproval && (
            <Card className="border-[#f0a020] mb-4">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Agent needs approval: {String(pendingApproval.description ?? "Proceed?")}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproval(true)}
                    className="px-4 py-2 bg-[#33b579] text-white rounded-lg text-sm hover:bg-[#33b579]/90"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleApproval(false)}
                    className="px-4 py-2 bg-[#f52a65] text-white rounded-lg text-sm hover:bg-[#f52a65]/90"
                  >
                    Deny
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2e7de9] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed dark:bg-[#1a1d2e] dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500 dark:disabled:bg-gray-800"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-6 py-3 bg-[#2e7de9] text-white rounded-lg hover:bg-[#2e7de9]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
