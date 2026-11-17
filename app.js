/* ============================================================
   Deep1 — Streaming UI
   Données films/séries : TMDB (clé de démonstration)
   Lecteur vidéo : api.moviez.ac (par ID TMDB)
   ============================================================ */

const TMDB_API_KEY = 'ec801beca6ce458e2a220a27ee334746'; // Clé démo publique — remplacez par la vôtre.
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const PLAYER_BASE = 'https://api.moviez.ac'; // Lecteur MoviezAPI

const state = {
  heroMovie: null,
  currentModal: null,
  searchTimeout: null,
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

const posterURL = (path, size = 'w500') => path ? `${IMG_BASE}/${size}${path}` : '';
const backdropURL = (path, size = 'w1280') => path ? `${IMG_BASE}/${size}${path}` : '';
const year = (date) => date ? new Date(date).getFullYear() : '—';
const rating = (v) => v ? v.toFixed(1) : '—';

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
        <span>${year(date)}</span>
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
  items.forEach((item) => row.appendChild(createCard(item, type)));
}

/* ---------- Hero ---------- */
async function loadHero() {
  try {
    const data = await tmdb('/trending/movie/week');
    const movie = data.results?.[Math.floor(Math.random() * Math.min(5, data.results.length))] || data.results?.[0];
    if (!movie) return;
    state.heroMovie = movie;
    $('#hero-backdrop').style.backgroundImage = `url('${backdropURL(movie.backdrop_path)}')`;
    $('#hero-title').textContent = movie.title || movie.name || '';
    $('#hero-overview').textContent = movie.overview || 'Aucun synopsis disponible.';
    const genres = (movie.genre_ids || []).slice(0, 3).map((id) => genreName(id)).filter(Boolean);
    $('#hero-meta').innerHTML = `
      <span class="rating">★ ${rating(movie.vote_average)}</span>
      <span>${year(movie.release_date)}</span>
      ${genres.length ? `<span>${genres.join(' · ')}</span>` : ''}
      <span class="dot"></span>
      <span>HD</span>`;
  } catch (e) {
    console.error('Hero:', e);
    $('#hero-title').textContent = 'Bienvenue sur Deep1';
    $('#hero-overview').textContent = 'Impossible de charger les tendances pour le moment.';
  }
}

/* ---------- Genres ---------- */
let genreCache = null;
async function genreName(id) {
  if (!genreCache) {
    try {
      const data = await tmdb('/genre/movie/list');
      genreCache = Object.fromEntries((data.genres || []).map((g) => [g.id, g.name]));
    } catch { genreCache = {}; }
  }
  return genreCache[id] || '';
}

/* ---------- Rangées ---------- */
async function loadTrending() {
  try {
    const data = await tmdb('/trending/movie/week');
    renderRow('row-tendances', (data.results || []).slice(0, 18));
  } catch (e) { console.error('Tendances:', e); }
}

async function loadNewReleases() {
  try {
    const data = await tmdb('/movie/now_playing', { region: 'FR' });
    renderRow('row-nouveautes', (data.results || []).slice(0, 18));
  } catch (e) { console.error('Nouveautés:', e); }
}

async function loadPopular() {
  try {
    const data = await tmdb('/movie/popular');
    renderRow('row-populaires', (data.results || []).slice(0, 18));
  } catch (e) { console.error('Populaires:', e); }
}

async function loadSeries() {
  try {
    const data = await tmdb('/tv/popular');
    renderRow('row-series', (data.results || []).slice(0, 18), 'tv');
  } catch (e) { console.error('Séries:', e); }
}

async function loadTopRated() {
  try {
    const data = await tmdb('/movie/top_rated');
    renderRow('row-top', (data.results || []).slice(0, 18));
  } catch (e) { console.error('Top:', e); }
}

