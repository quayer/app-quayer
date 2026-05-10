import * as React from 'react';
import { Button as REButton } from '@react-email/components';

interface BrandButtonProps {
  href: string;
  children: React.ReactNode;
  /**
   * Use the gradient as background. Many clients (Outlook desktop, older Gmail)
   * fall back to the solid `backgroundColor` when they ignore `backgroundImage`,
   * so we always set both. Default is the warm Quayer ember gradient.
   */
  variant?: 'primary' | 'secondary';
}

const QUAYER_GRADIENT =
  'linear-gradient(135deg, #FFFDE0 0%, #F5C842 30%, #E5832C 60%, #B5390C 90%, #580800 100%)';

/**
 * Primary call-to-action button for Quayer transactional emails.
 *
 * Renders as a properly-sized anchor with bulletproof button styling — generous
 * padding, rounded corners, white text. The gradient is rendered via CSS
 * `background-image` for clients that support it, with a solid burgundy fallback
 * (`#B5390C`) for clients that don't.
 */
export function BrandButton({
  href,
  children,
  variant = 'primary',
}: BrandButtonProps) {
  const fallbackColor = variant === 'primary' ? '#B5390C' : '#3F2A1F';
  const backgroundImage = variant === 'primary' ? QUAYER_GRADIENT : 'none';

  return (
    <REButton
      href={href}
      style={{
        display: 'inline-block',
        backgroundColor: fallbackColor,
        backgroundImage,
        color: '#FFFFFF',
        fontFamily:
          "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: '16px',
        fontWeight: 600,
        lineHeight: '24px',
        textDecoration: 'none',
        textAlign: 'center',
        padding: '14px 32px',
        borderRadius: '10px',
        boxShadow: '0 2px 8px rgba(88, 8, 0, 0.18)',
      }}
    >
      {children}
    </REButton>
  );
}
