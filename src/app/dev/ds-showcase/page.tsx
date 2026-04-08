import { notFound } from 'next/navigation'

import { Button } from '@/client/components/ds/button'
import { Input } from '@/client/components/ds/input'
import { Logo } from '@/client/components/ds/logo'
import { Card } from '@/client/components/ds/card'
import { Toast } from '@/client/components/ds/toast'

import { ClientOtp } from './client-otp'

export default function DsShowcasePage(): React.ReactElement {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  return (
    <div data-auth-v3="true" className="min-h-screen bg-ds-bg p-8">
      <div className="mx-auto max-w-4xl space-y-12">
        <header className="flex items-center gap-4">
          <Logo size={48} aria-label="Quayer" />
          <div>
            <h1 className="text-2xl font-bold text-ds-fg">DS v3 Showcase</h1>
            <p className="text-ds-muted">
              Visual gallery of all primitive components in all their states.
              Dev-only route, blocked in production.
            </p>
          </div>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-ds-fg">Button</h2>
          <p className="text-ds-muted">
            Variants: primary, secondary, ghost. Sizes: sm, md, lg. Plus loading
            and disabled states.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Disabled</Button>
            <Button loading>Loading</Button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-ds-fg">Input</h2>
          <p className="text-ds-muted">
            With label, helper text, and error state.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Email" placeholder="you@quayer.com" />
            <Input
              label="Username"
              helper="Letters and numbers only"
              placeholder="quayer_user"
            />
            <Input
              label="Password"
              type="password"
              error="Password too short"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-ds-fg">OTP Input</h2>
          <p className="text-ds-muted">
            6-digit one-time code with auto-advance, backspace, and paste support.
          </p>
          <ClientOtp />
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-ds-fg">Logo</h2>
          <p className="text-ds-muted">Default 32px and a larger 96px variant.</p>
          <div className="flex items-center gap-6">
            <Logo />
            <Logo size={96} aria-label="Quayer large" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-ds-fg">Card</h2>
          <p className="text-ds-muted">A simple wrapper with radius and shadow.</p>
          <Card>
            <h3 className="text-lg font-semibold text-ds-fg">Card title</h3>
            <p className="text-ds-muted">Card body content with helpful info.</p>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-ds-fg">Toast</h2>
          <p className="text-ds-muted">
            Four types: info, success (role=status); error, warning (role=alert).
          </p>
          <div className="space-y-2">
            <Toast type="info" message="Heads up: this is informational." />
            <Toast type="success" message="Saved successfully." />
            <Toast type="warning" message="This action may have side effects." />
            <Toast type="error" message="Something went wrong." />
          </div>
        </section>
      </div>
    </div>
  )
}
