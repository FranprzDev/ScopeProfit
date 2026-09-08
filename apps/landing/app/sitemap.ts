import type { MetadataRoute } from 'next';

const SITE_URL = 'https://scopeprofit.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/faq`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/status`, changeFrequency: 'daily', priority: 0.6 },
  ];
}
