import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
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
    // pdf-parse usa pdfjs com um worker (pdf.worker.mjs). Se for bundlado pelo
    // Next, o import do worker vira um chunk .next/server/chunks/pdf.worker.mjs
    // que não existe em runtime → "Setting up fake worker failed" no upload de
    // PDF da base de conhecimento. Externalizar faz rodar do node_modules real.
    'pdf-parse',
    'pdfjs-dist',
    // OTel hooks usados por @sentry/nextjs precisam ser resolvidos via
    // require nativo em runtime (não bundlados pelo Turbopack). Sem isso,
    // o Next.js gera referência hashed (import-in-the-middle-<hash>) que
    // falha em runtime com "Cannot find module" — quebra o instrumentation
    // hook e o app não sobe quando SENTRY_DSN está populado.
    // Refs: vercel/next.js#87737, vercel/next.js#88844.
    'import-in-the-middle',
    'require-in-the-middle',
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
          // browsing-topics replaces the deprecated interest-cohort (FLoC, retired Jul/2022).
          // Keeping the empty allowlist preserves the original opt-out intent for interest-based tracking.
          // microphone=(self) is required for the builder speech-to-text feature (getUserMedia on same-origin).
          { key: 'Permissions-Policy', value: 'accelerometer=(), browsing-topics=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=()' },
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

// withSentryConfig injeta a OTel auto-instrumentation no bundle do servidor,
// o que dispara dois bugs do Next.js 16 + Turbopack:
//   - vercel/next.js#87737: Turbopack referencia `import-in-the-middle` com
//     hash (`import-in-the-middle-<hash>`) que não existe no node_modules em
//     runtime. Mesmo declarando em serverExternalPackages, o erro persiste:
//     "Cannot find module 'import-in-the-middle-<hash>'" — fatal no boot.
//   - vercel/next.js#88844: o tracer omite estes pacotes do
//     .next/standalone/node_modules.
// Symlinks no Dockerfile foram tentados sem sucesso (require ignora os
// links no contexto do standalone runtime).
//
// DECISÃO: temporariamente desativar a integração Sentry/Next quando
// SENTRY_BUILD_DISABLED=1. Sentry continua disponível em runtime via
// `instrumentation.ts` lendo SENTRY_DSN; só o "magic wrapping" do Sentry
// para sourcemaps + auto-instrumentação OTel é desligado.
//
// Para reativar quando upstream corrigir os bugs do Turbopack: remover
// SENTRY_BUILD_DISABLED do build-args do deploy-homol.yml/deploy-production.yml.
const sentryBuildDisabled = process.env.SENTRY_BUILD_DISABLED === '1';

const withFumadocs = (config: NextConfig) => withMDX(config);

export default sentryBuildDisabled
  ? withFumadocs(nextConfig)
  : withSentryConfig(withFumadocs(nextConfig), {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      sourcemaps: { disable: true },
      disableLogger: true,
      automaticVercelMonitors: false,
    });
