import { CaretLeft } from '@phosphor-icons/react'

export function PrivacyPolicyScreen() {
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
          <h1 className="text-[17px] text-foreground font-normal">Privacy Policy</h1>
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        <p className="text-[12px] text-muted-foreground mb-6">Last updated: February 27, 2026</p>

        <Section title="Introduction">
          Zelto ("we", "our", or "us") is committed to protecting the privacy of our users. This Privacy Policy explains how we collect, use, store, and protect your information when you use the Zelto app. By using Zelto, you agree to the practices described in this policy.
        </Section>

        <Section title="Data We Collect">
          When you use Zelto, we collect the following information:
          <ul className="mt-2 space-y-1 list-disc list-inside text-[14px] text-muted-foreground">
            <li><strong className="text-foreground">Phone number</strong> — used to create and identify your account</li>
            <li><strong className="text-foreground">Business name</strong> — used to identify your business on the platform</li>
            <li><strong className="text-foreground">Connection data</strong> — information about buyer and supplier relationships you manage in the app</li>
            <li><strong className="text-foreground">Order records</strong> — transaction records you create or receive within the app</li>
            <li><strong className="text-foreground">Payment records</strong> — payment entries logged against orders</li>
            <li><strong className="text-foreground">Optional business details</strong> — GST number, business address, business type, and website, if you choose to provide them</li>
          </ul>
        </Section>

        <Section title="How We Use Your Data">
          We use the information we collect to:
          <ul className="mt-2 space-y-1 list-disc list-inside text-[14px] text-muted-foreground">
            <li>Provide and operate the Zelto platform</li>
            <li>Enable buyer-supplier transaction tracking between connected businesses</li>
            <li>Send notifications about orders and payment activity</li>
            <li>Authenticate your account securely</li>
            <li>Improve the reliability and features of the app</li>
          </ul>
        </Section>

        <Section title="Data Storage and Security">
          Your data is stored securely on Supabase, a trusted cloud database platform with industry-standard encryption at rest and in transit. We implement appropriate technical and organisational measures to protect your data against unauthorised access, alteration, or loss.
        </Section>

        <Section title="Data Sharing">
          We do not sell, rent, or share your personal data with third parties. Connection data (such as your business name and Zelto ID) is visible to other Zelto users you are directly connected with, as required for the platform to function.
        </Section>

        <Section title="Your Rights">
          You have the right to request deletion of your account and associated data. You can do this from within the app by going to Profile → Account → Delete Account. Upon deletion, your personal data will be removed from our systems in accordance with our data retention policy.
        </Section>

        <Section title="Scope of Service">
          Zelto is intended for business-to-business (B2B) use only. The app is designed and operated for businesses in India. By using Zelto, you confirm that you are using it for B2B purposes within India.
        </Section>

        <Section title="Contact Us" isLast>
          If you have any questions about this Privacy Policy or how we handle your data, please contact us at:
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
