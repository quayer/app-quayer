import * as React from 'react';
import { Img } from '@react-email/components';

interface LogoProps {
  width?: number;
  height?: number;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.quayer.com';

// PNG (not SVG) because Outlook desktop and Gmail iOS strip external SVG.
// Dark fill (#1A0800) renders against the white card background; the public/
// logo.svg ships in white for the dark app UI.
export function Logo({ width = 140, height = 32 }: LogoProps) {
  return (
    <Img
      src={`${APP_URL}/logo.png`}
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
