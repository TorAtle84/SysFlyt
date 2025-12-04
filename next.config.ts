import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  turbopack: {},
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];
    return config;
  },
  allowedDevOrigins: [
    '*.replit.dev',
    '*.repl.co',
    'localhost',
    '127.0.0.1'
  ],
};

export default nextConfig;
