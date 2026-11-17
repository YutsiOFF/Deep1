/**
 * Deep1 CORS Proxy — Cloudflare Worker
 * Déploiement sans compte : npx wrangler deploy --temporary
 * Puis cliquer sur la Claim URL pour rendre le Worker permanent (gratuit).
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    // Supporte ?url= et ?uri= (compatibilité cors-anywhere)
    const target = url.searchParams.get('url') || url.searchParams.get('uri');
    if (!target) {
      return new Response(JSON.stringify({ error: 'Missing ?url=' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      const upstream = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': new URL(target).origin,
          'Accept': '*/*',
        },
        redirect: 'follow',
      });

      const headers = new Headers(upstream.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      headers.set('Access-Control-Allow-Headers', '*');
      headers.set('Access-Control-Expose-Headers', '*');

      // On stream le body sans le bufferiser (SSE et HLS passent tels quels)
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};