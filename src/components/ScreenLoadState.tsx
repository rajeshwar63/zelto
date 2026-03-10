import { SpinnerGap } from '@phosphor-icons/react'
import { useCallback, useMemo, useState } from 'react'

interface ScreenLoadStateArgs {
  hasData: boolean
  isInitialLoading?: boolean
  isRefreshing?: boolean
}

export function useScreenLoadState({ hasData, isInitialLoading = false, isRefreshing = false }: ScreenLoadStateArgs) {
  const [manualInitialLoading, setManualInitialLoading] = useState(false)
  const [manualRefreshing, setManualRefreshing] = useState(false)

  const initialLoading = (isInitialLoading || manualInitialLoading) && !hasData
  const refreshing = (isRefreshing || manualRefreshing) && hasData

  const runWithLoadState = useCallback(async (loader: () => Promise<void>) => {
    if (hasData) {
      setManualRefreshing(true)
    } else {
      setManualInitialLoading(true)
    }

    try {
      await loader()
    } finally {
      setManualInitialLoading(false)
      setManualRefreshing(false)
    }
  }, [hasData])

  return useMemo(() => ({
    initialLoading,
    refreshing,
    runWithLoadState,
  }), [initialLoading, refreshing, runWithLoadState])
}

export function ScreenRefreshIndicator({ refreshing }: { refreshing: boolean }) {
  return (
    <div className="h-0.5 w-full overflow-hidden" aria-hidden="true">
      {refreshing && (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--brand-primary)]" />
      )}
    </div>
  )
}

export function InlineRefreshSpinner({ refreshing }: { refreshing: boolean }) {
  if (!refreshing) return null
  return <SpinnerGap size={14} className="animate-spin text-muted-foreground" />
}
