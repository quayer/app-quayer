# Auth Assets

## login-hero (WebP, production)

**Path:** `public/images/auth/login-hero.webp`
**Size:** ~98.5 KB
**Dimensions:** max 1600 x 1600 (resized from source, aspect preserved)
**Purpose:** Hero image on the right side of auth pages (login, signup, verify) when viewport >= 768px
**Usage:** referenced by `src/client/components/auth/auth-shell.tsx` via `next/image` with `priority={true}` and `fetchPriority="high"`

## login-hero-sm (WebP, mobile retina fallback)

**Path:** `public/images/auth/login-hero-sm.webp`
**Size:** ~34.1 KB
**Dimensions:** max 800 x 800
**Purpose:** Smaller variant for narrower viewports / mobile retina; served via responsive `sizes` attribute on next/image.

## login-hero.png (source archive)

**Path:** `public/images/auth/login-hero.png`
**Origin:** `imagem/Gemini_Generated_Image_ua01asua01asua01.png` (Gemini-generated, preserved)
**Dimensions:** 1952 x 2176
**Status:** Source archive only. NOT served in production. Kept so the WebP variants can be regenerated if quality settings change.

## Responsiveness

- Visible only on `md:` and up (>= 768px) - hidden on mobile
- LCP-critical: next/image MUST use `priority={true}` and `fetchPriority="high"` on the hero
- Layout: `object-cover` with `fill` inside a parent that has explicit height
- `sizes="(max-width: 1280px) 50vw, 800px"`

## Attribution

Image is an AI generation (Gemini). No external license required.
