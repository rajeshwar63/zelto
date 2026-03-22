import { useEffect } from 'react'

export function DeleteAccountScreen() {
  useEffect(() => {
    const prev = document.title
    document.title = 'Delete Account – Zelto'
    return () => { document.title = prev }
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-6 max-w-2xl mx-auto" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        <h1 className="text-[20px] font-semibold text-foreground mb-1">Delete Your Zelto Account</h1>
        <p className="text-[12px] text-muted-foreground mb-6">Last updated: March 2026</p>

        <Section title="How to Delete Your Account">
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-3">
            <strong className="text-foreground">From within the Zelto app (recommended):</strong>
          </p>
          <ol className="space-y-1 list-decimal list-inside text-[14px] text-muted-foreground mb-4">
            <li>Open the Zelto app and sign in</li>
            <li>Tap your profile icon in the bottom navigation</li>
            <li>Go to Account Settings</li>
            <li>Tap Delete Account</li>
            <li>Read the confirmation message and tap Confirm Delete</li>
          </ol>
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
            Your account deletion will be processed immediately.
          </p>
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-3">
            <strong className="text-foreground">By email request:</strong>
          </p>
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-3">
            If you are unable to access the app, you can request account deletion by emailing us at:{' '}
            <a href="mailto:support@zeltoapp.com" className="text-foreground font-medium underline">support@zeltoapp.com</a>
          </p>
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-2">
            Please use the subject line: <strong className="text-foreground">Account Deletion Request</strong>
          </p>
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-1">Include in your email:</p>
          <ul className="space-y-1 list-disc list-inside text-[14px] text-muted-foreground mb-3">
            <li>The email address associated with your Zelto account</li>
            <li>Your Zelto Business ID (if known)</li>
          </ul>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            We will process your request within 7 business days and send a confirmation to your email.
          </p>
        </Section>

        <Section title="What Gets Deleted">
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-3">
            When you delete your Zelto account, the following data is permanently removed:
          </p>
          <ul className="space-y-1 list-disc list-inside text-[14px] text-muted-foreground mb-4">
            <li>Your user account and login credentials</li>
            <li>Your business profile (name, Zelto ID, contact details, GST/business information)</li>
            <li>Your connection list and all pending connection requests</li>
            <li>Your personal order and payment records</li>
          </ul>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Note on shared trade records:</strong> Zelto is a shared trade platform. Orders and payment records that involve another business (your buyer or supplier) are part of a shared record visible to both parties. When you delete your account, your profile is disassociated from these records, but the counterparty's copy of the trade record may be retained to preserve their business history. This is necessary for the integrity of the shared ledger.
          </p>
        </Section>

        <Section title="What May Be Retained">
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-3">
            We may retain the following data for a limited period after deletion:
          </p>
          <ul className="space-y-1 list-disc list-inside text-[14px] text-muted-foreground">
            <li>Transaction records involving other businesses — retained for up to 90 days to allow counterparties to reconcile their records, then permanently deleted</li>
            <li>Anonymised usage data — aggregated, non-identifiable analytics that cannot be linked back to you</li>
            <li>Legal/compliance data — if required by applicable law</li>
          </ul>
        </Section>

        <Section title="Contact" isLast>
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-3">
            For any questions about account deletion or data handling, contact us at:{' '}
            <a href="mailto:support@zeltoapp.com" className="text-foreground font-medium underline">support@zeltoapp.com</a>
          </p>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            For our full privacy practices, see our{' '}
            <a href="/privacy" className="text-foreground font-medium underline">Privacy Policy</a>.
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children, isLast }: { title: string; children: React.ReactNode; isLast?: boolean }) {
  return (
    <div className={isLast ? 'mb-0' : 'mb-6'}>
      <h2 className="text-[15px] font-medium text-foreground mb-2">{title}</h2>
      <div>{children}</div>
    </div>
  )
}
