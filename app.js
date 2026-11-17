/* ============================================================
   Deep1 — Streaming UI
   Données : TMDB  ·  Lecteur : api.moviez.ac
   ============================================================ */

const TMDB_API_KEY = 'ec801beca6ce458e2a220a27ee334746';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const PLAYER_BASE = 'https://api.moviez.ac';

const state = {
  heroMovie: null,
  currentModal: null,     // { item, type, detail }
  searchTimeout: null,
  genreCache: null,
  langLabels: { vf: 'VF', vostfr: 'VOSTFR', vo: 'VO', en: 'VO', multi: 'Multi' },
  currentLang: 'vf',
};

/* ---------- Helpers ---------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

async function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('language', 'fr-FR');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} sur ${path}`);
  return res.json();
}

async function moviezCheck(tmdbId) {
  try {
    const res = await fetch(`${PLAYER_BASE}/api/check/${tmdbId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

const posterURL = (path, size = 'w500') => path ? `${IMG_BASE}/${size}${path}` : '';
const backdropURL = (path, size = 'w1280') => path ? `${IMG_BASE}/${size}${path}` : '';
const yearOf = (date) => date ? new Date(date).getFullYear() : '—';
const rating = (v) => v ? v.toFixed(1) : '—';

/* ---------- Genres (préchargés une fois) ---------- */
async function loadGenres() {
  if (state.genreCache) return state.genreCache;
  const [movies, tv] = await Promise.all([
    tmdb('/genre/movie/list').catch(() => ({ genres: [] })),
    tmdb('/genre/tv/list').catch(() => ({ genres: [] })),
  ]);
  const map = {};
  [...(movies.genres || []), ...(tv.genres || [])].forEach((g) => { map[g.id] = g.name; });
  state.genreCache = map;
  return map;
}
const genreNames = (ids) => (ids || []).map((id) => state.genreCache?.[id]).filter(Boolean);

