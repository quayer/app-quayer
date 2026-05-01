import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: 'standalone',
  // react-markdown and its dep chain are ESM-only; webpack (prod build) needs this
  transpilePackages: [
    'react-markdown',
    'remark-gfm',
    'unified',
    'bail',
    'is-plain-obj',
    'trough',
    'vfile',
    'vfile-message',
    'unist-util-stringify-position',
    'micromark',
    'decode-named-character-reference',
    'character-entities',
    'mdast-util-from-markdown',
    'mdast-util-to-hast',
    'mdast-util-gfm',
    'remark-parse',
    'remark-rehype',
    'hast-util-to-jsx-runtime',
    'property-information',
  ],
  serverExternalPackages: [
    'google-auth-library',
    'google-auth',
    'googleapis',
    'gaxios',
    'agent-base',
    'https-proxy-agent',
    'pg',
    '@prisma/adapter-pg',
  ],
  turbopack: {},
  images: {
    remotePatterns: [],
    // Adicionar padrões específicos quando precisar de imagens externas, ex:
    // { protocol: 'https', hostname: 'cdn.quayer.com' }
  },
  async redirects() {
    return [
      { source: '/admin/roles', destination: '/integracoes/settings/roles', permanent: true },
      { source: '/admin/domains', destination: '/integracoes/settings/domains', permanent: true },
      { source: '/admin/scim', destination: '/integracoes/settings/scim', permanent: true },
      { source: '/user/seguranca', destination: '/conta?tab=seguranca', permanent: true },
      { source: '/configuracoes/api-keys', destination: '/org/api-keys', permanent: true },
      { source: '/admin/billing', destination: '/org/billing', permanent: true },
      { source: '/admin/billing/subscriptions', destination: '/org/billing', permanent: true },
      { source: '/admin/billing/invoices', destination: '/org/billing', permanent: true },
      { source: '/admin/audit', destination: '/org/auditoria', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // X-XSS-Protection intentionally omitted: deprecated in modern browsers,
          // superseded by CSP, and can introduce XSS vulnerabilities in legacy IE/Edge.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            // 'unsafe-eval' removed: not required by Next.js in production builds.
            // 'unsafe-inline' removed from script-src: replaced by per-request nonce
            // injected in src/middleware.ts. The theme-bootstrap script in layout.tsx
            // receives the nonce via the x-nonce request header.
            // connect-src: Sentry browser SDK reports to *.sentry.io;
            //   Cloudflare Turnstile widget makes verification beacons to challenges.cloudflare.com.
            //   Upstash is server-side only — no browser fetch needed.
            //   OpenAI and Facebook Graph API are called server-side only — excluded from browser CSP.
            // frame-src: Cloudflare Turnstile renders a challenge iframe from challenges.cloudflare.com.
            value: [
              "default-src 'self'",
              // Nonce is injected per-request via middleware (src/middleware.ts) for page routes.
              // This static fallback covers API routes and paths outside the middleware matcher
              // and intentionally omits 'unsafe-inline' — nonce takes its place for pages.
              // See: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
              "script-src 'self' https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://o4508515203874816.ingest.de.sentry.io https://challenges.cloudflare.com",
              "frame-src 'self' https://challenges.cloudflare.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: true },
  disableLogger: true,
  automaticVercelMonitors: false,
});
