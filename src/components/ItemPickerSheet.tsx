import { useState, useEffect } from 'react'
import { MagnifyingGlass, X, Plus, Minus, Package } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { emitDataChange } from '@/lib/data-events'
import { formatInrCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import type { ItemMaster } from '@/lib/types'

const GST_RATES = [
  { label: 'Exempt (0%)', value: 0 },
  { label: '5%', value: 5 },
  { label: '12%', value: 12 },
  { label: '18%', value: 18 },
  { label: '28%', value: 28 },
  { label: '40%', value: 40 },
]

export interface PickedItem {
  itemMasterId: string
  name: string
  hsnCode: string | null
  taxRate: number
  quantity: number
  unit: string
  rate: number
}

interface Props {
  currentBusinessId: string
  onDismiss: () => void
  onAddItem: (item: PickedItem) => void
}

export function ItemPickerSheet({ currentBusinessId, onDismiss, onAddItem }: Props) {
  const [items, setItems] = useState<ItemMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<ItemMaster | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [rate, setRate] = useState('')
  const [unit, setUnit] = useState('PCS')
  const [showInlineCreate, setShowInlineCreate] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemHsnCode, setNewItemHsnCode] = useState('')
  const [newItemTaxRate, setNewItemTaxRate] = useState<number | null>(null)
  const [newItemSalePrice, setNewItemSalePrice] = useState('')
  const [savingNewItem, setSavingNewItem] = useState(false)

  useEffect(() => {
    dataStore.getItemsByBusinessId(currentBusinessId).then(data => {
      setItems(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [currentBusinessId])

  const filtered = search.trim()
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items

  const handleSelectItem = (item: ItemMaster) => {
    setSelectedItem(item)
    setRate(item.salePrice != null ? String(item.salePrice) : '')
    setQuantity('1')
    setUnit('PCS')
  }

  const handleAdd = () => {
    if (!selectedItem) return
    const qty = parseFloat(quantity) || 0
    const r = parseFloat(rate) || 0
    if (qty <= 0 || r <= 0) return

    onAddItem({
      itemMasterId: selectedItem.id,
      name: selectedItem.name,
      hsnCode: selectedItem.hsnCode,
      taxRate: selectedItem.taxRate ?? 0,
      quantity: qty,
      unit,
      rate: r,
    })
    onDismiss()
  }

  const handleSaveNewItem = async () => {
    const trimmedName = newItemName.trim()
    if (!trimmedName) {
      toast.error('Item name is required')
      return
    }

    setSavingNewItem(true)
    try {
      const created = await dataStore.createItem(currentBusinessId, {
        name: trimmedName,
        hsnCode: newItemHsnCode.trim() || undefined,
        taxRate: newItemTaxRate ?? undefined,
        salePrice: newItemSalePrice ? parseFloat(newItemSalePrice) : undefined,
      })
      emitDataChange('items:changed')
      toast.success('Item created')

      // Reset inline form
      setShowInlineCreate(false)
      setNewItemName('')
      setNewItemHsnCode('')
      setNewItemTaxRate(null)
      setNewItemSalePrice('')

      // Auto-select the newly created item
      handleSelectItem(created)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create item')
    } finally {
      setSavingNewItem(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      onClick={onDismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} />

      {/* Sheet */}
      <div
        className="relative flex flex-col"
        style={{
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          maxHeight: '80vh',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1F2E' }}>Select item</p>
            <p style={{ fontSize: '12px', color: '#8492A6' }}>From your item master</p>
          </div>
          <button onClick={onDismiss} style={{ padding: '8px', color: '#8492A6' }}>
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2" style={{
            backgroundColor: '#F2F4F8',
            borderRadius: '10px',
            padding: '0 10px',
            height: '38px',
          }}>
            <MagnifyingGlass size={16} color="#8492A6" />
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
                fontSize: '13px',
                color: '#1A1F2E',
              }}
            />
          </div>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-auto px-4" style={{ maxHeight: selectedItem ? '30vh' : '50vh' }}>
          {loading ? (
            <p style={{ fontSize: '13px', color: '#8492A6', textAlign: 'center', padding: '20px' }}>Loading...</p>
          ) : (
            <>
              {/* Create new item button — always visible at top of list */}
              <button
                onClick={() => setShowInlineCreate(true)}
                className="w-full flex items-center gap-3 text-left"
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(74,108,247,0.04)',
                  border: '1px dashed rgba(74,108,247,0.3)',
                  marginBottom: '8px',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(74,108,247,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Plus size={14} color="#4A6CF7" weight="bold" />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#4A6CF7' }}>
                  Create new item
                </span>
              </button>

              {showInlineCreate && (
                <div style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid rgba(74,108,247,0.2)',
                  padding: '12px',
                  marginBottom: '8px',
                }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#4A6CF7', marginBottom: '10px' }}>
                    New item
                  </p>

                  {/* Item name */}
                  <input
                    type="text"
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    placeholder="Item name *"
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '13px',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: '8px',
                      outline: 'none',
                      marginBottom: '8px',
                      color: '#1A1F2E',
                      backgroundColor: '#FAFBFC',
                    }}
                  />

                  {/* HSN + Tax rate row */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      value={newItemHsnCode}
                      onChange={e => setNewItemHsnCode(e.target.value)}
                      placeholder="HSN code"
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        fontSize: '13px',
                        border: '1px solid rgba(0,0,0,0.08)',
                        borderRadius: '8px',
                        outline: 'none',
                        color: '#1A1F2E',
                        backgroundColor: '#FAFBFC',
                        fontFamily: 'monospace',
                      }}
                    />
                    <select
                      value={newItemTaxRate ?? ''}
                      onChange={e => setNewItemTaxRate(e.target.value === '' ? null : Number(e.target.value))}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        fontSize: '13px',
                        border: '1px solid rgba(0,0,0,0.08)',
                        borderRadius: '8px',
                        outline: 'none',
                        color: newItemTaxRate == null ? '#8492A6' : '#1A1F2E',
                        backgroundColor: '#FAFBFC',
                        appearance: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">GST rate</option>
                      {GST_RATES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Sale price */}
                  <input
                    type="number"
                    inputMode="decimal"
                    value={newItemSalePrice}
                    onChange={e => setNewItemSalePrice(e.target.value)}
                    placeholder="Sale price (optional)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '13px',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: '8px',
                      outline: 'none',
                      marginBottom: '12px',
                      color: '#1A1F2E',
                      backgroundColor: '#FAFBFC',
                    }}
                  />

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        setShowInlineCreate(false)
                        setNewItemName('')
                        setNewItemHsnCode('')
                        setNewItemTaxRate(null)
                        setNewItemSalePrice('')
                      }}
                      style={{
                        flex: 1,
                        padding: '10px',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#8492A6',
                        backgroundColor: '#F2F4F8',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNewItem}
                      disabled={savingNewItem || !newItemName.trim()}
                      style={{
                        flex: 1,
                        padding: '10px',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#FFFFFF',
                        backgroundColor: '#4A6CF7',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        opacity: savingNewItem || !newItemName.trim() ? 0.5 : 1,
                      }}
                    >
                      {savingNewItem ? 'Saving...' : 'Save & select'}
                    </button>
                  </div>
                </div>
              )}

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Package size={32} color="#B0BAC9" />
                  <p style={{ fontSize: '13px', color: '#8492A6' }}>
                    {search.trim() ? 'No matching items' : 'No items yet. Tap "Create new item" above to add one.'}
                  </p>
                </div>
              ) : (
                filtered.map(item => {
              const isSelected = selectedItem?.id === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  className="w-full flex items-center gap-3 text-left"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: isSelected ? 'rgba(74,108,247,0.08)' : 'transparent',
                    border: isSelected ? '1px solid rgba(74,108,247,0.3)' : '1px solid transparent',
                    marginBottom: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.hsnCode && (
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#4A6CF7', backgroundColor: 'rgba(74,108,247,0.08)', padding: '1px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>
                          HSN {item.hsnCode}
                        </span>
                      )}
                      {item.taxRate != null && (
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#E67E00', backgroundColor: 'rgba(230,126,0,0.08)', padding: '1px 5px', borderRadius: '3px' }}>
                          GST {item.taxRate}%
                        </span>
                      )}
                    </div>
                  </div>
                  {item.salePrice != null && (
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E', flexShrink: 0 }}>
                      {formatInrCurrency(item.salePrice)}
                    </span>
                  )}
                </button>
              )
            })
              )}
            </>
          )}
        </div>

        {/* Bottom bar with qty/rate/add (only when item selected) */}
        {selectedItem && (
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', padding: '12px 16px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#4A6CF7', marginBottom: '8px' }}>
              {selectedItem.name}
            </p>
            <div className="flex items-center gap-3">
              {/* Quantity */}
              <div className="flex items-center" style={{ backgroundColor: '#F2F4F8', borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  onClick={() => setQuantity(String(Math.max(1, (parseFloat(quantity) || 1) - 1)))}
                  style={{ padding: '8px', color: '#1A1F2E' }}
                >
                  <Minus size={14} weight="bold" />
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  style={{
                    width: '40px',
                    textAlign: 'center',
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1A1F2E',
                  }}
                />
                <button
                  onClick={() => setQuantity(String((parseFloat(quantity) || 0) + 1))}
                  style={{ padding: '8px', color: '#1A1F2E' }}
                >
                  <Plus size={14} weight="bold" />
                </button>
              </div>

              {/* Unit */}
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                style={{
                  padding: '8px 6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#1A1F2E',
                  backgroundColor: '#F2F4F8',
                  borderRadius: '8px',
                  border: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="PCS">PCS</option>
                <option value="KG">KG</option>
                <option value="L">L</option>
                <option value="BOX">BOX</option>
                <option value="CASE">CASE</option>
              </select>

              {/* Rate */}
              <div className="flex items-center" style={{ flex: 1, backgroundColor: '#F2F4F8', borderRadius: '8px', padding: '0 10px' }}>
                <span style={{ fontSize: '13px', color: '#8492A6' }}>Rate</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  style={{
                    flex: 1,
                    textAlign: 'right',
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1A1F2E',
                    padding: '8px 0',
                  }}
                />
              </div>

              {/* Add */}
              <button
                onClick={handleAdd}
                disabled={!quantity || !rate || parseFloat(quantity) <= 0 || parseFloat(rate) <= 0}
                style={{
                  backgroundColor: '#4A6CF7',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  opacity: !quantity || !rate ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
