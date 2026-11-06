import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Everything is crawlable so Google can read the noindex header on private pages (see next.config.ts).
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${SITE_URL}/sitemap.xml` };
}
