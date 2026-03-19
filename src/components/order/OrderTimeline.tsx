import { formatDistanceToNow } from 'date-fns'
import { getLifecycleStatusColor } from '@/lib/semantic-colors'
import type { OrderTimelineEvent } from '@/components/order/order-detail-utils'
import type { OrderAttachment } from '@/lib/types'

interface Props {
  timeline: OrderTimelineEvent[]
  dispatchAttachments?: OrderAttachment[]
  deliveryAttachments?: OrderAttachment[]
  paymentAttachments?: OrderAttachment[]
}

export function OrderTimeline({ timeline }: Props) {
  return (
    <div className="px-4 mb-3">
      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
        TIMELINE
      </p>
      <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
        {timeline.map((event, index) => {
          const isLast = index === timeline.length - 1
          const eventColor = event.completed ? getLifecycleStatusColor(event.label) : 'var(--text-tertiary)'

          return (
            <div key={`${event.label}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex-shrink-0 mt-1" style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: eventColor }} />
                {!isLast && <div style={{ width: '2px', flex: 1, minHeight: '24px', backgroundColor: eventColor, opacity: 0.3 }} />}
              </div>
              <div style={{ paddingBottom: '16px' }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{event.label}</p>
                {event.actor && <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>{event.actor}</p>}
                {event.timestamp && (
                  <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)' }}>
                    {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                  </p>
                )}
                {event.attachmentIndicator && (
                  <p style={{ fontSize: '11px', color: 'var(--brand-primary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    📎 {event.attachmentIndicator}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
