import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/image to render a plain <img> in jsdom
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as object)} />;
  },
}));

import { AuthShell } from '@/client/components/auth/auth-shell';

describe('AuthShell', () => {
  it('renders children', () => {
    render(
      <AuthShell>
        <div>form content</div>
      </AuthShell>,
    );
    expect(screen.getByText('form content')).toBeInTheDocument();
  });

  it('shows hero image by default', () => {
    const { container } = render(
      <AuthShell>
        <div>x</div>
      </AuthShell>,
    );
    const img = container.querySelector('img[alt=""]');
    expect(img).toBeTruthy();
  });

  it('hides hero image when showImage=false', () => {
    const { container } = render(
      <AuthShell showImage={false}>
        <div>x</div>
      </AuthShell>,
    );
    const img = container.querySelector('img[alt=""]');
    expect(img).toBeFalsy();
  });
});
