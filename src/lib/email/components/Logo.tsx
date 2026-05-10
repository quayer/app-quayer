import * as React from 'react';
import { Img } from '@react-email/components';

interface LogoProps {
  width?: number;
  height?: number;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.quayer.com';

/**
 * Quayer Q-bolt logo for transactional emails.
 *
 * Email clients have notoriously poor SVG support (Outlook desktop, Gmail iOS strip
 * inline SVG entirely), so we reference the public asset by absolute URL. The PNG
 * fallback would be ideal, but the project currently only ships an SVG; mainstream
 * webmail (Gmail web, Apple Mail, Yahoo, ProtonMail) does render external SVG via
 * <img>, and clients that don't will simply show alt text.
 */
export function Logo({ width = 48, height = 48 }: LogoProps) {
  return (
    <Img
      src={`${APP_URL}/logo.svg`}
      width={width}
      height={height}
      alt="Quayer"
      style={{
        display: 'block',
        outline: 'none',
        border: 'none',
        textDecoration: 'none',
      }}
    />
  );
}
