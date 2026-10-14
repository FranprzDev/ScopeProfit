import { MCP_DOCS_URL, REPO_URL, TOOL_GROUPS, type FaqEntry } from '@/app/content';
import type { JsonLdData } from '@/components/json-ld';
import { DESCRIPTION, SITE_LANGUAGE, SITE_NAME } from './seo';
import { SITE_URL } from './site';

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const APPLICATION_ID = `${SITE_URL}/#software`;

function toolNames(): string[] {
  const names: string[] = [];
  for (const group of TOOL_GROUPS) {
    for (const tool of group.tools) {
      names.push(tool.name);
    }
  }
  return names;
}

/**
 * Site-wide graph: the publisher, the website and the MCP server itself.
 * No `offers` or `aggregateRating`: the product publishes no price and has no reviews.
 */
export function buildSiteJsonLd(): JsonLdData {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/apple-icon`,
        sameAs: [REPO_URL],
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: SITE_NAME,
        url: SITE_URL,
        inLanguage: SITE_LANGUAGE,
        publisher: { '@id': ORGANIZATION_ID },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': APPLICATION_ID,
        name: SITE_NAME,
        url: SITE_URL,
        description: DESCRIPTION,
        image: `${SITE_URL}/opengraph-image`,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: SITE_LANGUAGE,
        featureList: toolNames(),
        softwareHelp: { '@type': 'CreativeWork', url: MCP_DOCS_URL },
        sameAs: [REPO_URL],
        author: { '@id': ORGANIZATION_ID },
        publisher: { '@id': ORGANIZATION_ID },
      },
    ],
  };
}

/** FAQPage built only from questions and answers that are visible on the page. */
export function buildFaqJsonLd(entries: FaqEntry[]): JsonLdData {
  const mainEntity: JsonLdData[] = [];
  for (const entry of entries) {
    mainEntity.push({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    });
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity,
  };
}
