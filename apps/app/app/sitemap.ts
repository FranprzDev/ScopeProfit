import type { MetadataRoute } from 'next';

const SITE_URL = 'https://scopeprofit.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/checklist`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];
}
