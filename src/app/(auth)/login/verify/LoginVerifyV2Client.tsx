'use client'

import { useSearchParams } from 'next/navigation'
import { LoginOTPForm } from '@/client/components/auth/login-otp-form'

export function LoginVerifyV2Client() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')
  const phone = searchParams.get('phone')
  const magicLinkSessionId = searchParams.get('mlsid')

  return (
    <div className="w-full max-w-[420px]">
      <LoginOTPForm
        email={email || undefined}
        phone={phone || undefined}
        magicLinkSessionId={magicLinkSessionId || undefined}
      />
    </div>
  )
}
