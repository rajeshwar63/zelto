// src/lib/data-events.ts
// Lightweight pub/sub for data invalidation across components.
// When a mutation happens, fire an event. Listening components refetch.

type EventType =
  | 'orders:changed'
  | 'payments:changed'
  | 'connections:changed'
  | 'connection-requests:changed'
  | 'issues:changed'
  | 'notifications:changed'
  | 'attachments:changed'
  | 'invoices:changed'
  | 'items:changed'
  | 'opening-balances:changed'

type Listener = () => void

const listeners = new Map<EventType, Set<Listener>>()

export function onDataChange(event: EventType, listener: Listener): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set())
  }
  listeners.get(event)!.add(listener)

  // Return unsubscribe function (use in useEffect cleanup)
  return () => {
    listeners.get(event)?.delete(listener)
  }
}

export function emitDataChange(...events: EventType[]): void {
  for (const event of events) {
    listeners.get(event)?.forEach((fn) => {
      try { fn() } catch (e) { console.error(`data-events [${event}]:`, e) }
    })
  }
}

// React hook for convenience
import { useEffect } from 'react'

export function useDataListener(events: EventType | EventType[], callback: () => void, enabled = true): void {
  const eventKey = Array.isArray(events) ? events.join('|') : events

  useEffect(() => {
    if (!enabled) return

    const eventList = Array.isArray(events) ? events : [events]
    const unsubscribes = eventList.map((e) => onDataChange(e, callback))
    return () => unsubscribes.forEach((unsub) => unsub())
  }, [callback, enabled, eventKey])
}