/* ---------- Cartes ---------- */
function createCard(item, type = 'movie') {
  const title = item.title || item.name || 'Sans titre';
  const date = item.release_date || item.first_air_date;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <img class="card-poster" loading="lazy" alt="${title}"
         src="${posterURL(item.poster_path)}"
         onerror="this.style.background='#1a1a24';this.removeAttribute('src')" />
    <div class="card-info">
      <div class="card-title">${title}</div>
      <div class="card-sub">
        <span>${yearOf(date)}</span>
        <span class="card-rating">★ ${rating(item.vote_average)}</span>
      </div>
    </div>`;
  card.addEventListener('click', () => openModal(item, type));
  return card;
}

function renderRow(containerId, items, type = 'movie') {
  const row = document.getElementById(containerId);
  if (!row) return;
  row.innerHTML = '';
  if (!items || !items.length) {
    row.innerHTML = `<p style="color:#9a9aa8;font-size:14px;padding:12px 0;">Aucun résultat.</p>`;
    return;
  }
  items.forEach((item) => row.appendChild(createCard(item, type)));
}

/* ---------- Hero ---------- */
async function loadHero() {
  try {
    const data = await tmdb('/trending/movie/week');
    const results = data.results || [];
    const movie = results[Math.floor(Math.random() * Math.min(5, results.length))] || results[0];
    if (!movie) return;
    state.heroMovie = movie;
    $('#hero-backdrop').style.backgroundImage = `url('${backdropURL(movie.backdrop_path)}')`;
    $('#hero-title').textContent = movie.title || movie.name || '';
    $('#hero-overview').textContent = movie.overview || 'Aucun synopsis disponible.';
    const genres = genreNames(movie.genre_ids).slice(0, 3);
    $('#hero-meta').innerHTML = `
      <span class="rating">★ ${rating(movie.vote_average)}</span>
      <span>${yearOf(movie.release_date)}</span>
      ${genres.length ? `<span>${genres.join(' · ')}</span>` : ''}
      <span class="dot"></span>
      <span>HD</span>`;
  } catch (e) {
    console.error('Hero:', e);
    $('#hero-title').textContent = 'Bienvenue sur Deep1';
    $('#hero-overview').textContent = 'Impossible de charger les tendances pour le moment.';
  }
}

/* ---------- Rangées ---------- */
async function loadTrending() {
  try { const d = await tmdb('/trending/movie/week'); renderRow('row-tendances', (d.results || []).slice(0, 18)); }
  catch (e) { console.error('Tendances:', e); }
}
async function loadNewReleases() {
  try { const d = await tmdb('/movie/now_playing', { region: 'FR' }); renderRow('row-nouveautes', (d.results || []).slice(0, 18)); }
  catch (e) { console.error('Nouveautés:', e); }
}
async function loadPopular() {
  try { const d = await tmdb('/movie/popular'); renderRow('row-populaires', (d.results || []).slice(0, 18)); }
  catch (e) { console.error('Populaires:', e); }
}
async function loadSeries() {
  try { const d = await tmdb('/tv/popular'); renderRow('row-series', (d.results || []).slice(0, 18), 'tv'); }
  catch (e) { console.error('Séries:', e); }
}
async function loadTopRated() {
  try { const d = await tmdb('/movie/top_rated'); renderRow('row-top', (d.results || []).slice(0, 18)); }
  catch (e) { console.error('Top:', e); }
}

/* ---------- Recherche ---------- */
async function performSearch(query) {
  const q = query.trim();
  const header = $('#tendances .row-header h2');
  if (!q) {
    header.textContent = 'Tendances';
    loadTrending();
    return;
  }
  try {
    const data = await tmdb('/search/multi', { query: q, include_adult: 'false' });
    const results = (data.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
    const withPoster = results.filter((r) => r.poster_path);
    renderRow('row-tendances', withPoster.slice(0, 18));
    header.textContent = `Résultats pour « ${q} » (${withPoster.length})`;
    $('#tendances').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.error('Recherche:', e); }
}

/* ---------- Modale ---------- */
async function openModal(item, type = 'movie') {
  state.currentModal = { item, type, detail: null };
  state.currentLang = 'vf';

  const title = item.title || item.name || '';
  const date = item.release_date || item.first_air_date;
  const backdrop = item.backdrop_path || item.poster_path;

  $('#modal-hero').style.backgroundImage = backdrop ? `url('${backdropURL(backdrop)}')` : 'none';
  $('#modal-title').textContent = title;
  $('#modal-overview').textContent = item.overview || 'Aucun synopsis disponible.';

  const genres = genreNames(item.genre_ids);
  $('#modal-meta').innerHTML = `
    <span style="color:#f5c518;font-weight:700;">★ ${rating(item.vote_average)}</span>
    <span>${yearOf(date)}</span>
    ${genres.length ? `<span>${genres.join(' · ')}</span>` : ''}
    <span>${type === 'tv' ? 'Série' : 'Film'}</span>
    <span id="modal-availability" style="color:#9a9aa8;">· vérification…</span>`;

  // Reset lecteur + zone épisodes/langues
  $('#player-container').style.display = 'none';
  $('#player-frame').src = 'about:blank';
  $('#lang-bar').innerHTML = '';
  $('#episode-bar').innerHTML = '';
  $('#episode-bar').style.display = 'none';

  $('#modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Vérification Moviez (dispo, type réel, langues, embed)
  const check = await moviezCheck(item.id);
  if (check && check.available) {
    state.currentModal.detail = check;
    const labels = (check.languages || []).map((l) => state.langLabels[l] || l.toUpperCase());
    $('#modal-availability').textContent = `· disponible`;
    $('#modal-availability').style.color = '#4ade80';
    renderLangBar(check.languages || []);
    if (check.detectedType === 'series' && check.seasons) {
      state.currentModal.type = 'series';
      renderEpisodeBar(check.seasons);
    }
  } else {
    $('#modal-availability').textContent = '· non disponible sur le lecteur';
    $('#modal-availability').style.color = '#f87171';
  }
}

function renderLangBar(langs) {
  const bar = $('#lang-bar');
  bar.innerHTML = '';
  const unique = [...new Set(langs.map((l) => state.langLabels[l] ? l : 'multi'))];
  if (!unique.length) return;
  state.currentLang = unique.includes('vf') ? 'vf' : unique[0];
  unique.forEach((l) => {
    const btn = document.createElement('button');
    btn.className = 'lang-btn' + (l === state.currentLang ? ' active' : '');
    btn.textContent = state.langLabels[l] || l.toUpperCase();
    btn.dataset.lang = l;
    btn.addEventListener('click', () => {
      state.currentLang = l;
      $$('.lang-btn', bar).forEach((b) => b.classList.toggle('active', b.dataset.lang === l));
      if ($('#player-container').style.display !== 'none') playCurrent();
    });
    bar.appendChild(btn);
  });
}

function renderEpisodeBar(seasons) {
  const bar = $('#episode-bar');
  bar.style.display = 'flex';
  bar.innerHTML = '';
  const seasonSel = document.createElement('select');
  seasonSel.id = 'season-select';
  for (let s = 1; s <= seasons; s++) {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = `Saison ${s}`;
    seasonSel.appendChild(opt);
  }
  const epSel = document.createElement('select');
  epSel.id = 'episode-select';
  const fillEpisodes = async (s) => {
    epSel.innerHTML = '<option>…</option>';
    try {
      const d = await tmdb(`/tv/${state.currentModal.item.id}/season/${s}`);
      epSel.innerHTML = '';
      (d.episodes || []).forEach((ep) => {
        const opt = document.createElement('option');
        opt.value = ep.episode_number;
        opt.textContent = `Ép. ${ep.episode_number} — ${ep.name || ''}`;
        epSel.appendChild(opt);
      });
    } catch {
      epSel.innerHTML = '';
      for (let e = 1; e <= 20; e++) {
        const opt = document.createElement('option');
        opt.value = e; opt.textContent = `Épisode ${e}`;
        epSel.appendChild(opt);
      }
    }
  };
  seasonSel.addEventListener('change', () => fillEpisodes(seasonSel.value));
  bar.appendChild(seasonSel);
  bar.appendChild(epSel);
  fillEpisodes(1);
}

function closeModal() {
  $('#modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  $('#player-frame').src = 'about:blank';
  $('#player-container').style.display = 'none';
  state.currentModal = null;
}

/* ---------- Lecture ---------- */
function playCurrent() {
  const ctx = state.currentModal;
  if (!ctx) return;

  let embed = null;
  if (ctx.detail && ctx.detail.embed) {
    embed = ctx.detail.embed;
    // Appliquer la langue choisie si le lecteur la gère
    if (state.currentLang) {
      const sep = embed.includes('?') ? '&' : '?';
      embed = `${embed}${sep}lang=${state.currentLang}`;
    }
    // Série : injecter saison/épisode si sélectionnés
    if (ctx.detail.detectedType === 'series') {
      const season = $('#season-select')?.value || 1;
      const ep = $('#episode-select')?.value || 1;
      embed = `${PLAYER_BASE}/serie/${ctx.item.id}/${season}/${ep}`;
      if (state.currentLang) embed += `?lang=${state.currentLang}`;
    }
  } else {
    return;
  }

  const container = $('#player-container');
  const frame = $('#player-frame');
  frame.src = embed;
  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- Écouteurs ---------- */
function bindEvents() {
  window.addEventListener('scroll', () => {
    $('#navbar').classList.toggle('scrolled', window.scrollY > 30);
  });

  const input = $('#search-input');
  input.addEventListener('input', (e) => {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => performSearch(e.target.value), 400);
  });

  $$('.scroll-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const dir = btn.dataset.dir === 'left' ? -1 : 1;
      target.scrollBy({ left: dir * target.clientWidth * 0.8, behavior: 'smooth' });
    });
  });

  $('#hero-play').addEventListener('click', () => {
    if (state.heroMovie) openModal(state.heroMovie, 'movie');
  });
  $('#hero-info').addEventListener('click', () => {
    if (state.heroMovie) openModal(state.heroMovie, 'movie');
  });

  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modal-overlay').classList.contains('open')) closeModal();
  });

  $('#modal-play').addEventListener('click', playCurrent);

  $('#modal-trailer').addEventListener('click', async () => {
    if (!state.currentModal) return;
    const { item, type } = state.currentModal;
    const tmdbType = type === 'tv' || type === 'series' ? 'tv' : 'movie';
    try {
      const data = await tmdb(`/${tmdbType}/${item.id}/videos`);
      const trailer = (data.results || []).find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
      if (trailer) window.open(`https://www.youtube.com/watch?v=${trailer.key}`, '_blank');
      else alert('Aucune bande-annonce disponible.');
    } catch { alert('Impossible de charger la bande-annonce.'); }
  });
}

/* ---------- Init ---------- */
async function init() {
  bindEvents();
  await loadGenres();
  await loadHero();
  await Promise.all([
    loadTrending(),
    loadNewReleases(),
    loadPopular(),
    loadSeries(),
    loadTopRated(),
  ]);
}

document.addEventListener('DOMContentLoaded', init);