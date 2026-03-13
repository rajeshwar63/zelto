// src/utils/ledger-excel.ts
// Generates an Excel (.xlsx) file from ledger JSON returned by the generate-ledger Edge Function.
// Uses SheetJS (xlsx).

import * as XLSX from 'xlsx'
import { format } from 'date-fns'

export interface LedgerData {
  meta: {
    generatedAt: number
    period: string
    periodStart: number
    periodEnd: number
    myBusiness: { name: string; zeltoCode: string; phone: string; city: string; area: string; address: string }
    otherBusiness?: { name: string; zeltoCode: string; phone: string; city: string; area: string; address: string }
  }
  summary: {
    totalOrders: number
    totalOrderValue: number
    totalPaid: number
    totalOutstanding: number
    issueCount: number
    connectionsCount?: number
  }
  connections: Array<{
    connectionId: string
    otherBusiness: { name: string; zeltoCode: string; phone: string; city: string; area: string }
    myRole: 'buyer' | 'supplier'
    connectedSince: number
    orders: Array<{
      id: string
      placedAt: number
      itemSummary: string
      orderValue: number
      paymentTerms: string
      dueDate: number | null
      state: string
      totalPaid: number
      balance: number
      hasIssue: boolean
      payments: Array<{ date: number; amount: number; note: string }>
      issues: Array<{ type: string; severity: string; raisedBy: string; status: string; description: string; resolvedAt: number | null }>
    }>
  }>
}

function inr(amount: number): string {
  return amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

function fmtDate(ts: number | null): string {
  if (!ts) return ''
  return format(ts, 'dd MMM yyyy')
}

function buildSummarySheet(data: LedgerData): XLSX.WorkSheet {
  const rows: any[][] = []

  rows.push([`Zelto Ledger — ${data.meta.period}`])
  rows.push([`Generated: ${fmtDate(data.meta.generatedAt)}`])
  rows.push([])

  // My business
  rows.push(['My Business'])
  rows.push(['Name', data.meta.myBusiness.name])
  rows.push(['Zelto Code', data.meta.myBusiness.zeltoCode])
  rows.push(['Phone', data.meta.myBusiness.phone])
  rows.push(['City', `${data.meta.myBusiness.city}${data.meta.myBusiness.area ? ', ' + data.meta.myBusiness.area : ''}`])
  if (data.meta.myBusiness.address) rows.push(['Address', data.meta.myBusiness.address])

  // Other business (single scope)
  if (data.meta.otherBusiness) {
    rows.push([])
    rows.push(['Other Business'])
    rows.push(['Name', data.meta.otherBusiness.name])
    rows.push(['Zelto Code', data.meta.otherBusiness.zeltoCode])
    rows.push(['Phone', data.meta.otherBusiness.phone])
    rows.push(['City', `${data.meta.otherBusiness.city}${data.meta.otherBusiness.area ? ', ' + data.meta.otherBusiness.area : ''}`])
    if (data.meta.otherBusiness.address) rows.push(['Address', data.meta.otherBusiness.address])
  }

  rows.push([])

  // Summary table
  rows.push(['Summary'])
  rows.push(['Total Orders', data.summary.totalOrders])
  rows.push(['Total Value (₹)', inr(data.summary.totalOrderValue)])
  rows.push(['Total Paid (₹)', inr(data.summary.totalPaid)])
  rows.push(['Outstanding (₹)', inr(data.summary.totalOutstanding)])
  rows.push(['Issues', data.summary.issueCount])
  if (data.summary.connectionsCount !== undefined) {
    rows.push(['Connections', data.summary.connectionsCount])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Style: make title bold by setting cell metadata (limited in xlsx community edition)
  ws['A1'] = { v: rows[0][0], t: 's', s: { font: { bold: true, sz: 14 } } }

  // Column widths
  ws['!cols'] = [{ wch: 20 }, { wch: 40 }]

  return ws
}

function buildOrdersSheet(data: LedgerData): XLSX.WorkSheet {
  const headers = [
    '#',
    'Connection',
    'My Role',
    'Order Date',
    'Item Description',
    'Order Value (₹)',
    'Payment Terms',
    'Due Date',
    'Status',
    'Paid (₹)',
    'Balance (₹)',
    'Issues',
  ]

  const rows: any[][] = [headers]
  let rowNum = 1

  for (const conn of data.connections) {
    for (const order of conn.orders) {
      rows.push([
        rowNum++,
        conn.otherBusiness.name,
        conn.myRole,
        fmtDate(order.placedAt),
        order.itemSummary,
        Number(order.orderValue),
        order.paymentTerms,
        fmtDate(order.dueDate),
        order.state,
        Number(order.totalPaid),
        Number(order.balance),
        order.hasIssue ? 'Yes' : 'No',
      ])
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  // Column widths
  ws['!cols'] = [
    { wch: 5 },   // #
    { wch: 28 },  // Connection
    { wch: 10 },  // My Role
    { wch: 14 },  // Order Date
    { wch: 35 },  // Item Description
    { wch: 16 },  // Order Value
    { wch: 22 },  // Payment Terms
    { wch: 14 },  // Due Date
    { wch: 14 },  // Status
    { wch: 14 },  // Paid
    { wch: 14 },  // Balance
    { wch: 8 },   // Issues
  ]

  return ws
}

function buildPaymentsSheet(data: LedgerData): XLSX.WorkSheet {
  const headers = ['Order ID', 'Connection', 'Payment Date', 'Amount (₹)', 'Note']
  const rows: any[][] = [headers]

  for (const conn of data.connections) {
    for (const order of conn.orders) {
      for (const payment of order.payments) {
        rows.push([
          shortId(order.id),
          conn.otherBusiness.name,
          fmtDate(payment.date),
          Number(payment.amount),
          payment.note,
        ])
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 40 }]
  return ws
}

function buildIssuesSheet(data: LedgerData): XLSX.WorkSheet {
  const headers = ['Order ID', 'Connection', 'Type', 'Severity', 'Raised By', 'Status', 'Description', 'Resolved Date']
  const rows: any[][] = [headers]

  for (const conn of data.connections) {
    for (const order of conn.orders) {
      for (const issue of order.issues) {
        rows.push([
          shortId(order.id),
          conn.otherBusiness.name,
          issue.type,
          issue.severity,
          issue.raisedBy,
          issue.status,
          issue.description,
          fmtDate(issue.resolvedAt),
        ])
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 12 }, { wch: 28 }, { wch: 24 }, { wch: 10 },
    { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 16 },
  ]
  return ws
}

export function generateLedgerExcel(data: LedgerData): void {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, buildSummarySheet(data), 'Summary')
  XLSX.utils.book_append_sheet(wb, buildOrdersSheet(data), 'Orders')
  XLSX.utils.book_append_sheet(wb, buildPaymentsSheet(data), 'Payments')

  if (data.summary.issueCount > 0) {
    XLSX.utils.book_append_sheet(wb, buildIssuesSheet(data), 'Issues')
  }

  const dateStr = format(data.meta.generatedAt, 'yyyyMMdd')
  const periodSlug = data.meta.period.toLowerCase().replace(/\s+/g, '-')
  const filename = `zelto-ledger-${periodSlug}-${dateStr}.xlsx`

  XLSX.writeFile(wb, filename)
}
