import { CaretLeft } from '@phosphor-icons/react'

export function TermsScreen() {
  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back()
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-white z-10 border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-3">
          <button onClick={handleBack} className="text-foreground flex items-center">
            <CaretLeft size={22} />
          </button>
          <h1 className="text-[17px] text-foreground font-normal">Terms of Service</h1>
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        <p className="text-[12px] text-muted-foreground mb-6">Last updated: February 27, 2026</p>

        <Section title="Acceptance of Terms">
          By accessing or using the Zelto app, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the app. We may update these terms from time to time, and continued use of the app after such changes constitutes acceptance of the updated terms.
        </Section>

        <Section title="About Zelto">
          Zelto is a platform that helps businesses track buyer-supplier transactions. It allows businesses to manage connections, log orders, record payments, and stay informed about outstanding balances. Zelto is operated by Zelto and is intended solely for business use.
        </Section>

        <Section title="Not a Payment Processor">
          Zelto is not a payment processor. We do not handle, transfer, or facilitate the movement of money between any parties. Zelto only records payment information as entered by users for their own tracking purposes. We take no responsibility for actual payment disputes, non-payment, or financial disagreements between buyers and suppliers. All financial transactions occur entirely outside the Zelto platform and are the sole responsibility of the parties involved.
        </Section>

        <Section title="User Responsibilities">
          You are solely responsible for the accuracy, completeness, and legality of all data you enter into Zelto, including order details, payment amounts, and business information. Zelto does not verify the accuracy of any data entered by users. You agree to use the platform honestly and in good faith, and not to enter false, misleading, or fraudulent information.
        </Section>

        <Section title="Scope of Use">
          Zelto is designed for business-to-business (B2B) use only. The platform is operated for businesses in India. You may not use Zelto for personal, consumer, or non-commercial purposes, or from outside India, unless explicitly permitted by Zelto in writing.
        </Section>

        <Section title="Account Suspension">
          Zelto reserves the right to suspend or terminate accounts that violate these Terms of Service, engage in fraudulent activity, abuse the platform, or otherwise act in a manner that is harmful to other users or to Zelto. We may take such action without prior notice where we determine it is necessary to protect the integrity of the platform.
        </Section>

        <Section title="Limitation of Liability">
          Zelto is provided on an "as is" basis. We make no warranties about the availability, accuracy, or reliability of the platform. To the maximum extent permitted by law, Zelto shall not be liable for any indirect, incidental, or consequential damages arising from your use of the app or any disputes between users.
        </Section>

        <Section title="Contact Us" isLast>
          If you have any questions about these Terms of Service, please contact us at:
          <p className="mt-2 text-[14px] text-foreground font-medium">support@zeltoapp.com</p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children, isLast }: { title: string; children: React.ReactNode; isLast?: boolean }) {
  return (
    <div className={isLast ? 'mb-0' : 'mb-6'}>
      <h2 className="text-[15px] font-medium text-foreground mb-2">{title}</h2>
      <p className="text-[14px] text-muted-foreground leading-relaxed">{children}</p>
    </div>
  )
}
