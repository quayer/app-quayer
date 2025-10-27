# Input OTP Component - Usage Guide

## Overview
The `input-otp` component is already installed and configured for the Quayer project. This guide demonstrates how to use it for WhatsApp instance pairing and verification workflows.

## Installation
Already installed via package.json:
```json
"input-otp": "^1.4.2"
```

## Basic Usage

### 1. Import the Component
```tsx
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'
```

### 2. Example: WhatsApp Instance Pairing with OTP

```tsx
'use client'

import { useState } from 'react'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { api } from '@/igniter.client'

export function InstancePairingOTP() {
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async () => {
    if (otp.length !== 6) {
      setError('Por favor, insira o código completo de 6 dígitos')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // Example API call for WhatsApp pairing
      const response = await api.instances.pairWithOTP.mutate({
        body: { otp },
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.data?.success) {
        // Handle successful pairing
        console.log('Instance paired successfully!')
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Erro ao validar código')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Conectar Instância WhatsApp</CardTitle>
        <CardDescription>
          Digite o código de verificação de 6 dígitos enviado para o WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={otp}
            onChange={(value) => setOtp(value)}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          {otp.length === 0 ? (
            <p>Aguardando código...</p>
          ) : (
            <p>{otp.length} de 6 dígitos preenchidos</p>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          className="w-full"
          disabled={otp.length !== 6 || isLoading}
        >
          {isLoading ? 'Verificando...' : 'Conectar Instância'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

### 3. Example: Two-Factor Authentication

```tsx
'use client'

import { useState } from 'react'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { Button } from '@/components/ui/button'

export function TwoFactorAuth() {
  const [value, setValue] = useState('')

  return (
    <div className="space-y-4">
      <InputOTP
        maxLength={6}
        value={value}
        onChange={(value) => setValue(value)}
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>

      <div className="text-center text-sm">
        {value === '' ? (
          <>Digite seu código de 6 dígitos</>
        ) : (
          <>Você digitou: {value}</>
        )}
      </div>

      <Button
        className="w-full"
        disabled={value.length !== 6}
      >
        Verificar Código
      </Button>
    </div>
  )
}
```

### 4. Example: Custom Pattern (Phone Number Verification)

```tsx
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

export function PhoneVerification() {
  const [value, setValue] = useState('')

  return (
    <InputOTP
      maxLength={4}
      value={value}
      onChange={(value) => setValue(value)}
      pattern="[0-9]*"
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
      </InputOTPGroup>
    </InputOTP>
  )
}
```

## Component Props

### InputOTP
- `maxLength`: Maximum number of characters (required)
- `value`: Current OTP value
- `onChange`: Callback when value changes
- `pattern`: Regex pattern for allowed characters (default: numeric)
- `disabled`: Disable input
- `autoFocus`: Auto-focus first slot on mount

### InputOTPSlot
- `index`: Position index (0-based)

## Styling and Theming

The input-otp component automatically inherits your shadcn/ui theme configuration and supports dark mode out of the box.

### Custom Styling
```tsx
<InputOTP
  className="gap-4"
  value={value}
  onChange={setValue}
  maxLength={6}
>
  <InputOTPGroup className="gap-2">
    <InputOTPSlot
      index={0}
      className="w-14 h-14 text-2xl"
    />
    {/* More slots... */}
  </InputOTPGroup>
</InputOTP>
```

## Integration with Igniter.js

Example controller for OTP verification:

```typescript
// src/features/instances/controllers/pairing.controller.ts
import { defineController } from '@igniter-js/core'
import { z } from 'zod'

export const pairingController = defineController('pairing', {
  pairWithOTP: {
    type: 'mutation',
    input: z.object({
      otp: z.string().length(6, 'Código deve ter 6 dígitos'),
      instanceId: z.string().uuid().optional(),
    }),
    async handler(ctx) {
      const { otp, instanceId } = ctx.body

      // Verify OTP and pair instance
      // Your WhatsApp pairing logic here

      return {
        success: true,
        instanceId: instanceId || 'new-instance-id',
        message: 'Instância conectada com sucesso',
      }
    },
  },
})
```

## Best Practices

1. **Always validate OTP length** before submitting
2. **Provide clear feedback** on invalid codes
3. **Auto-submit** when all digits are entered (optional UX improvement)
4. **Clear OTP** on error for retry
5. **Add loading states** during verification
6. **Use proper error handling** with Igniter.js error responses

## Accessibility

The input-otp component is built with accessibility in mind:
- Keyboard navigation support
- Screen reader friendly
- Focus management
- ARIA labels

## Future Enhancements

Possible improvements for the Quayer project:
- Auto-advance to next field on input
- Paste support for full OTP codes
- Countdown timer for OTP expiration
- Resend code functionality
- Biometric authentication integration

---

**Component Location**: `c:\Users\Administrator\CascadeProjects\app-quayer\src\components\ui\input-otp.tsx`
**Documentation**: https://ui.shadcn.com/docs/components/input-otp
**Last Updated**: 2025-09-30