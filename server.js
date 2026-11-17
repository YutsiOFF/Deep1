/**
 * Deep1 Proxy Backend
 * - Extrait l'URL .m3u8 depuis les embeds CineSrc / MoviezAPI via Playwright
 * - Proxy le flux HLS et réécrit les URLs des segments pour éviter CORS
 * - Cache en mémoire (5 min)
 */
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { chromium } = require('playwright');

const app = express();
app.use(cors({ origin: '*' }));

const CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCache(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL) { CACHE.delete(key); return null; }
  return entry.value;
}
function setCache(key, value) { CACHE.set(key, { value, time: Date.now() }); }

/* ---------- Extraction du flux ---------- */
async function extractM3U8(tmdbId, type, season, episode, lang) {
  const embedUrl = type === 'tv'
    ? `https://cinesrc.st/embed/tv/${tmdbId}?s=${season}&e=${episode}`
    : `https://cinesrc.st/embed/movie/${tmdbId}`;

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let m3u8Url = null;
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('.m3u8') && !url.includes('proxy')) {
      m3u8Url = url;
    }
  });

  try {
    await page.goto(embedUrl, { waitUntil: 'networkidle', timeout: 30000 });
    // Attendre un peu que le player démarre
    await page.waitForTimeout(5000);
    if (!m3u8Url) {
      // Essayer de cliquer sur play si nécessaire
      const playBtn = await page.$('button[aria-label="Play"], .play-button, video');
      if (playBtn) { await playBtn.click().catch(() => {}); await page.waitForTimeout(5000); }
    }
  } catch (e) {
    console.error('Extraction error:', e.message);
  } finally {
    await browser.close();
  }

  return m3u8Url;
}

/* ---------- Proxy HLS ---------- */
async function proxyM3U8(url, baseUrl) {
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const body = res.data;
  const lines = body.split('\n');
  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      // Réécrire les URLs dans les tags #EXT-X-KEY et #EXT-X-MAP
      return line.replace(/URI="([^"]+)"/g, (_, u) => {
        const abs = new URL(u, baseUrl).href;
        return `URI="${abs}"`;
      });
    }
    // URL de segment ou de variant
    const abs = new URL(trimmed, baseUrl).href;
    return abs;
  }).join('\n');
  return rewritten;
}

/* ---------- Route stream ---------- */
app.get('/stream', async (req, res) => {
  const { tmdb, type = 'movie', season = '1', episode = '1', lang = 'vf' } = req.query;
  if (!tmdb) return res.status(400).json({ error: 'tmdb requis' });

  const key = `${tmdb}-${type}-${season}-${episode}-${lang}`;
  const cached = getCache(key);
  if (cached) return res.json({ url: cached });

  try {
    const m3u8 = await extractM3U8(tmdb, type, season, episode, lang);
    if (!m3u8) return res.status(404).json({ error: 'Flux introuvable' });

    // Proxifier le m3u8 maître
    const proxied = `${req.protocol}://${req.get('host')}/proxy?url=${encodeURIComponent(m3u8)}`;
    setCache(key, proxied);
    res.json({ url: proxied });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur extraction' });
  }
});

/* ---------- Route proxy ---------- */
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('url requis');
  try {
    const isM3U8 = target.includes('.m3u8');
    if (isM3U8) {
      const body = await proxyM3U8(target, target);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(body);
    } else {
      // Segment TS : stream direct
      const upstream = await axios.get(target, {
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      res.setHeader('Content-Type', upstream.headers['content-type'] || 'video/mp2t');
      upstream.data.pipe(res);
    }
  } catch (e) {
    res.status(502).send('Proxy error');
  }
});

app.get('/', (_, res) => res.json({ ok: true, service: 'deep1-proxy' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Deep1 proxy on :${PORT}`));