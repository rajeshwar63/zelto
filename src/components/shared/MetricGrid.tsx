interface MetricItem {
  value: string | number
  label: string
  color?: string
}

interface Props {
  items: MetricItem[]
}

export function MetricGrid({ items }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {items.map((item, idx) => (
        <div
          key={idx}
          style={{
            backgroundColor: 'var(--bg-screen)',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <p
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: item.color || 'var(--text-primary)',
              marginBottom: 2,
            }}
          >
            {item.value}
          </p>
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
            }}
          >
            {item.label}
          </p>
        </div>
      ))}
    </div>
  )
}
