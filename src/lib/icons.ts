/**
 * Icon Registry — centralises all Phosphor icon imports and mappings.
 *
 * Zelto uses Phosphor Icons (`@phosphor-icons/react`) for all structural icons.
 * Weight rules:
 *   - Tab bar active: fill (24px)
 *   - Tab bar inactive: regular (24px)
 *   - Status in cards: duotone (18px)
 *   - Status chip inline: bold (12px)
 *   - Action buttons: bold (20px)
 *   - Settings rows: regular (20px)
 *   - Empty state (large): thin (48px)
 */

import {
  House,
  ClipboardText,
  Handshake,
  UserCircle,
  ArrowUp,
  ArrowDown,
  Package,
  Sparkle,
  Truck,
  CheckCircle,
  Warning,
  Scales,
  CreditCard,
  Check,
  ArrowRight,
  Clock,
  WarningCircle,
  Circle,
  Buildings,
  ShareNetwork,
  Crown,
  FileText,
  ShieldCheck,
  SignOut,
  Phone,
  ShoppingCart,
  Storefront,
  CalendarBlank,
  ArrowsLeftRight,
  MagnifyingGlass,
  Funnel,
  CaretRight,
  UsersThree,
  HourglassMedium,
  ChartBar,
  Notebook,
} from '@phosphor-icons/react'

// Tab bar icons
export const TabIcons = {
  Home: House,
  Orders: ClipboardText,
  Connections: Handshake,
  Business: Buildings,
} as const

// Dashboard — Business Pulse icons
export const PulseIcons = {
  toPay: ArrowUp,
  toReceive: ArrowDown,
  ordersToday: Package,
} as const

// Dashboard — Needs Attention row icons
export const AttentionIcons = {
  new: Sparkle,
  dispatched: Truck,
  delivered: CheckCircle,
  issue: Warning,
  dispute: Scales,
  payment: CreditCard,
} as const

// Order Card — Status icons
export const StatusIcons = {
  new: Circle,
  dispatched: ArrowRight,
  delivered: Check,
  issue: Warning,
  dispute: Scales,
  paymentPending: Clock,
  overdue: WarningCircle,
} as const

// Profile Screen icons
export const ProfileIcons = {
  businessDetails: Buildings,
  shareZeltoId: ShareNetwork,
  subscription: Crown,
  termsOfService: FileText,
  privacyPolicy: ShieldCheck,
  logout: SignOut,
} as const

// Connection Detail icons
export const ConnectionIcons = {
  phone: Phone,
  buyer: ShoppingCart,
  supplier: Storefront,
  paymentTerms: CalendarBlank,
  changeRoles: ArrowsLeftRight,
} as const

// Utility icons
export const UtilityIcons = {
  search: MagnifyingGlass,
  filter: Funnel,
  chevronRight: CaretRight,
} as const

// Empty state icons
export const EmptyStateIcons = {
  noOrders: Package,
  noConnections: UsersThree,
  noFilterResults: Funnel,
  waitingConnections: HourglassMedium,
  reports: ChartBar,
  ledger: Notebook,
  connectPartner: Handshake,
  ordersTab: ClipboardText,
} as const

// Re-export commonly used individual icons
export {
  House,
  ClipboardText,
  Handshake,
  UserCircle,
  ArrowUp,
  ArrowDown,
  Package,
  Sparkle,
  Truck,
  CheckCircle,
  Warning,
  Scales,
  CreditCard,
  Check,
  ArrowRight,
  Clock,
  WarningCircle,
  Circle,
  Buildings,
  ShareNetwork,
  Crown,
  FileText,
  ShieldCheck,
  SignOut,
  Phone,
  ShoppingCart,
  Storefront,
  CalendarBlank,
  ArrowsLeftRight,
  MagnifyingGlass,
  Funnel,
  CaretRight,
  UsersThree,
  HourglassMedium,
  ChartBar,
  Notebook,
}
