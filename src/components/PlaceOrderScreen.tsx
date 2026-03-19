import { useEffect, useRef, useState, useMemo } from 'react'
import { dataStore } from '@/lib/data-store'
import { createOrder } from '@/lib/interactions'
import type { Connection, BusinessEntity, PaymentTermType } from '@/lib/types'
import { CaretLeft, MagnifyingGlass, CaretDown, Check, Info } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface PlaceOrderScreenProps {
  prefilledConnectionId?: string | null
  currentBusinessId: string
  onBack: () => void
  onOrderCreated: (orderId: string, connectionId: string) => void
}

interface ConnectionWithInfo {
  connection: Connection
  businessName: string
  city: string | null
  contactName: string | null
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const AVATAR_PALETTES = [
  { bg: '#E8EDFF', text: '#4A6CF7' },
  { bg: '#E6F9F0', text: '#1D9E75' },
  { bg: '#FFF0E8', text: '#E06030' },
  { bg: '#F0E8FF', text: '#7B4AF7' },
  { bg: '#FFF8E0', text: '#C49A00' },
  { bg: '#FFE8EE', text: '#D63B6A' },
  { bg: '#E8F4FF', text: '#1A7BC4' },
  { bg: '#F0FFF0', text: '#2E8B57' },
]

function getAvatarPalette(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length]
}

function formatPaymentTermLabel(terms: PaymentTermType): string {
  switch (terms.type) {
    case 'Advance Required': return 'Advance Required'
    case 'Payment on Delivery': return 'Payment on Delivery'
    case 'Bill to Bill': return 'Bill to Bill'
    case 'Days After Delivery': return `${terms.days} days after delivery`
  }
}

