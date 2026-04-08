# Auth Assets

## login-hero.png

**Path:** `public/images/auth/login-hero.png`
**Origin:** `imagem/Gemini_Generated_Image_ua01asua01asua01.png` (Gemini-generated, preserved)
**Dimensions:** 1952 x 2176
**Purpose:** Hero image on the right side of auth pages (login, signup, verify) when viewport >= 768px
**Usage:** referenced by `src/client/components/auth/auth-shell.tsx` via `next/image` with `priority={true}`

## Responsiveness

- Visible only on `md:` and up (>= 768px) — hidden on mobile
- LCP-critical: next/image MUST use `priority={true}` and `fetchPriority="high"` on the hero
- Layout: `object-cover` with `fill` inside a parent that has explicit height

## TODO — WebP optimization

The PNG is large. Future improvement: generate `login-hero.webp` (< 150KB target) using `sharp`:

```bash
npx sharp-cli input=public/images/auth/login-hero.png output=public/images/auth/login-hero.webp quality=82
```

Not blocking for Release 3 rollout.

## Attribution

Image is an AI generation (Gemini). No external license required.
