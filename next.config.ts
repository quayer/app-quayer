import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Output standalone for Docker optimization
  output: 'standalone',

  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  serverExternalPackages: [
    'google-auth-library',
    'google-auth',
    'googleapis',
    'gaxios',
    'agent-base',
    'https-proxy-agent'
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Polyfills for Node.js modules in client-side bundles
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        http: false,
        https: false,
        stream: false,
        crypto: false,
        os: false,
        path: false,
        zlib: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
