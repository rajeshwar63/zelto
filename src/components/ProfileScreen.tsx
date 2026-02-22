import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import type { BusinessEntity } from '@/lib/types'
import { CaretRight } from '@phosphor-icons/react'

interface Props {
  currentBusinessId: string
  onLogout: () => void
  onNavigateToBusinessDetails: () => void
}

export function ProfileScreen({ currentBusinessId, onLogout, onNavigateToBusinessDetails }: Props) {
  const [business, setBusiness] = useState<BusinessEntity | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshTimestamp, setRefreshTimestamp] = useState(Date.now())

  useEffect(() => {
    async function loadBusiness() {
      const biz = await dataStore.getBusinessEntityById(currentBusinessId)
      setBusiness(biz || null)
      setLoading(false)
    }

    loadBusiness()
  }, [currentBusinessId, refreshTimestamp])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setRefreshTimestamp(Date.now())
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const hasBusinessDetails = business && (
    business.gstNumber || 
    business.businessAddress || 
    business.businessType || 
    business.website
  )

  if (loading || !business) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const handleShare = async () => {
    const shareMessage = `Connect with me on Zelto. My Zelto ID is ${business.zeltoId}`
    
    if (navigator.share) {
      try {
        await navigator.share({
          text: shareMessage,
        })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err)
        }
      }
    } else {
      await navigator.clipboard.writeText(shareMessage)
      alert('Zelto ID copied to clipboard')
    }
  }

  return (
    <div>
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 className="text-[17px] text-foreground font-normal">Profile</h1>
        </div>
      </div>
      <div className="px-4 py-6 border-b border-border">
        <h1 className="text-[17px] font-medium text-foreground mb-1">{business.businessName}</h1>
        <div className="flex items-center gap-2">
          <p className="text-[13px] text-muted-foreground font-mono">{business.zeltoId}</p>
          <button
            onClick={handleShare}
            className="text-[13px] text-foreground hover:text-foreground/70 transition-colors"
          >
            Share
          </button>
        </div>
        <p className="text-[13px] text-muted-foreground mt-2">
          Managing connections and orders
        </p>
      </div>

      <div className="px-4 py-4 border-b border-border">
        {!hasBusinessDetails ? (
          <button
            onClick={onNavigateToBusinessDetails}
            className="w-full flex items-center justify-between py-2"
          >
            <span className="text-[13px]" style={{ color: '#E8A020' }}>
              Add business details to build credibility
            </span>
            <CaretRight size={16} style={{ color: '#E8A020' }} />
          </button>
        ) : (
          <div>
            <div className="space-y-1 mb-2">
              {business.gstNumber && (
                <p className="text-[12px] text-muted-foreground">GST: {business.gstNumber}</p>
              )}
              {business.businessAddress && (
                <p className="text-[12px] text-muted-foreground">Address: {business.businessAddress}</p>
              )}
              {business.businessType && (
                <p className="text-[12px] text-muted-foreground">Type: {business.businessType}</p>
              )}
              {business.website && (
                <p className="text-[12px] text-muted-foreground">Website: {business.website}</p>
              )}
            </div>
            <button
              onClick={onNavigateToBusinessDetails}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Edit business details
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-4">
        <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Settings
        </h2>
        <div className="space-y-0 divide-y divide-border">
          <button className="w-full text-left py-3 hover:bg-muted/30 transition-colors">
            <p className="text-[14px] text-foreground">Notifications</p>
          </button>
          <button className="w-full text-left py-3 hover:bg-muted/30 transition-colors">
            <p className="text-[14px] text-foreground">Payment Terms</p>
          </button>
          <button className="w-full text-left py-3 hover:bg-muted/30 transition-colors">
            <p className="text-[14px] text-foreground">Account</p>
          </button>
          <button className="w-full text-left py-3 hover:bg-muted/30 transition-colors">
            <p className="text-[14px] text-foreground">Help & Support</p>
          </button>
        </div>
      </div>

      <div className="px-4 pb-8 pt-4">
        <button 
          onClick={onLogout}
          className="w-full text-center py-3"
        >
          <p className="text-[14px]" style={{ color: '#D64545' }}>Log out</p>
        </button>
      </div>
    </div>
  )
}