/* ---------- Recherche ---------- */
async function performSearch(query) {
  const q = query.trim();
  if (!q) { loadTrending(); return; }
  try {
    const data = await tmdb('/search/multi', { query: q, include_adult: 'false' });
    const results = (data.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
    renderRow('row-tendances', results.slice(0, 18));
    $('#tendances .row-header h2').textContent = `Résultats pour « ${q} »`;
    $('#tendances').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.error('Recherche:', e); }
}

/* ---------- Modale ---------- */
async function openModal(item, type = 'movie') {
  state.currentModal = { item, type };
  const title = item.title || item.name || '';
  const date = item.release_date || item.first_air_date;
  const backdrop = item.backdrop_path || item.poster_path;

  $('#modal-hero').style.backgroundImage = backdrop ? `url('${backdropURL(backdrop)}')` : 'none';
  $('#modal-title').textContent = title;
  $('#modal-overview').textContent = item.overview || 'Aucun synopsis disponible.';

  const genres = (item.genre_ids || []).map((id) => genreName(id)).filter(Boolean);
  $('#modal-meta').innerHTML = `
    <span class="rating" style="color:#f5c518;font-weight:700;">★ ${rating(item.vote_average)}</span>
    <span>${year(date)}</span>
    ${genres.length ? `<span>${genres.join(' · ')}</span>` : ''}
    <span>${type === 'tv' ? 'Série' : 'Film'}</span>`;

  // Reset lecteur
  $('#player-container').style.display = 'none';
  $('#player-frame').src = 'about:blank';

  $('#modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('#modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  $('#player-frame').src = 'about:blank';
  $('#player-container').style.display = 'none';
}

/* ---------- Lecture via MoviezAPI ---------- */
async function playCurrent() {
  if (!state.currentModal) return;
  const { item, type } = state.currentModal;
  const tmdbId = item.id;
  // MoviezAPI utilise l'ID TMDB directement.
  const playerURL = type === 'tv' ? `${PLAYER_BASE}/serie/${tmdbId}/1/1` : `${PLAYER_BASE}/${tmdbId}`;

  // Vérification de disponibilité (optionnelle, informative)
  try {
    const check = await fetch(`${PLAYER_BASE}/api/check/${tmdbId}`);
    if (check.ok) {
      const info = await check.json();
      console.log('Moviez check:', info);
      // On pourrait filtrer les langues ici, mais on laisse le lecteur gérer.
    }
  } catch (e) { /* silencieux */ }

  const container = $('#player-container');
  const frame = $('#player-frame');
  frame.src = playerURL;
  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- Écouteurs ---------- */
function bindEvents() {
  // Navbar scroll
  window.addEventListener('scroll', () => {
    $('#navbar').classList.toggle('scrolled', window.scrollY > 30);
  });

  // Recherche
  const input = $('#search-input');
  input.addEventListener('input', (e) => {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => performSearch(e.target.value), 400);
  });

  // Boutons de défilement
  $$('.scroll-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const dir = btn.dataset.dir === 'left' ? -1 : 1;
      target.scrollBy({ left: dir * target.clientWidth * 0.8, behavior: 'smooth' });
    });
  });

  // Hero
  $('#hero-play').addEventListener('click', () => {
    if (state.heroMovie) openModal(state.heroMovie, 'movie');
  });
  $('#hero-info').addEventListener('click', () => {
    if (state.heroMovie) openModal(state.heroMovie, 'movie');
  });

  // Modale
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  $('#modal-play').addEventListener('click', playCurrent);

  $('#modal-trailer').addEventListener('click', async () => {
    if (!state.currentModal) return;
    const { item, type } = state.currentModal;
    try {
      const data = await tmdb(`/${type}/${item.id}/videos`);
      const trailer = (data.results || []).find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
      if (trailer) {
        window.open(`https://www.youtube.com/watch?v=${trailer.key}`, '_blank');
      } else {
        alert('Aucune bande-annonce disponible.');
      }
    } catch { alert('Impossible de charger la bande-annonce.'); }
  });
}

/* ---------- Init ---------- */
async function init() {
  bindEvents();
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