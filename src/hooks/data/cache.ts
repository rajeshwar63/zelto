import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDataListener } from '@/lib/data-events'

type DataEvent = Parameters<typeof useDataListener>[0]

interface CacheEntry<T> {
  data?: T
  updatedAt?: number
  promise?: Promise<T>
  error?: unknown
}

const cache = new Map<string, CacheEntry<unknown>>()
const subscribers = new Map<string, Set<() => void>>()

function notify(key: string): void {
  subscribers.get(key)?.forEach(listener => {
    try {
      listener()
    } catch (error) {
      console.error(`cache subscriber failed [${key}]`, error)
    }
  })
}

function subscribe(key: string, listener: () => void): () => void {
  if (!subscribers.has(key)) {
    subscribers.set(key, new Set())
  }
  subscribers.get(key)!.add(listener)
  return () => subscribers.get(key)?.delete(listener)
}

export function invalidateCacheKey(key: string): void {
  cache.delete(key)
  notify(key)
}

async function fetchWithCache<T>(key: string, fetcher: () => Promise<T>, forceRefresh = false): Promise<T> {
  const current = cache.get(key) as CacheEntry<T> | undefined

  if (!forceRefresh && current?.promise) {
    return current.promise
  }

  const promise = fetcher()
  cache.set(key, {
    ...current,
    promise,
  })

  try {
    const data = await promise
    cache.set(key, {
      data,
      updatedAt: Date.now(),
    })
    notify(key)
    return data
  } catch (error) {
    cache.set(key, {
      ...current,
      error,
    })
    notify(key)
    throw error
  }
}

interface QueryOptions<T> {
  key: string
  fetcher: () => Promise<T>
  events?: DataEvent[]
}

export function useCachedQuery<T>({ key, fetcher, events = [] }: QueryOptions<T>) {
  const initialEntry = cache.get(key) as CacheEntry<T> | undefined

  const [data, setData] = useState<T | undefined>(initialEntry?.data)
  const [error, setError] = useState<unknown>(initialEntry?.error)
  const [isInitialLoading, setIsInitialLoading] = useState(!initialEntry?.data)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)

  const refresh = useCallback(async (force = false) => {
    const entry = cache.get(key) as CacheEntry<T> | undefined
    const hasSnapshot = entry?.data !== undefined

    if (!mountedRef.current) return

    if (!hasSnapshot) {
      setIsInitialLoading(true)
    } else {
      setIsRefreshing(true)
      setData(entry?.data)
    }

    try {
      const next = await fetchWithCache(key, fetcher, force)
      if (!mountedRef.current) return
      setData(next)
      setError(undefined)
    } catch (nextError) {
      if (!mountedRef.current) return
      setError(nextError)
    } finally {
      if (!mountedRef.current) return
      setIsInitialLoading(false)
      setIsRefreshing(false)
    }
  }, [fetcher, key])

  useEffect(() => {
    mountedRef.current = true
    const unsubscribe = subscribe(key, () => {
      const latest = cache.get(key) as CacheEntry<T> | undefined
      if (!mountedRef.current) return
      setData(latest?.data)
      setError(latest?.error)
    })

    const entry = cache.get(key) as CacheEntry<T> | undefined
    if (entry?.data) {
      setData(entry.data)
      setIsInitialLoading(false)
      void refresh(true)
    } else {
      void refresh(false)
    }

    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [key, refresh])

  useDataListener(events, () => {
    invalidateCacheKey(key)
    void refresh(true)
  })

  return useMemo(() => ({
    data,
    error,
    isInitialLoading,
    isRefreshing,
    refresh,
  }), [data, error, isInitialLoading, isRefreshing, refresh])
}
