// Shared types for Trade Intelligence data. Mirrors the client-side
// interfaces in src/lib/intelligence-engine.ts so the Edge Function response
// can be consumed directly by the existing MoneyCard component without any
// reshaping.

export type SettlementState = 'Paid' | 'Partial Payment' | 'Awaiting Payment' | 'Pending'

export type PaymentTermType =
  | { type: 'Advance Required' }
  | { type: 'Payment on Delivery' }
  | { type: 'Bill to Bill' }
  | { type: 'Days After Delivery'; days: number }

export interface Order {
  id: string
  connectionId: string
  itemSummary: string
  orderValue: number
  createdAt: number
  acceptedAt: number | null
  dispatchedAt: number | null
  deliveredAt: number | null
  declinedAt: number | null
  paymentTermSnapshot: PaymentTermType
  billToBillInvoiceDate: number | null
}

export interface PaymentEvent {
  id: string
  orderId: string
  amountPaid: number
  timestamp: number
  recordedBy: string
  disputed: boolean
  disputedAt: number | null
  acceptedAt: number | null
}

export interface OrderWithPaymentState extends Order {
  totalPaid: number
  pendingAmount: number
  settlementState: SettlementState
  calculatedDueDate: number | null
}

export interface Connection {
  id: string
  buyerBusinessId: string
  supplierBusinessId: string
  paymentTerms: PaymentTermType | null
  createdAt: number
}

export interface BusinessEntityRef {
  id: string
  businessName: string
  zeltoId: string
  credibilityScore: number | null
}

export interface CollectionItem {
  connectionId: string
  businessName: string
  zeltoId: string
  overdueAmount: number
  daysOverdue: number
  priorityScore: number
  patternSignal: 'worsening' | 'stable' | 'improving' | 'first_late'
  patternDetail: string
  totalOutstanding: number
  buyerTrustScore: number | null
}

export interface CashForecastBucket {
  label: string
  amount: number
  orderCount: number
  detail: string
}

export interface CashForecast {
  inflows: CashForecastBucket[]
  outflows: CashForecastBucket[]
  netThisWeek: number
  netNextWeek: number
}

export interface ConcentrationRisk {
  type: 'receivable' | 'payable'
  topConnectionId: string
  topBusinessName: string
  percentage: number
  totalValue: number
  topValue: number
}

export interface PaymentCalendarItem {
  orderId: string
  connectionId: string
  supplierName: string
  amount: number
  dueDate: number
  daysUntilDue: number
  trustScoreIfOnTime: number | null
  trustScoreIfLate: number | null
  badgeIfOnTime: string | null
  badgeIfLate: string | null
}

export interface TradeIntelligenceResponse {
  cashForecast: CashForecast
  collectionItems: CollectionItem[]
  concentrationRisk: ConcentrationRisk | null
  paymentCalendar: PaymentCalendarItem[]
}
