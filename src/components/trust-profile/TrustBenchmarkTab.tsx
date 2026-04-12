import { useState, useEffect } from 'react'
import { intelligenceEngine } from '@/lib/intelligence-engine'
import type { BusinessBenchmark } from '@/lib/intelligence-engine'

interface Props {
  businessId: string
}

function getSentimentColor(sentiment: 'better' | 'worse' | 'same'): string {
  if (sentiment === 'better') return '#22B573'
  if (sentiment === 'worse') return '#E53535'
  return '#1A1F36'
}

export function TrustBenchmarkTab({ businessId }: Props) {
  const [benchmark, setBenchmark] = useState<BusinessBenchmark | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    intelligenceEngine.getBusinessBenchmark(businessId).then(data => {
      setBenchmark(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [businessId])

  if (loading) {
    return (
      <div style={{ padding: '20px 16px' }}>
        <p style={{ fontSize: '13px', color: '#8492A6' }}>Loading benchmark data...</p>
      </div>
    )
  }

  if (!benchmark) {
    return (
      <div style={{ padding: '20px 16px' }}>
        <p style={{ fontSize: '13px', color: '#8492A6' }}>Unable to load benchmark data.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Comparison card */}
      <div>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#8492A6', letterSpacing: '0.6px', marginBottom: '8px' }}>
          YOU VS ZELTO NETWORK AVERAGE
        </p>
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
          {benchmark.metrics.map((metric, idx) => (
            <div
              key={metric.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                borderBottom: idx < benchmark.metrics.length - 1 ? '1px solid #F2F4F8' : 'none',
              }}
            >
              <span style={{ fontSize: '13px', color: '#1A1F36' }}>
                {metric.label}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  fontSize: '15px',
                  fontWeight: 500,
                  color: getSentimentColor(metric.sentiment),
                }}>
                  {metric.yourValue}{metric.unit}
                </span>
                <span style={{ fontSize: '12px', color: '#8492A6' }}>
                  avg {metric.networkAvg}{metric.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gaps card — only show if gaps exist */}
      {benchmark.gaps.length > 0 && (
        <div>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#8492A6', letterSpacing: '0.6px', marginBottom: '8px' }}>
            WHERE YOU'RE BEHIND
          </p>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
            {benchmark.gaps.map((gap, idx) => (
              <div
                key={gap.metric}
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '12px 16px',
                  borderBottom: idx < benchmark.gaps.length - 1 ? '1px solid #F2F4F8' : 'none',
                }}
              >
                {/* Red/amber dot */}
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: '#E53535',
                  flexShrink: 0,
                  marginTop: '5px',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', color: '#1A1F36', margin: 0 }}>
                    {gap.metric} ({gap.yourValue} vs avg {gap.avgValue})
                  </p>
                  <p style={{ fontSize: '11px', color: '#8492A6', margin: '2px 0 0' }}>
                    {gap.suggestion}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
