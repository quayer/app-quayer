'use client'

import * as React from 'react'

import { OtpInput } from '@/client/components/ds/otp-input'

export function ClientOtp(): React.ReactElement {
  const [code, setCode] = React.useState('')
  return (
    <div className="space-y-2">
      <OtpInput value={code} onChange={setCode} />
      <p className="text-ds-sm text-ds-muted">Current value: {code || '(empty)'}</p>
    </div>
  )
}
