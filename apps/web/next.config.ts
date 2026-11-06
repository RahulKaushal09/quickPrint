import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@quickprint/shared'],
  poweredByHeader: false,
};

export default config;
