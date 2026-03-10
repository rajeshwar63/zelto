import { useCallback, useEffect, useRef, useState } from 'react'

interface UseScreenLoadStateOptions {
  resetKey?: unknown
}

interface LoadState {
  initialLoading: boolean
  refreshing: boolean
  runWithLoadState: <T>(loader: () => Promise<T>) => Promise<T>
}

export function useScreenLoadState(options?: UseScreenLoadStateOptions): LoadState {
  const resetKey = options?.resetKey
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    hasLoadedRef.current = false
    setInitialLoading(true)
    setRefreshing(false)
  }, [resetKey])

  const runWithLoadState = useCallback(async <T,>(loader: () => Promise<T>): Promise<T> => {
    if (hasLoadedRef.current) {
      setRefreshing(true)
    } else {
      setInitialLoading(true)
    }

    try {
      return await loader()
    } finally {
      if (hasLoadedRef.current) {
        setRefreshing(false)
      } else {
        hasLoadedRef.current = true
        setInitialLoading(false)
      }
    }
  }, [])

  return { initialLoading, refreshing, runWithLoadState }
}

interface ScreenRefreshIndicatorProps {
  refreshing: boolean
}

export function ScreenRefreshIndicator({ refreshing }: ScreenRefreshIndicatorProps) {
  return (
    <div className="h-0.5 w-full overflow-hidden" aria-hidden="true">
      {refreshing && (
        <div className="h-full w-full animate-pulse" style={{ backgroundColor: 'var(--brand-primary)', opacity: 0.45 }} />
      )}
    </div>
  )
}

export function InlineRefreshSpinner({ refreshing }: ScreenRefreshIndicatorProps) {
  if (!refreshing) return null

  return (
    <div className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" aria-label="Refreshing" />
  )
}
