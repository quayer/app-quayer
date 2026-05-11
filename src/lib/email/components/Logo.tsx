import * as React from 'react';
import { Img } from '@react-email/components';

interface LogoProps {
  width?: number;
  height?: number;
}

// PNG (not SVG) because Outlook desktop and Gmail iOS strip external SVG.
// The in-app brand SVG lives at src/client/components/ds/logo.tsx; the PNG
// at public/logo.png is regenerated from that SVG by scripts/generate-email-logo.ts.
//
// EMAIL_LOGO_URL overrides the resolved URL — useful when sending from dev
// (NEXT_PUBLIC_APP_URL=http://localhost, unreachable from Gmail). Default
// resolution: EMAIL_LOGO_URL → ${NEXT_PUBLIC_APP_URL}/logo.png → prod fallback.
const PROD_FALLBACK = 'https://app.quayer.com/logo.png';

function resolveLogoUrl(): string {
  if (process.env.EMAIL_LOGO_URL) return process.env.EMAIL_LOGO_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
    return `${appUrl}/logo.png`;
  }
  return PROD_FALLBACK;
}

export function Logo({ width = 140, height = 32 }: LogoProps) {
  return (
    <Img
      src={resolveLogoUrl()}
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
