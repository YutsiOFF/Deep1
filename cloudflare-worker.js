/**
 * Deep1 CORS Proxy — Cloudflare Worker
 * Déploiement : https://workers.cloudflare.com (gratuit, 100k req/jour)
 * 1. Créer un Worker, coller ce code, déployer.
 * 2. Récupérer l'URL : https://<nom>.<pseudo>.workers.dev
 * 3. Dans player.html, mettre :
 *    const PROXY_BASE = 'https://<nom>.<pseudo>.workers.dev/?url=';
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response(JSON.stringify({ error: 'Missing ?url=' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // CORS preflight
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
      // On laisse le Content-Type d'origine (text/event-stream pour le SSE)
      // et on stream le body sans le bufferiser.
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};