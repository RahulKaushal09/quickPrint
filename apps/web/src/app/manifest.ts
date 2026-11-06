import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SeedhaPrint',
    short_name: 'SeedhaPrint',
    description: 'Phone se seedha print.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f5f1',
    theme_color: '#0b1220',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
