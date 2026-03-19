export type PaymentTermType = 
  | { type: 'Advance Required' }
  | { type: 'Payment on Delivery' }
  | { type: 'Bill to Bill' }
  | { type: 'Days After Delivery'; days: number }

export type ConnectionState = 'Stable' | 'Active' | 'Friction Rising' | 'Under Stress'

export type OrderLifecycleState = 'Placed' | 'Accepted' | 'Dispatched' | 'Delivered' | 'Declined'

export type SettlementState = 'Paid' | 'Partial Payment' | 'Awaiting Payment' | 'Pending'

export type IssueSeverity = 'Low' | 'Medium' | 'High'

export type IssueStatus = 'Open' | 'Acknowledged' | 'Resolved' | 'Closed'

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
  phone?: string
  latitude?: number
  longitude?: number
  googleMapsPlaceId?: string
  googleMapsUrl?: string
  formattedAddress?: string
  credibilityScore: number
  city?: string
  area?: string
  nameNormalized?: string
  mobileNumber: string | null
  description?: string
}

export interface BusinessDocument {
  id: string
  businessId: string
  documentType: string
  displayName?: string
  fileName: string
  fileUrl: string
  fileSizeBytes?: number
  mimeType?: string
  expiryDate?: string
  verificationStatus: 'pending' | 'verified'
  uploadedAt: number
}

export interface ComplianceAlert {
  connectionId: string
  otherBusinessId: string
  otherBusinessName: string
  otherBusinessZeltoId: string
  issueType: 'expired' | 'expiring' | 'missing'
  documentDisplayName: string
  expiresAtMs: number | null
  daysRemaining: number | null
}

export type UserRole = 'owner' | 'admin' | 'member'

export interface UserAccount {
  id: string
  email: string
  businessEntityId: string
  username: string
  phone?: string
  role: UserRole
  authUserId?: string
}

export interface Connection {
  id: string
  buyerBusinessId: string
  supplierBusinessId: string
  paymentTerms: PaymentTermType | null
  connectionState: ConnectionState
  behaviourHistory: Record<string, unknown>[]
  createdAt: number
  contactPhone: string | null
  branchLabel?: string | null
  contactName?: string | null
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
  description?: string
  createdAt: number
  acknowledgedAt?: number
  resolvedAt?: number
  resolvedBy?: RaisedBy
}

export interface IssueComment {
  id: string
  issueId: string
  authorBusinessId: string
  authorRole: RaisedBy
  message: string
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

export type ConnectionRequestStatus = 'Pending' | 'Accepted' | 'Declined' | 'Archived' | 'Blocked'

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


export interface AcceptConnectionRequestResult {
  connectionId: string
  requestStatus: ConnectionRequestStatus
  notificationStatus: 'sent' | 'failed' | 'skipped'
  alreadyExisted: boolean
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
  | 'OrderAccepted'
  | 'OrderDispatched'
  | 'OrderDeclined'
  | 'PaymentRecorded'
  | 'PaymentDisputed'
  | 'IssueRaised'
  | 'IssueAcknowledged'
  | 'IssueResolved'
  | 'ConnectionAccepted'
  | 'MemberJoined'

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

export type AttachmentType = 'bill' | 'payment_proof' | 'note' | 'dispatch_note' | 'delivery_proof'

export interface OrderAttachment {
  id: string
  orderId: string
  type: AttachmentType
  uploadedBy: string
  fileUrl: string | null
  fileName: string | null
  fileType: string | null
  thumbnailUrl: string | null
  noteText: string | null
  createdAt: number
  timestamp: number
}
