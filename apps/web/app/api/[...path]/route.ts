import { NextRequest } from 'next/server';

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
  const url = new URL(`/api/${path.map(encodeURIComponent).join('/')}`, base);
  url.search = request.nextUrl.search;
  const headers = new Headers();
  for (const key of ['content-type', 'cookie', 'x-project-token', 'origin', 'x-request-id']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const upstream = await fetch(url, {
      method: request.method, headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(120_000),
    });
    const responseHeaders = new Headers();
    for (const key of ['content-type', 'content-disposition', 'location', 'retry-after']) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('set-cookie', cookie);
    responseHeaders.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ success: false, error: { code: 'API_UNAVAILABLE', message: 'El servicio no está disponible. Intentá nuevamente.', details: null, requestId: null } }, { status: 502 });
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
