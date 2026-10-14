import type { MetadataRoute } from 'next';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://scopeprofit.app';

/** Every public route of the landing. Add a member here before adding a page. */
export enum SitePath {
  Home = '/',
}

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

export interface SitePage {
  path: SitePath;
  /** ISO date of the last real content change on this route. Bump it when you change the copy. */
  lastModified: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

export const SITE_PAGES: Record<SitePath, SitePage> = {
  [SitePath.Home]: {
    path: SitePath.Home,
    lastModified: '2026-10-13',
    changeFrequency: 'weekly',
    priority: 1,
  },
};

/** Absolute URL without a trailing slash, matching the canonical links Next.js renders. */
export function absoluteUrl(path: SitePath): string {
  const url = new URL(path, SITE_URL).toString();
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
