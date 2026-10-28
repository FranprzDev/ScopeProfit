'use client';

import { Analytics } from '@vercel/analytics/next';
import type { ComponentProps } from 'react';

type BeforeSend = NonNullable<ComponentProps<typeof Analytics>['beforeSend']>;
type AnalyticsEvent = Parameters<BeforeSend>[0];

const beforeSend: BeforeSend = (event: AnalyticsEvent) => {
  if (navigator.doNotTrack === '1') return null;

  try {
    if (localStorage.getItem('va-disable')) return null;
  } catch {
    return null;
  }

  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }

  if (url.pathname !== '/') return null;

  return { ...event, url: `${url.origin}/` };
};

export function VercelAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
