import { SpinnerGap } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

const SCREEN_REFRESH_INDICATOR_DELAY_MS = 300
const INLINE_REFRESH_SPINNER_DELAY_MS = 200

function useDelayedVisibility(visible: boolean, delayMs: number) {
  const [delayedVisible, setDelayedVisible] = useState(false)

  useEffect(() => {
    if (!visible) {
      setDelayedVisible(false)
      return
    }

    const timerId = window.setTimeout(() => {
      setDelayedVisible(true)
    }, delayMs)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [delayMs, visible])

  return delayedVisible
}

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
  const showIndicator = useDelayedVisibility(refreshing, SCREEN_REFRESH_INDICATOR_DELAY_MS)

  return (
    <div className="h-0.5 w-full overflow-hidden" aria-hidden="true">
      {showIndicator && (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--brand-primary)]" />
      )}
    </div>
  )
}

export function InlineRefreshSpinner({ refreshing }: { refreshing: boolean }) {
  const showSpinner = useDelayedVisibility(refreshing, INLINE_REFRESH_SPINNER_DELAY_MS)

  if (!showSpinner) return null
  return <SpinnerGap size={14} className="animate-spin text-muted-foreground" />
}