export function PlaceOrderScreen({
  prefilledConnectionId,
  currentBusinessId,
  onBack,
  onOrderCreated,
}: PlaceOrderScreenProps) {
  const [myBusinessName, setMyBusinessName] = useState('')
  const [allConnections, setAllConnections] = useState<ConnectionWithInfo[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    prefilledConnectionId ?? null
  )
  const [selectedInfo, setSelectedInfo] = useState<ConnectionWithInfo | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [itemSummary, setItemSummary] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      try {
        const [myBusiness, rawConnections, entities] = await Promise.all([
          dataStore.getBusinessEntityById(currentBusinessId),
          dataStore.getConnectionsByBusinessId(currentBusinessId),
          dataStore.getAllBusinessEntities(),
        ])

        if (cancelled) return

        setMyBusinessName(myBusiness?.businessName ?? '')

        const entityMap = new Map<string, BusinessEntity>(entities.map(e => [e.id, e]))

        const buyerConnections = rawConnections
          .filter(c => c.buyerBusinessId === currentBusinessId)
          .sort((a, b) => {
            const nameA = entityMap.get(a.supplierBusinessId)?.businessName ?? ''
            const nameB = entityMap.get(b.supplierBusinessId)?.businessName ?? ''
            return nameA.localeCompare(nameB)
          })

        const withInfo: ConnectionWithInfo[] = buyerConnections.map(conn => {
          const biz = entityMap.get(conn.supplierBusinessId)
          return {
            connection: conn,
            businessName: biz?.businessName ?? 'Unknown',
            city: biz?.city ?? null,
            contactName: conn.contactName ?? null,
          }
        })

        setAllConnections(withInfo)

        if (prefilledConnectionId) {
          const prefilled = withInfo.find(c => c.connection.id === prefilledConnectionId)
          if (prefilled) {
            setSelectedInfo(prefilled)
          }
        }
      } catch (err) {
        console.error('Failed to load data for PlaceOrderScreen:', err)
      } finally {
        if (!cancelled) setDataLoading(false)
      }
    }

    void loadData()
    return () => { cancelled = true }
  }, [currentBusinessId, prefilledConnectionId])

  // Auto-focus textarea when supplier becomes selected
  useEffect(() => {
    if (selectedConnectionId && !dataLoading && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [selectedConnectionId, dataLoading])

  const filteredConnections = useMemo(() => {
    if (!searchQuery.trim()) return allConnections
    const q = searchQuery.toLowerCase()
    return allConnections.filter(c => c.businessName.toLowerCase().includes(q))
  }, [allConnections, searchQuery])

  const hasSupplier = selectedConnectionId !== null && selectedInfo !== null
  const canSubmit = hasSupplier && itemSummary.trim().length > 0
  const charCount = itemSummary.length

  const handleSupplierTap = () => {
    if (hasSupplier) {
      // Revert to State 1
      setSelectedConnectionId(null)
      setSelectedInfo(null)
      setShowDropdown(true)
      setSearchQuery('')
      setTimeout(() => searchInputRef.current?.focus(), 50)
    } else {
      setShowDropdown(true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  const handleSelectConnection = (info: ConnectionWithInfo) => {
    setSelectedConnectionId(info.connection.id)
    setSelectedInfo(info)
    setShowDropdown(false)
    setSearchQuery('')
  }

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting || !selectedConnectionId) return

    setIsSubmitting(true)
    try {
      const order = await createOrder(selectedConnectionId, itemSummary.trim(), 0, currentBusinessId)
      onOrderCreated(order.id, selectedConnectionId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to place order')
      setIsSubmitting(false)
    }
  }

  const buildSubtitle = (city: string | null, contactName: string | null) => {
    const parts: string[] = []
    if (city) parts.push(city)
    parts.push(contactName ?? 'No contact added')
    return parts.join(' · ')
  }

  if (dataLoading) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: '#1A1F36' }}>
        <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-1">
            <button
              onClick={onBack}
              style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}
            >
              <CaretLeft size={20} weight="regular" />
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: '#F5F6FA' }}>
          <p style={{ fontSize: '13px', color: '#6B7280' }}>Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#F5F6FA' }}>
      {/* Fixed dark header */}
      <div
        style={{
          backgroundColor: '#1A1F36',
          paddingTop: 'env(safe-area-inset-top)',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ height: '44px', display: 'flex', alignItems: 'center', paddingLeft: '4px', paddingRight: '16px' }}>
          <button
            onClick={onBack}
            style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', flexShrink: 0 }}
          >
            <CaretLeft size={20} weight="regular" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '17px', fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>Place order</p>
            {myBusinessName ? (
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '1px' }}>
                Ordering as {myBusinessName}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: '160px' }}>
        <div style={{ padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Section 1: Ordering From */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Ordering From
            </p>

            {!hasSupplier ? (
              /* State 1: Search input */
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    backgroundColor: '#FFFFFF',
                    border: showDropdown ? '0.5px solid #4A6CF7' : '0.5px solid #E2E4EA',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    boxShadow: showDropdown ? '0 0 0 3px rgba(74,108,247,0.1)' : undefined,
                  }}
                >
                  <MagnifyingGlass size={18} weight="regular" style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value)
                      setShowDropdown(true)
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search your connections..."
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      fontSize: '14px',
                      color: '#1A1F36',
                      backgroundColor: 'transparent',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                {/* Dropdown */}
                {showDropdown && (
                  <div
                    ref={dropdownRef}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      backgroundColor: '#FFFFFF',
                      border: '0.5px solid #E2E4EA',
                      borderRadius: '10px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                      zIndex: 50,
                      maxHeight: '220px',
                      overflowY: 'auto',
                    }}
                  >
                    {filteredConnections.length === 0 ? (
                      <div style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: '13px', color: '#9CA3AF' }}>No connections found</p>
                      </div>
                    ) : (
                      filteredConnections.map(info => {
                        const palette = getAvatarPalette(info.businessName)
                        const isSelected = info.connection.id === selectedConnectionId
                        return (
                          <button
                            key={info.connection.id}
                            onClick={() => handleSelectConnection(info)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 12px',
                              backgroundColor: isSelected ? '#EEF0FF' : 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              minHeight: '44px',
                            }}
                          >
                            <div
                              style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '8px',
                                backgroundColor: palette.bg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <span style={{ fontSize: '12px', fontWeight: 700, color: palette.text }}>
                                {getInitials(info.businessName)}
                              </span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F36', lineHeight: 1.3 }}>
                                {info.businessName}
                              </p>
                              <p style={{ fontSize: '11px', color: '#6B7280', marginTop: '1px', lineHeight: 1.3 }}>
                                {buildSubtitle(info.city, info.contactName)}
                              </p>
                            </div>
                            {isSelected && (
                              <Check size={16} weight="bold" style={{ color: '#4A6CF7', flexShrink: 0 }} />
                            )}
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* State 2: Supplier card */
              <div>
                <button
                  onClick={handleSupplierTap}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    backgroundColor: '#FFFFFF',
                    border: '0.5px solid #E2E4EA',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                  }}
                >
                  {(() => {
                    const palette = getAvatarPalette(selectedInfo.businessName)
                    return (
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          backgroundColor: palette.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: '11px', fontWeight: 700, color: palette.text }}>
                          {getInitials(selectedInfo.businessName)}
                        </span>
                      </div>
                    )
                  })()}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A1F36', lineHeight: 1.3 }}>
                      {selectedInfo.businessName}
                    </p>
                    <p style={{ fontSize: '11px', color: '#6B7280', marginTop: '1px', lineHeight: 1.3 }}>
                      {buildSubtitle(selectedInfo.city, selectedInfo.contactName)}
                    </p>
                  </div>
                  <CaretDown size={14} weight="regular" style={{ color: '#9CA3AF', flexShrink: 0 }} />
                </button>
                <p style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '4px', paddingLeft: '2px' }}>
                  Tap to change supplier
                </p>

                {/* Payment terms info pill */}
                {selectedInfo.connection.paymentTerms && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: '#EEF0FF',
                      borderRadius: '20px',
                      padding: '5px 10px',
                      marginTop: '8px',
                    }}
                  >
                    <Info size={14} weight="regular" style={{ color: '#4A6CF7', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: '#4A6CF7' }}>
                      Terms: <strong>{formatPaymentTermLabel(selectedInfo.connection.paymentTerms)}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: What are you ordering? */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              What are you ordering?
            </p>
            <div style={{ position: 'relative' }}>
              <textarea
                ref={textareaRef}
                value={itemSummary}
                onChange={e => {
                  if (e.target.value.length <= 300) setItemSummary(e.target.value)
                }}
                placeholder={hasSupplier ? 'e.g. 50 cases Alphonso mango pulp, 1kg tins' : 'Select a supplier first'}
                disabled={!hasSupplier}
                rows={4}
                style={{
                  width: '100%',
                  backgroundColor: '#FFFFFF',
                  border: hasSupplier && document.activeElement === textareaRef.current
                    ? '0.5px solid #4A6CF7'
                    : '0.5px solid #E2E4EA',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '14px',
                  color: '#1A1F36',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  lineHeight: '1.5',
                  opacity: hasSupplier ? 1 : 0.35,
                  cursor: hasSupplier ? 'text' : 'not-allowed',
                  boxSizing: 'border-box',
                  minHeight: '96px',
                  paddingBottom: '28px',
                }}
                onFocus={e => {
                  if (hasSupplier) {
                    e.target.style.border = '0.5px solid #4A6CF7'
                    e.target.style.boxShadow = '0 0 0 3px rgba(74,108,247,0.1)'
                  }
                }}
                onBlur={e => {
                  e.target.style.border = '0.5px solid #E2E4EA'
                  e.target.style.boxShadow = 'none'
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  right: '12px',
                  fontSize: '10px',
                  color: '#9CA3AF',
                  pointerEvents: 'none',
                }}
              >
                {charCount} / 300
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom CTA */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#FFFFFF',
          borderTop: '0.5px solid #E2E4EA',
          padding: '12px 16px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          zIndex: 20,
        }}
      >
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          style={{
            width: '100%',
            padding: '14px 16px',
            backgroundColor: canSubmit && !isSubmitting ? '#4A6CF7' : '#C7CFE8',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '12px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: canSubmit && !isSubmitting ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background-color 0.15s ease',
          }}
        >
          {isSubmitting ? (
            <>
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: '#FFFFFF',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
              Placing order…
            </>
          ) : (
            'Send order request'
          )}
        </button>
        <p
          style={{
            textAlign: 'center',
            fontSize: '11px',
            color: '#9CA3AF',
            marginTop: '6px',
            lineHeight: 1.3,
          }}
        >
          {hasSupplier
            ? `${selectedInfo.businessName} will be notified to accept or decline`
            : 'Select a supplier to continue'}
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
