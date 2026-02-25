export type PaymentTermType = 
  | { type: 'Advance Required' }
  | { type: 'Payment on Delivery' }
  | { type: 'Bill to Bill' }
  | { type: 'Days After Delivery'; days: number }

export type ConnectionState = 'Stable' | 'Active' | 'Friction Rising' | 'Under Stress'

export type OrderLifecycleState = 'Placed' | 'Accepted' | 'Dispatched' | 'Delivered' | 'Declined'

export type SettlementState = 'Paid' | 'Partial Payment' | 'Awaiting Payment' | 'Pending'

export type IssueSeverity = 'Low' | 'Medium' | 'High'

export type IssueStatus = 'Open' | 'Acknowledged' | 'Resolved'

export type IssueType = 
  | 'Damaged Product'
  | 'Quality Below Expectation'
  | 'Expired Product'
  | 'Packaging Issue'
  | 'Short Supply'
  | 'Wrong Items Delivered'
  | 'Billing Mismatch'
  | 'Price Discrepancy'

export type RaisedBy = 'buyer' | 'supplier'

export interface BusinessEntity {
  id: string
  zeltoId: string
  businessName: string
  createdAt: number
  gstNumber?: string
  businessAddress?: string
  businessType?: 'Restaurant' | 'Supplier' | 'Manufacturer' | 'Retailer' | 'Distributor' | 'Other'
  website?: string
}

export interface UserAccount {
  id: string
  phoneNumber: string
  businessEntityId: string
}

export interface Connection {
  id: string
  buyerBusinessId: string
  supplierBusinessId: string
  paymentTerms: PaymentTermType | null
  connectionState: ConnectionState
  behaviourHistory: Record<string, unknown>[]
  createdAt: number
}

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

export interface IssueReport {
  id: string
  orderId: string
  issueType: IssueType
  severity: IssueSeverity
  raisedBy: RaisedBy
  status: IssueStatus
  createdAt: number
}

export interface OrderWithPaymentState extends Order {
  totalPaid: number
  pendingAmount: number
  settlementState: SettlementState
  calculatedDueDate: number | null
}

export type FlagType = 'Verified' | 'Watch' | 'Restricted' | 'Suspended'

export type RoleContext = 'buyer' | 'supplier'

export interface AdminAccount {
  id: string
  username: string
  password: string
}

export interface EntityFlag {
  id: string
  entityId: string
  roleContext: RoleContext
  flagType: FlagType
  note: string
  timestamp: number
  adminUsername: string
}

export interface FrozenEntity {
  id: string
  entityId: string
  frozenAt: number
  note: string
  adminUsername: string
}

export type ConnectionRequestStatus = 'Pending' | 'Accepted' | 'Declined'

export interface ConnectionRequest {
  id: string
  requesterBusinessId: string
  receiverBusinessId: string
  requesterRole: 'buyer' | 'supplier'
  receiverRole: 'buyer' | 'supplier'
  status: ConnectionRequestStatus
  createdAt: number
  resolvedAt: number | null
}

export interface RoleChangeRequest {
  id: string
  connectionId: string
  requestedByBusinessId: string
  status: 'pending' | 'approved' | 'declined'
  createdAt: number
  resolvedAt: number | null
}

export type NotificationType =
  | 'OrderPlaced'
  | 'OrderDispatched'
  | 'OrderDeclined'
  | 'PaymentRecorded'
  | 'PaymentDisputed'
  | 'IssueRaised'
  | 'ConnectionAccepted'

export interface Notification {
  id: string
  recipientBusinessId: string
  type: NotificationType
  relatedEntityId: string
  connectionId: string
  message: string
  createdAt: number
  readAt: number | null
}

export type AttachmentType = 'bill' | 'payment_proof' | 'note'

export interface OrderAttachment {
  id: string
  orderId: string
  fileUrl: string | null
  fileName: string | null
  fileType: string | null
  thumbnailUrl: string | null
  noteText: string | null
  type: AttachmentType
  uploadedBy: string
  timestamp: number
}
