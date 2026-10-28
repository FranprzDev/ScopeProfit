# Landing page analytics

The Vercel production landing uses Vercel Web Analytics for home-page views only. It does not measure MCP calls, self-hosted installations, project data, exports or tool-finder input. Local development and Vercel previews do not enable this collector. The existing optional Plausible integration remains available outside Vercel production; both trackers are not rendered together.

The client drops events for Do Not Track, the `va-disable` localStorage opt-out, unreadable storage, invalid URLs and paths other than `/`. Query strings and URL fragments are removed before sending. No custom events are emitted. The existing no-referrer policy is retained.

Vercel describes the service as cookie-free and aggregated, using a request hash for visitor identification that is discarded after 24 hours. Its standard data includes timestamp, URL, referrer, approximate geography, browser and device. Visitor counts are estimates, not verified people, paying users or active installations.

Verified October 28, 2026: the current team is on Hobby, which includes 50,000 events per month shared across its projects and a one-month reporting window. Hobby does not bill additional events: collection pauses at the limit. Do not upgrade or add paid analytics without owner approval. Check the live dashboard and pricing again if the team's plan changes.

Collection begins after activation and deployment. It does not reconstruct previous visitors. Deployment verification itself may create test page views; do not report those as traction.

Sources:

- https://vercel.com/docs/analytics/limits-and-pricing
- https://vercel.com/docs/analytics/privacy-policy
- https://vercel.com/docs/analytics/redacting-sensitive-data
- https://vercel.com/docs/analytics/quickstart
