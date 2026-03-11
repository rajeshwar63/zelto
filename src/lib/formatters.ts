export function formatIndianCurrencyShorthand(value: number): string {
  const absoluteValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (absoluteValue < 1_000) {
    return `${sign}₹${absoluteValue.toLocaleString('en-IN')}`
  }

  const formatCompact = (divisor: number, suffix: string) => {
    const compactValue = absoluteValue / divisor
    const roundedValue = compactValue < 10
      ? Number(compactValue.toFixed(1))
      : Math.round(compactValue)

    return `${sign}₹${roundedValue}${suffix}`
  }

  if (absoluteValue < 100_000) {
    return formatCompact(1_000, 'K')
  }

  return formatCompact(100_000, 'L')
}
