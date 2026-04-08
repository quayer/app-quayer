import * as React from 'react';

export interface LogoProps {
  /**
   * Altura do icone raio em pixels. O wordmark escala proporcionalmente.
   * Default 32 — equivale ao tamanho usado no header de auth (140x32-ish).
   */
  size?: number;
  className?: string;
  /**
   * Variante visual:
   * - 'color': gradiente ambar/laranja/vermelho profundo (v3 padrao fundo escuro)
   * - 'light': gradiente mais escuro para fundos claros
   * - 'mono-dark': monocromatico escuro (#1a0800) para papelaria clara
   * - 'mono-white': monocromatico branco para backgrounds escuros
   */
  variant?: 'color' | 'light' | 'mono-dark' | 'mono-white';
  /**
   * Se exibe o wordmark "Quayer" ao lado do icone. Default true.
   */
  showWordmark?: boolean;
  'aria-label'?: string;
}

// Aspect ratio do icone (path viewBox 200x248)
const ICON_ASPECT = 200 / 248; // ~0.806

/**
 * Quayer brand logo — fonte de verdade: quayer-ds-v3.html
 *
 * Composicao: icone raio + wordmark "Quayer" em DM Sans black.
 * Gap entre icone e texto = altura do icone * 0.25 (regra do DS).
 * Wordmark renderizado em ~1.125x o tamanho do icone.
 *
 * Server component — pode ser usado em qualquer lugar (layout, forms, nav).
 */
