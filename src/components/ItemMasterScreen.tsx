import { useState, useEffect } from 'react'
import { ArrowLeft, MagnifyingGlass, Plus, Package } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { useDataListener } from '@/lib/data-events'
import type { ItemMaster } from '@/lib/types'
import { formatInrCurrency } from '@/lib/utils'

interface Props {
  currentBusinessId: string
  onBack: () => void
  onNavigateToItemCreate: () => void
  onNavigateToItemEdit: (itemId: string) => void
}

export function ItemMasterScreen({ currentBusinessId, onBack, onNavigateToItemCreate, onNavigateToItemEdit }: Props) {
  const [items, setItems] = useState<ItemMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadItems = async () => {
    try {
      const data = await dataStore.getItemsByBusinessId(currentBusinessId)
      setItems(data)
    } catch (err) {
      console.error('Failed to load items:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadItems() }, [currentBusinessId])
  useDataListener('items:changed', () => { loadItems() })

  const filtered = search.trim()
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#F2F4F8' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#0F1320', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center px-4" style={{ height: '44px' }}>
          <button onClick={onBack} className="flex items-center justify-center" style={{ minWidth: '44px', minHeight: '44px', color: '#FFFFFF' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>Item master</h1>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Your saved products</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2" style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          padding: '0 12px',
          height: '40px',
          border: '1px solid rgba(0,0,0,0.08)',
        }}>
          <MagnifyingGlass size={18} color="#8492A6" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              fontSize: '14px',
              color: '#1A1F2E',
            }}
          />
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-auto px-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p style={{ fontSize: '14px', color: '#8492A6' }}>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Package size={40} color="#B0BAC9" />
            <p style={{ fontSize: '14px', color: '#8492A6' }}>
              {search.trim() ? 'No items match your search' : 'No items yet'}
            </p>
          </div>
        ) : (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', overflow: 'hidden' }}>
            {filtered.map((item, i) => (
              <button
                key={item.id}
                onClick={() => onNavigateToItemEdit(item.id)}
                className="w-full flex items-center gap-3 text-left"
                style={{
                  padding: '12px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: '#EEF0FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Package size={18} color="#4A6CF7" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {item.hsnCode && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#4A6CF7',
                        backgroundColor: 'rgba(74,108,247,0.08)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                      }}>
                        HSN {item.hsnCode}
                      </span>
                    )}
                    {item.taxRate != null && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#E67E00',
                        backgroundColor: 'rgba(230,126,0,0.08)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}>
                        GST {item.taxRate}%
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {item.salePrice != null && (
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>
                      {formatInrCurrency(item.salePrice)}
                    </p>
                  )}
                  {item.purchasePrice != null && (
                    <p style={{ fontSize: '11px', color: '#8492A6', marginTop: '1px' }}>
                      Cost: {formatInrCurrency(item.purchasePrice)}
                    </p>
                  )}
                  {item.salePrice == null && item.purchasePrice == null && (
                    <p style={{ fontSize: '11px', color: '#B0BAC9' }}>&mdash;</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add button */}
      <div className="px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <button
          onClick={onNavigateToItemCreate}
          className="w-full flex items-center justify-center gap-2"
          style={{
            backgroundColor: '#4A6CF7',
            color: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px',
            fontSize: '14px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus size={18} weight="bold" />
          Add new item
        </button>
      </div>
    </div>
  )
}
