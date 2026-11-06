import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@seedhaprint/shared'],
  poweredByHeader: false,
  // Only the home page belongs in Google. Customer jobs, shop QR pages and dashboards stay out.
  async headers() {
    return [
      {
        source: '/:section(s|j|dashboard|admin|login)/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default config;
