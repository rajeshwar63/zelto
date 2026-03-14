import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const INR_NO_FRACTION_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function formatInrCurrency(amount: number): string {
  return INR_NO_FRACTION_FORMATTER.format(amount)
}

export function buildConnectionSubtitle(
  branchLabel?: string | null,
  contactName?: string | null
): string | null {
  const parts = [branchLabel, contactName].filter(Boolean)
  return parts.length > 0 ? parts.join('  ·  ') : null
}
