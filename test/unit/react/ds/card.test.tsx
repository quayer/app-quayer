import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Card } from '@/client/components/ds/card'

describe('ds/Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <p>Hello card</p>
      </Card>,
    )
    expect(screen.getByText('Hello card')).toBeTruthy()
  })

  it('applies custom className alongside ds tokens', () => {
    const { container } = render(<Card className="extra">x</Card>)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('rounded-ds-md')
    expect(div.className).toContain('extra')
  })
})