export function Logo({
  size = 32,
  className = '',
  variant = 'color',
  showWordmark = true,
  'aria-label': ariaLabel = 'Quayer',
}: LogoProps): React.ReactElement {
  const iconHeight = size;
  const iconWidth = Math.round(size * ICON_ASPECT);
  const gap = Math.round(size * 0.25);
  const wordmarkSize = Math.round(size * 1.125);
  const uid = React.useId();
  const ids = {
    main: `${uid}-qGradMain`,
    ref: `${uid}-qGradRef`,
    vol: `${uid}-qGradVol`,
    edgeL: `${uid}-qEdgeL`,
    edgeR: `${uid}-qEdgeR`,
    shadow: `${uid}-qShadow`,
    light: `${uid}-qGradLight`,
    filter: `${uid}-qIconShadow`,
  };

  const wordmarkColor =
    variant === 'mono-white'
      ? '#ffffff'
      : variant === 'mono-dark'
        ? '#1a0800'
        : variant === 'light'
          ? '#1a0800'
          : 'currentColor';

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={`inline-flex items-center ${className}`}
      style={{ gap }}
    >
      <svg
        width={iconWidth}
        height={iconHeight}
        viewBox="0 0 200 248"
        filter={variant === 'color' || variant === 'light' ? `url(#${ids.filter})` : undefined}
        aria-hidden="true"
      >
        <defs>
          {/* Gradiente principal ambar → laranja → vermelho profundo (fundo escuro) */}
          <linearGradient id={ids.main} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#FFFDE0" />
            <stop offset="12%" stopColor="#FFD60A" />
            <stop offset="28%" stopColor="#FF9200" />
            <stop offset="44%" stopColor="#E84000" />
            <stop offset="60%" stopColor="#B82000" />
            <stop offset="78%" stopColor="#881400" />
            <stop offset="100%" stopColor="#580800" />
          </linearGradient>

          {/* Volume lateral — sombra natural 3D */}
          <linearGradient id={ids.vol} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#000" stopOpacity=".48" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </linearGradient>

          {/* Reflexo de luz — faixa diagonal */}
          <linearGradient id={ids.ref} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff" stopOpacity=".65" />
            <stop offset="35%" stopColor="#ffe8b0" stopOpacity=".28" />
            <stop offset="70%" stopColor="#fff" stopOpacity=".06" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>

          {/* Aresta esquerda iluminada */}
          <linearGradient id={ids.edgeL} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fffde0" />
            <stop offset="30%" stopColor="#FFD60A" />
            <stop offset="65%" stopColor="#cc5500" />
            <stop offset="100%" stopColor="#661100" />
          </linearGradient>

          {/* Aresta direita sombra */}
          <linearGradient id={ids.edgeR} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ff9200" />
            <stop offset="45%" stopColor="#bb2800" />
            <stop offset="100%" stopColor="#550800" />
          </linearGradient>

          {/* Sombra projetada radial */}
          <radialGradient id={ids.shadow} cx="45%" cy="100%" r="50%">
            <stop offset="0%" stopColor="#000" stopOpacity=".45" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>

          {/* Gradiente modo claro */}
          <linearGradient id={ids.light} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#cc8800" />
            <stop offset="30%" stopColor="#994400" />
            <stop offset="60%" stopColor="#772200" />
            <stop offset="100%" stopColor="#440800" />
          </linearGradient>

          {/* Drop shadow filter */}
          <filter id={ids.filter} x="-20%" y="-10%" width="140%" height="130%">
            <feDropShadow
              dx="0"
              dy={variant === 'light' ? '3' : '4'}
              stdDeviation={variant === 'light' ? '5' : '8'}
              floodColor={variant === 'light' ? '#1e0800' : '#8B1400'}
              floodOpacity={variant === 'light' ? '.25' : '.40'}
            />
          </filter>
        </defs>

        {variant === 'color' && (
          <>
            {/* Sombra projetada embaixo */}
            <ellipse cx="91" cy="244" rx="46" ry="5" fill={`url(#${ids.shadow})`} opacity=".4" />
            {/* Path principal */}
            <path
              d="M 92 6 L 158 6 L 116 122 L 170 122 L 38 242 L 4 242 L 74 118 L 20 118 Z"
              fill={`url(#${ids.main})`}
            />
            {/* Volume lateral */}
            <path
              d="M 92 6 L 158 6 L 116 122 L 170 122 L 38 242 L 4 242 L 74 118 L 20 118 Z"
              fill={`url(#${ids.vol})`}
              opacity=".38"
            />
            {/* Reflexo */}
            <path
              d="M 92 6 L 112 6 L 38 118 L 20 118 Z"
              fill={`url(#${ids.ref})`}
              opacity=".65"
            />
            {/* Arestas iluminadas */}
            <line x1="92" y1="6" x2="20" y2="118" stroke={`url(#${ids.edgeL})`} strokeWidth="2" strokeLinecap="round" opacity=".9" />
            <line x1="92" y1="6" x2="158" y2="6" stroke={`url(#${ids.edgeL})`} strokeWidth="1.5" strokeLinecap="round" opacity=".4" />
            <line x1="158" y1="6" x2="116" y2="118" stroke={`url(#${ids.edgeR})`} strokeWidth="2" strokeLinecap="round" opacity=".72" />
            <line x1="170" y1="122" x2="38" y2="242" stroke={`url(#${ids.edgeR})`} strokeWidth="2" strokeLinecap="round" opacity=".7" />
          </>
        )}

        {variant === 'light' && (
          <>
            <path
              d="M 92 6 L 158 6 L 116 122 L 170 122 L 38 242 L 4 242 L 74 118 L 20 118 Z"
              fill={`url(#${ids.light})`}
            />
            <path d="M 92 6 L 112 6 L 38 118 L 20 118 Z" fill="rgba(255,255,255,.35)" />
            <line x1="92" y1="6" x2="20" y2="118" stroke="rgba(200,140,0,.4)" strokeWidth="2" strokeLinecap="round" />
          </>
        )}

        {variant === 'mono-white' && (
          <>
            <path
              d="M 92 6 L 158 6 L 116 122 L 170 122 L 38 242 L 4 242 L 74 118 L 20 118 Z"
              fill="#ffffff"
            />
            <path d="M 92 6 L 112 6 L 38 118 L 20 118 Z" fill="rgba(0,0,0,.18)" />
          </>
        )}

        {variant === 'mono-dark' && (
          <>
            <path
              d="M 92 6 L 158 6 L 116 122 L 170 122 L 38 242 L 4 242 L 74 118 L 20 118 Z"
              fill="#1a0800"
            />
            <path d="M 92 6 L 112 6 L 38 118 L 20 118 Z" fill="rgba(255,255,255,.25)" />
          </>
        )}
      </svg>

      {showWordmark && (
        <span
          style={{
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
            fontSize: wordmarkSize,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: wordmarkColor,
            lineHeight: 1,
          }}
        >
          Quayer
        </span>
      )}
    </div>
  );
}

export default Logo;
