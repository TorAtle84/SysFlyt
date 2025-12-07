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
    'b99626c9-8362-4d74-97be-082eb52e48ac-00-2lttn1bq93mlg.kirk.replit.dev',
    '*.replit.dev',
    '*.repl.co',
    '*.kirk.replit.dev',
    '127.0.0.1',
    'localhost',
  ],
};

export default nextConfig;
