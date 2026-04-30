import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
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
