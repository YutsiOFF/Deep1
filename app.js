const TMDB_API_KEY = 'ec801beca6ce458e2a220a27ee334746';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

const state = {
  heroMovie: null,
  currentModal: null,
  searchTimeout: null,
  genreCache: null,
  genreList: [],

  filterPage: 1,
  filterTotalPages: 1,
  filterItems: [],
  filterLoading: false,
  langLabels: { vf: 'VF', vostfr: 'VOSTFR', vo: 'VO', en: 'VO', multi: 'Multi' },
  currentLang: 'vf',
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

async function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('language', 'fr-FR');
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.set(k, v); });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

const posterURL = (p, s = 'w500') => p ? `${IMG_BASE}/${s}${p}` : '';
const backdropURL = (p, s = 'w1280') => p ? `${IMG_BASE}/${s}${p}` : '';
const yearOf = (d) => d ? new Date(d).getFullYear() : '—';
const rating = (v) => v ? v.toFixed(1) : '—';

/* ---------- Genres ---------- */
async function loadGenres() {
  if (state.genreCache) return;
  const [m, t] = await Promise.all([
    tmdb('/genre/movie/list').catch(() => ({ genres: [] })),
    tmdb('/genre/tv/list').catch(() => ({ genres: [] })),
  ]);
  const map = {};
  const list = [];
  [...(m.genres || []), ...(t.genres || [])].forEach((g) => {
    if (!map[g.id]) { map[g.id] = g.name; list.push({ id: g.id, name: g.name }); }
  });
  state.genreCache = map;
  state.genreList = list.sort((a, b) => a.name.localeCompare(b.name));
  populateGenreSelect();
}
function populateGenreSelect() {
  const sel = $('#filter-genre'); if (!sel) return;
  sel.innerHTML = '<option value="">Toutes</option>';
  state.genreList.forEach((g) => {
    const o = document.createElement('option'); o.value = g.id; o.textContent = g.name; sel.appendChild(o);
  });
}
function populateYearSelect() {
  const sel = $('#filter-year'); if (!sel) return;
  const y = new Date().getFullYear();
  sel.innerHTML = '<option value="">Toutes</option>';
  for (let i = y; i >= 1950; i--) {
    const o = document.createElement('option'); o.value = i; o.textContent = i; sel.appendChild(o);
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
    <img class="card-poster" loading="lazy" alt="${title}" src="${posterURL(item.poster_path)}"
         onerror="this.style.background='#1a1a24';this.removeAttribute('src')" />
    <div class="card-info">
      <div class="card-title">${title}</div>
      <div class="card-sub"><span>${yearOf(date)}</span><span class="card-rating">★ ${rating(item.vote_average)}</span></div>
    </div>`;
  card.addEventListener('click', () => openModal(item, type));
  return card;
}
function renderRow(id, items, type = 'movie', append = false) {
  const row = document.getElementById(id); if (!row) return;
  if (!append) row.innerHTML = '';
  if ((!items || !items.length) && !append) {
    row.innerHTML = `<p style="color:#9a9aa8;font-size:14px;padding:12px 0;">Aucun résultat.</p>`; return;
  }
  items.forEach((it) => row.appendChild(createCard(it, type)));
}

/* ---------- Hero ---------- */
async function loadHero() {
  try {
    const d = await tmdb('/trending/movie/week');
    const r = d.results || [];
    const m = r[Math.floor(Math.random() * Math.min(5, r.length))] || r[0];
    if (!m) return;
    state.heroMovie = m;
    $('#hero-backdrop').style.backgroundImage = `url('${backdropURL(m.backdrop_path)}')`;
    $('#hero-title').textContent = m.title || m.name || '';
    $('#hero-overview').textContent = m.overview || 'Aucun synopsis.';
    const g = genreNames(m.genre_ids).slice(0, 3);
    $('#hero-meta').innerHTML = `
      <span class="rating">★ ${rating(m.vote_average)}</span><span>${yearOf(m.release_date)}</span>
      ${g.length ? `<span>${g.join(' · ')}</span>` : ''}<span class="dot"></span><span>HD</span>`;
  } catch (e) { console.error(e); $('#hero-title').textContent = 'Bienvenue sur Deep1'; }
}

/* ---------- Rangées ---------- */
async function loadTrending() { try { const d = await tmdb('/trending/movie/week'); renderRow('row-tendances', (d.results || []).slice(0, 18)); } catch (e) { console.error(e); } }
async function loadNewReleases() { try { const d = await tmdb('/movie/now_playing', { region: 'FR' }); renderRow('row-nouveautes', (d.results || []).slice(0, 18)); } catch (e) { console.error(e); } }
async function loadPopular() { try { const d = await tmdb('/movie/popular'); renderRow('row-populaires', (d.results || []).slice(0, 18)); } catch (e) { console.error(e); } }
async function loadSeries() { try { const d = await tmdb('/tv/popular'); renderRow('row-series', (d.results || []).slice(0, 18), 'tv'); } catch (e) { console.error(e); } }
async function loadTopRated() { try { const d = await tmdb('/movie/top_rated'); renderRow('row-top', (d.results || []).slice(0, 18)); } catch (e) { console.error(e); } }

/* ---------- Filtres Discover ---------- */
function getFilters() {
  return { type: $('#filter-type').value, genre: $('#filter-genre').value, year: $('#filter-year').value, sort: $('#filter-sort').value };
}
async function loadDiscover(page = 1, append = false) {
  const f = getFilters();
  const params = { sort_by: f.sort, page: String(page), 'vote_count.gte': '20' };
  if (f.genre) params.with_genres = f.genre;
  if (f.year) { if (f.type === 'tv') params.first_air_date_year = f.year; else params.primary_release_year = f.year; }
  const path = f.type === 'tv' ? '/discover/tv' : '/discover/movie';
  state.filterLoading = true; $('#load-more').disabled = true; $('#load-more').textContent = 'Chargement…';
  try {
    const d = await tmdb(path, params);
    const r = (d.results || []).filter((x) => x.poster_path);
    state.filterTotalPages = d.total_pages || 1; state.filterPage = page;
    if (!append) state.filterItems = [];
    state.filterItems = state.filterItems.concat(r);
    renderRow('filter-results', r, f.type, append);
    $('#filter-results-section').style.display = 'block';
    const g = f.genre ? (state.genreCache?.[f.genre] || '') : '';
    $('#filter-results-title').textContent = `${f.type === 'tv' ? 'Séries' : 'Films'}${g ? ' · ' + g : ''}${f.year ? ' · ' + f.year : ''} — ${state.filterItems.length} titres`;
    $('#load-more').style.display = page < state.filterTotalPages ? 'inline-flex' : 'none';
    $('#filter-results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.error(e); alert('Erreur filtres.'); }
  finally { state.filterLoading = false; $('#load-more').disabled = false; $('#load-more').textContent = 'Charger plus'; }
}

/* ---------- Recherche ---------- */
async function performSearch(q) {
  q = q.trim();
  if (!q) { $('#filter-results-section').style.display = 'none'; return; }
  try {
    const d = await tmdb('/search/multi', { query: q, include_adult: 'false' });
    const r = (d.results || []).filter((x) => (x.media_type === 'movie' || x.media_type === 'tv') && x.poster_path);
    renderRow('filter-results', r.slice(0, 18), 'movie');
    $('#filter-results-section').style.display = 'block';
    $('#filter-results-title').textContent = `Recherche : « ${q} » (${r.length})`;
    $('#load-more').style.display = 'none';
    $('#filter-results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.error(e); }
}

/* ---------- Modale ---------- */
async function openModal(item, type = 'movie') {
  state.currentModal = { item, type };
  state.currentLang = 'vf';
  const title = item.title || item.name || '';
  const date = item.release_date || item.first_air_date;
  const backdrop = item.backdrop_path || item.poster_path;
  $('#modal-hero').style.backgroundImage = backdrop ? `url('${backdropURL(backdrop)}')` : 'none';
  $('#modal-title').textContent = title;
  $('#modal-overview').textContent = item.overview || 'Aucun synopsis.';
  const g = genreNames(item.genre_ids);
  $('#modal-meta').innerHTML = `
    <span style="color:#f5c518;font-weight:700;">★ ${rating(item.vote_average)}</span>
    <span>${yearOf(date)}</span>${g.length ? `<span>${g.join(' · ')}</span>` : ''}
    <span>${type === 'tv' ? 'Série' : 'Film'}</span>`;
  $('#player-container').style.display = 'none'; $('#player-frame').src = 'about:blank';
  $('#lang-bar').innerHTML = ''; $('#episode-bar').innerHTML = ''; $('#episode-bar').style.display = 'none';
  // (sélecteur de source supprimé — NuvioHub fournit le flux direct)
  $('#modal-overlay').classList.add('open'); document.body.style.overflow = 'hidden';

  // Langues / épisodes via TMDB (pas d'API check)
  if (type === 'tv') {
    try {
      const d = await tmdb(`/tv/${item.id}`);
      const seasons = d.number_of_seasons || 1;
      renderEpisodeBar(seasons);
    } catch { /* ignore */ }
  }
  renderLangBar(['vf', 'vostfr', 'vo']);
}

function renderLangBar(langs) {
  const bar = $('#lang-bar'); bar.innerHTML = '';
  state.currentLang = langs.includes('vf') ? 'vf' : langs[0];
  langs.forEach((l) => {
    const b = document.createElement('button');
    b.className = 'lang-btn' + (l === state.currentLang ? ' active' : '');
    b.textContent = state.langLabels[l] || l.toUpperCase();
    b.dataset.lang = l;
    b.addEventListener('click', () => {
      state.currentLang = l;
      $$('.lang-btn', bar).forEach((x) => x.classList.toggle('active', x.dataset.lang === l));
      if ($('#player-container').style.display !== 'none') playCurrent();
    });
    bar.appendChild(b);
  });
}

function renderEpisodeBar(seasons) {
  const bar = $('#episode-bar'); bar.style.display = 'flex'; bar.innerHTML = '';
  const ss = document.createElement('select'); ss.id = 'season-select';
  for (let i = 1; i <= seasons; i++) { const o = document.createElement('option'); o.value = i; o.textContent = `Saison ${i}`; ss.appendChild(o); }
  const es = document.createElement('select'); es.id = 'episode-select';
  const fill = async (s) => {
    es.innerHTML = '<option>…</option>';
    try {
      const d = await tmdb(`/tv/${state.currentModal.item.id}/season/${s}`);
      es.innerHTML = '';
      (d.episodes || []).forEach((e) => { const o = document.createElement('option'); o.value = e.episode_number; o.textContent = `Ép. ${e.episode_number} — ${e.name || ''}`; es.appendChild(o); });
    } catch { es.innerHTML = ''; for (let i = 1; i <= 20; i++) { const o = document.createElement('option'); o.value = i; o.textContent = `Épisode ${i}`; es.appendChild(o); } }
  };
  ss.addEventListener('change', () => fill(ss.value));
  bar.appendChild(ss); bar.appendChild(es); fill(1);
}

function closeModal() {
  $('#modal-overlay').classList.remove('open'); document.body.style.overflow = '';
  $('#player-frame').src = 'about:blank'; $('#player-container').style.display = 'none';
  state.currentModal = null;
}

function playCurrent() {
  const ctx = state.currentModal;
  if (!ctx) return;

  const isTv = ctx.type === 'tv' || ctx.detail?.detectedType === 'series';
  const season = $('#season-select')?.value || '1';
  const ep = $('#episode-select')?.value || '1';
  const lang = state.currentLang || 'vf';

  // Lecteur natif maison (player.html) basé sur NuvioHub :
  // flux m3u8 direct, zéro pub, zéro iframe tierce.
  const playerUrl = `player.html?tmdb=${ctx.item.id}&type=${isTv ? 'tv' : 'movie'}` +
    (isTv ? `&season=${season}&episode=${ep}` : '') +
    `&lang=${lang}`;

  const frame = $('#player-frame');
  frame.src = playerUrl;
  $('#player-container').style.display = 'block';
  $('#player-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- Écouteurs ---------- */
function bindEvents() {
  window.addEventListener('scroll', () => $('#navbar').classList.toggle('scrolled', window.scrollY > 30));
  $('#search-input').addEventListener('input', (e) => { clearTimeout(state.searchTimeout); state.searchTimeout = setTimeout(() => performSearch(e.target.value), 400); });
  $$('.scroll-btn').forEach((b) => b.addEventListener('click', () => {
    const t = document.getElementById(b.dataset.target); if (!t) return;
    t.scrollBy({ left: (b.dataset.dir === 'left' ? -1 : 1) * t.clientWidth * 0.8, behavior: 'smooth' });
  }));
  $('#hero-play').addEventListener('click', () => state.heroMovie && openModal(state.heroMovie, 'movie'));
  $('#hero-info').addEventListener('click', () => state.heroMovie && openModal(state.heroMovie, 'movie'));
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal-overlay').classList.contains('open')) closeModal(); });
  $('#modal-play').addEventListener('click', playCurrent);

  // (plus de sélecteur de source : NuvioHub = flux direct natif)

  $('#modal-trailer').addEventListener('click', async () => {
    if (!state.currentModal) return;
    const { item, type } = state.currentModal;
    const tt = type === 'tv' ? 'tv' : 'movie';
    try {
      const d = await tmdb(`/${tt}/${item.id}/videos`);
      const tr = (d.results || []).find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
      if (tr) window.open(`https://www.youtube.com/watch?v=${tr.key}`, '_blank'); else alert('Pas de bande-annonce.');
    } catch { alert('Erreur bande-annonce.'); }
  });

  // Filtres
  $('#apply-filters').addEventListener('click', () => { $('#search-input').value = ''; loadDiscover(1, false); });
  $('#reset-filters').addEventListener('click', () => {
    $('#filter-type').value = 'movie'; $('#filter-genre').value = ''; $('#filter-year').value = ''; $('#filter-sort').value = 'popularity.desc';
    $('#filter-results-section').style.display = 'none'; $('#search-input').value = '';
  });
  $('#filter-type').addEventListener('change', () => { if (state.genreList.length) populateGenreSelect(); });
  $('#load-more').addEventListener('click', () => { if (!state.filterLoading && state.filterPage < state.filterTotalPages) loadDiscover(state.filterPage + 1, true); });
}

/* ---------- Init ---------- */
async function init() {
  bindEvents(); populateYearSelect(); await loadGenres(); await loadHero();
  await Promise.all([loadTrending(), loadNewReleases(), loadPopular(), loadSeries(), loadTopRated()]);
}
document.addEventListener('DOMContentLoaded', init);