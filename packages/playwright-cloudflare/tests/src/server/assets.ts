// Serves the upstream test server's assets, as the specs' `server` fixture expects.
export async function serveAsset(request: Request, assets: Fetcher | undefined): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/index.html')
    // let's use empty.html for index.html
    request = new Request(request.url.replace(/\/index\.html$/, '/empty'));
  else if (url.pathname.endsWith('.html'))
    // assets serve html files without .html extension
    request = new Request(request.url.substring(0, request.url.length - '.html'.length));

  let response = await assets?.fetch(request);
  if (!response)
    return new Response('Not found', { status: 404 });
  // Like the upstream test server, give missing files a body. Chromium shows
  // its own error page instead of an empty 4xx response.
  if (response.status === 404 && request.method !== 'HEAD')
    response = new Response(`File not found: ${new URL(request.url).pathname}`, { status: 404, headers: { 'Content-Type': 'text/plain' } });

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-cache, no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
