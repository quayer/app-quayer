import Image from 'next/image';
import * as React from 'react';

export interface LogoProps {
  /**
   * Altura em pixels. A largura e calculada automaticamente para preservar
   * a proporcao original do logo (685x156 = aspect ~4.39:1).
   */
  size?: number;
  className?: string;
  'aria-label'?: string;
  priority?: boolean;
}

// Proporcao do arquivo public/logo.svg (685 / 156)
const LOGO_ASPECT_RATIO = 685 / 156;

/**
 * Quayer brand logo.
 * Usa o SVG oficial em public/logo.svg (Q mark + wordmark).
 * Server component — pode ser importado de qualquer lugar.
 */
export function Logo({
  size = 32,
  className,
  'aria-label': ariaLabel = 'Quayer',
  priority = false,
}: LogoProps): React.ReactElement {
  const width = Math.round(size * LOGO_ASPECT_RATIO);
  return (
    <Image
      src="/logo.svg"
      alt={ariaLabel}
      width={width}
      height={size}
      priority={priority}
      className={className}
      style={{ height: size, width }}
    />
  );
}

export default Logo;
