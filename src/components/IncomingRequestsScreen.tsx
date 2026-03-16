import { useEffect, useState, useCallback } from 'react'
import { dataStore } from '@/lib/data-store'
import { useDataListener } from '@/lib/data-events'
import type { ConnectionRequest } from '@/lib/types'
import { ChevronLeft } from 'lucide-react'
import { RequestCard } from '@/components/RequestCard'

interface IncomingRequestsScreenProps {
  currentBusinessId: string
  onBack: () => void
  onNavigateToConnections: () => void
}

export function IncomingRequestsScreen({ currentBusinessId, onBack, onNavigateToConnections }: IncomingRequestsScreenProps) {
  const [requests, setRequests] = useState<ConnectionRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadRequests = useCallback(async () => {
    const data = await dataStore.getIncomingConnectionRequests(currentBusinessId)
    setRequests(data)
    setIsLoading(false)
  }, [currentBusinessId])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  useDataListener(['connection-requests:changed'], () => { void loadRequests() })

  const pending = requests.filter(r => r.status === 'Pending')
  const archived = requests.filter(r => r.status === 'Archived')

  if (isLoading) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4 gap-2">
            <button onClick={onBack} style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', marginLeft: '-8px' }}>
              <ChevronLeft size={24} color="var(--text-primary)" />
            </button>
            <h1 className="text-[17px] font-bold text-foreground">Incoming Requests</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl h-[120px] bg-muted/50" />
          ))}
        </div>
      </div>
    )
  }

  if (pending.length === 0 && archived.length === 0) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4 gap-2">
            <button onClick={onBack} style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', marginLeft: '-8px' }}>
              <ChevronLeft size={24} color="var(--text-primary)" />
            </button>
            <h1 className="text-[17px] font-bold text-foreground">Incoming Requests</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <p className="text-[15px] text-foreground mb-1">No incoming requests</p>
            <p className="text-[13px] text-muted-foreground">Connection requests from other businesses will appear here.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button onClick={onBack} style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', marginLeft: '-8px' }}>
            <ChevronLeft size={24} color="var(--text-primary)" />
          </button>
          <h1 className="text-[17px] font-bold text-foreground">Incoming Requests</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        {/* Pending section */}
        <div>
          <div className="px-4 pt-4 pb-2">
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              PENDING ({pending.length})
            </p>
          </div>
          {pending.length === 0 ? (
            <div className="px-4 py-3">
              <p className="text-[13px] text-muted-foreground">No pending requests</p>
            </div>
          ) : (
            <div>
              {pending.map(request => (
                <RequestCard
                  key={request.id}
                  request={request}
                  currentBusinessId={currentBusinessId}
                  onUpdate={() => { void loadRequests() }}
                  onNavigateToConnections={onNavigateToConnections}
                />
              ))}
            </div>
          )}
        </div>

        {/* Archived section */}
        <div className="mt-2">
          <div className="px-4 pt-2 pb-2">
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              ARCHIVED ({archived.length})
            </p>
          </div>
          {archived.length === 0 ? (
            <div className="px-4 py-3">
              <p className="text-[13px] text-muted-foreground">No archived requests</p>
            </div>
          ) : (
            <div>
              {archived.map(request => (
                <RequestCard
                  key={request.id}
                  request={request}
                  currentBusinessId={currentBusinessId}
                  onUpdate={() => { void loadRequests() }}
                  onNavigateToConnections={onNavigateToConnections}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
