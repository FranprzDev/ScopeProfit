import type { MetadataRoute } from 'next';
import { SITE_PAGES, absoluteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const page of Object.values(SITE_PAGES)) {
    entries.push({
      url: absoluteUrl(page.path),
      lastModified: page.lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    });
  }
  return entries;
}
