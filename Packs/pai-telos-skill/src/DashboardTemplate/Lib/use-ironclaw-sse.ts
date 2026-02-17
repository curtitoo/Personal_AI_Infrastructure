"use client"

import { useEffect, useRef, useCallback } from "react"
import type { PAIStreamEvent } from "@/types/pai"

interface UseIronclawSSEOptions {
  threadId?: string
  onEvent: (event: PAIStreamEvent) => void
  enabled?: boolean
}

const MAX_RETRIES = 10
const BASE_DELAY = 3000 // 3s initial, doubles each retry, caps at 60s

export function useIronclawSSE({ threadId, onEvent, enabled = true }: UseIronclawSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const retryCountRef = useRef(0)

  const connect = useCallback(() => {
    if (!enabled) return

    const params = threadId ? `?thread_id=${threadId}` : ""
    const url = `/api/ironclaw/chat/events${params}`

    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onopen = () => {
      retryCountRef.current = 0
    }

    es.onmessage = (event) => {
      try {
        const parsed: PAIStreamEvent = JSON.parse(event.data as string)
        onEventRef.current(parsed)
      } catch {
        // Non-JSON event (heartbeat etc)
      }
    }

    es.onerror = () => {
      es.close()
      retryCountRef.current += 1
      if (retryCountRef.current > MAX_RETRIES) return // Stop after max retries
      const delay = Math.min(BASE_DELAY * Math.pow(2, retryCountRef.current - 1), 60000)
      setTimeout(() => {
        if (enabled) connect()
      }, delay)
    }
  }, [threadId, enabled])

  useEffect(() => {
    connect()
    return () => {
      eventSourceRef.current?.close()
    }
  }, [connect])

  return {
    close: () => eventSourceRef.current?.close(),
  }
}
