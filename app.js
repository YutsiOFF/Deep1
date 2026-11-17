/* ============================================================
   Deep1 — Streaming UI
   Données : TMDB Discover (filtres genre/année/tri)
   Lecteurs : MoviezAPI + CineSrc (ad-minimal)
   ============================================================ */

const TMDB_API_KEY = 'ec801beca6ce458e2a220a27ee334746';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const MOVIEZ_BASE = 'https://api.moviez.ac';
const CINESRC_BASE = 'https://cinesrc.st/embed';

const state = {
  heroMovie: null,
  currentModal: null,
  searchTimeout: null,
  genreCache: null,
  genreList: [],
  currentSource: 'moviez',
  filterPage: 1,
  filterTotalPages: 1,
  filterItems: [],
  filterLoading: false,
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
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v != null) url.searchParams.set(k, v);
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} sur ${path}`);
  return res.json();
}

async function moviezCheck(tmdbId) {
  try {
    const res = await fetch(`${MOVIEZ_BASE}/api/check/${tmdbId}`);
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
  if (state.genreCache) return;
  const [movies, tv] = await Promise.all([
    tmdb('/genre/movie/list').catch(() => ({ genres: [] })),
    tmdb('/genre/tv/list').catch(() => ({ genres: [] })),
  ]);
  const map = {};
  const list = [];
  [...(movies.genres || []), ...(tv.genres || [])].forEach((g) => {
    if (!map[g.id]) { map[g.id] = g.name; list.push({ id: g.id, name: g.name }); }
  });
  state.genreCache = map;
  state.genreList = list.sort((a, b) => a.name.localeCompare(b.name));
  populateGenreSelect();
}

function populateGenreSelect() {
  const sel = $('#filter-genre');
  if (!sel) return;
  sel.innerHTML = '<option value="">Toutes</option>';
  state.genreList.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    sel.appendChild(opt);
  });
}

function populateYearSelect() {
  const sel = $('#filter-year');
  if (!sel) return;
  const current = new Date().getFullYear();
  sel.innerHTML = '<option value="">Toutes</option>';
  for (let y = current; y >= 1950; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  }
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

function renderRow(containerId, items, type = 'movie', append = false) {
  const row = document.getElementById(containerId);
  if (!row) return;
  if (!append) row.innerHTML = '';
  if ((!items || !items.length) && !append) {
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

/* ---------- Rangées d'accueil ---------- */
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

/* ---------- Filtres Discover ---------- */
function getFilters() {
  return {
    type: $('#filter-type').value,
    genre: $('#filter-genre').value,
    year: $('#filter-year').value,
    sort: $('#filter-sort').value,
  };
}

async function loadDiscover(page = 1, append = false) {
  const f = getFilters();
  const params = {
    sort_by: f.sort,
    page: String(page),
    'vote_count.gte': '20',
  };
  if (f.genre) params.with_genres = f.genre;
  if (f.year) {
    if (f.type === 'tv') params.first_air_date_year = f.year;
    else params.primary_release_year = f.year;
  }

  const path = f.type === 'tv' ? '/discover/tv' : '/discover/movie';
  state.filterLoading = true;
  $('#load-more').disabled = true;
  $('#load-more').textContent = 'Chargement…';

  try {
    const data = await tmdb(path, params);
    const results = (data.results || []).filter((r) => r.poster_path);
    state.filterTotalPages = data.total_pages || 1;
    state.filterPage = page;
    if (!append) state.filterItems = [];
    state.filterItems = state.filterItems.concat(results);
    renderRow('filter-results', results, f.type, append);
    $('#filter-results-section').style.display = 'block';
    const label = f.type === 'tv' ? 'Séries' : 'Films';
    const genreName = f.genre ? (state.genreCache?.[f.genre] || '') : '';
    $('#filter-results-title').textContent =
      `${label}${genreName ? ' · ' + genreName : ''}${f.year ? ' · ' + f.year : ''} — ${state.filterItems.length} titres`;
    $('#load-more').style.display = page < state.filterTotalPages ? 'inline-flex' : 'none';
    $('#filter-results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    console.error('Discover:', e);
    alert('Erreur lors du chargement des filtres.');
  } finally {
    state.filterLoading = false;
    $('#load-more').disabled = false;
    $('#load-more').textContent = 'Charger plus';
  }
}

/* ---------- Recherche ---------- */
async function performSearch(query) {
  const q = query.trim();
  if (!q) {
    $('#filter-results-section').style.display = 'none';
    return;
  }
  try {
    const data = await tmdb('/search/multi', { query: q, include_adult: 'false' });
    const results = (data.results || []).filter(
      (r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path
    );
    renderRow('filter-results', results.slice(0, 18), 'movie');
    $('#filter-results-section').style.display = 'block';
    $('#filter-results-title').textContent = `Recherche : « ${q} » (${results.length})`;
    $('#load-more').style.display = 'none';
    $('#filter-results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.error('Recherche:', e); }
}

/* ---------- Modale ---------- */
async function openModal(item, type = 'movie') {
  state.currentModal = { item, type, detail: null };
  state.currentLang = 'vf';
  state.currentSource = 'moviez';

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

  // Reset lecteur + zones
  $('#player-container').style.display = 'none';
  $('#player-frame').src = 'about:blank';
  $('#lang-bar').innerHTML = '';
  $('#episode-bar').innerHTML = '';
  $('#episode-bar').style.display = 'none';
  $$('.source-btn').forEach((b) => b.classList.toggle('active', b.dataset.source === 'moviez'));

  $('#modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Vérification Moviez (dispo, type, langues)
  const check = await moviezCheck(item.id);
  if (check && check.available) {
    state.currentModal.detail = check;
    $('#modal-availability').textContent = '· disponible sur MoviezAPI';
    $('#modal-availability').style.color = '#4ade80';
    renderLangBar(check.languages || []);
    if (check.detectedType === 'series' && check.seasons) {
      state.currentModal.type = 'series';
      renderEpisodeBar(check.seasons);
    }
  } else {
    $('#modal-availability').textContent = '· vérification MoviezAPI échouée (CineSrc reste dispo)';
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
function buildEmbed(source) {
  const ctx = state.currentModal;
  if (!ctx) return null;
  const { item } = ctx;
  const type = ctx.detail?.detectedType === 'series' ? 'series' : (ctx.type === 'tv' ? 'series' : 'movie');

  if (source === 'cinesrc') {
    if (type === 'series') {
      const season = $('#season-select')?.value || 1;
      const ep = $('#episode-select')?.value || 1;
      return `${CINESRC_BASE}/tv/${item.id}?s=${season}&e=${ep}`;
    }
    return `${CINESRC_BASE}/movie/${item.id}`;
  }

  // MoviezAPI
  if (!ctx.detail || !ctx.detail.embed) return null;
  let embed = ctx.detail.embed;
  if (type === 'series') {
    const season = $('#season-select')?.value || 1;
    const ep = $('#episode-select')?.value || 1;
    embed = `${MOVIEZ_BASE}/serie/${item.id}/${season}/${ep}`;
  }
  if (state.currentLang) {
    const sep = embed.includes('?') ? '&' : '?';
    embed = `${embed}${sep}lang=${state.currentLang}`;
  }
  return embed;
}

function playCurrent() {
  const ctx = state.currentModal;
  if (!ctx) return;

  const type = ctx.detail?.detectedType === 'series' ? 'tv' : (ctx.type === 'tv' ? 'tv' : 'movie');
  const season = $('#season-select')?.value || '1';
  const episode = $('#episode-select')?.value || '1';
  const lang = state.currentLang || 'vf';

  // Notre lecteur maison (player.html) — sans pub, HLS.js + proxy backend
  const playerUrl = `player.html?tmdb=${ctx.item.id}&type=${type}&season=${season}&episode=${episode}&lang=${lang}`;

  const container = $('#player-container');
  const frame = $('#player-frame');
  frame.src = playerUrl;
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

  // Filtres
  $('#apply-filters').addEventListener('click', () => {
    $('#search-input').value = '';
    loadDiscover(1, false);
  });
  $('#reset-filters').addEventListener('click', () => {
    $('#filter-type').value = 'movie';
    $('#filter-genre').value = '';
    $('#filter-year').value = '';
    $('#filter-sort').value = 'popularity.desc';
    $('#filter-results-section').style.display = 'none';
    $('#search-input').value = '';
  });
  $('#filter-type').addEventListener('change', () => {
    // Les IDs de genres diffèrent entre films et séries ; on recharge la liste.
    if (state.genreList.length) populateGenreSelect();
  });
  $('#load-more').addEventListener('click', () => {
    if (!state.filterLoading && state.filterPage < state.filterTotalPages) {
      loadDiscover(state.filterPage + 1, true);
    }
  });

  // Modale
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modal-overlay').classList.contains('open')) closeModal();
  });

  $('#modal-play').addEventListener('click', playCurrent);

  // Sélecteur de source
  $$('.source-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.currentSource = btn.dataset.source;
      $$('.source-btn').forEach((b) => b.classList.toggle('active', b === btn));
      // Si le lecteur est déjà ouvert, on recharge avec la nouvelle source
      if ($('#player-container').style.display !== 'none') playCurrent();
    });
  });

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
  populateYearSelect();
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