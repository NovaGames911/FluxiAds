// ── FluxiAds — Dashboard ──────────────────────────────────────────────────────
// Requires: supabase.js (sb), auth.js (requireAuth)
// Handles: game loading, game switching, stats, charts, add game modal

// ── State ─────────────────────────────────────────────────────────────────────
window.currentGame   = null;   // full game object { id, name, slug, ... }
window.currentGameId = null;   // shortcut: currentGame.id

// Game dot colour palette (cycles per index)
const GAME_COLORS = [
  '#7c3aed', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#3b82f6',
];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const gamesList       = document.getElementById('gamesList');
const topbarGameName  = document.getElementById('topbarGameName');
const statImpressions = document.getElementById('statImpressions');
const statClicks      = document.getElementById('statClicks');
const statCTR         = document.getElementById('statCTR');
const statActiveAds   = document.getElementById('statActiveAds');
const statImpSub      = document.getElementById('statImpSub');
const statClickSub    = document.getElementById('statClickSub');
const statAdTypes     = document.getElementById('statAdTypes');
const barChartEl      = document.getElementById('barChart');
const donutRewarded   = document.getElementById('donutRewarded');
const donutInter      = document.getElementById('donutInterstitial');
const donutTotal      = document.getElementById('donutTotal');
const legendRewarded  = document.getElementById('legendRewarded');
const legendInter     = document.getElementById('legendInterstitial');
const endpointUrl     = document.getElementById('endpointUrl');
const modalSaveBtn    = document.getElementById('modalSaveBtn');
const modalError      = document.getElementById('modalError');
// NOTE: modalOverlay is declared in the dashboard.html inline script — do not redeclare here.

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Animate a number counting up from 0 to target in ~700ms */
function animateCount(el, target, decimals = 0, suffix = '') {
  if (target === 0) { el.textContent = '0' + suffix; return; }
  const duration = 700;
  const start    = performance.now();
  const from     = 0;

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const value  = from + (target - from) * eased;
    el.textContent = (decimals > 0 ? value.toFixed(decimals) : Math.floor(value).toLocaleString()) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/** Format a date as Mon/Tue/Wed etc. short label */
function dayLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/** Get YYYY-MM-DD string for a date */
function dateStr(date) {
  return date.toISOString().slice(0, 10);
}

/** Show a skeleton on all stat cards */
function showStatSkeletons() {
  [statImpressions, statClicks, statCTR, statActiveAds].forEach(el => {
    el.textContent = '—';
    el.style.opacity = '0.4';
  });
  statImpSub.textContent   = 'Loading…';
  statClickSub.textContent = 'Loading…';
  statAdTypes.textContent  = '—';
}

/** Reveal stat values */
function clearStatSkeletons() {
  [statImpressions, statClicks, statCTR, statActiveAds].forEach(el => {
    el.style.opacity = '1';
  });
}

// ── Load & render games ───────────────────────────────────────────────────────
async function loadGames() {
  console.log('[FluxiAds] loadGames() called');

  const { data: games, error } = await sb
    .from('games')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[FluxiAds] loadGames error:', error);
    gamesList.innerHTML = `<div style="font-size:11px;color:var(--red);padding:8px 18px">${error.message}</div>`;
    return;
  }

  console.log('[FluxiAds] loadGames success — games:', games);

  window._allGames = games || [];
  renderGamesList(games);

  // Auto-select: restore last selected game or pick first
  const savedId = localStorage.getItem('fluxiads_game_id');
  const toSelect = (savedId && games.find(g => g.id === savedId)) || games[0];
  if (toSelect) selectGame(toSelect, games.indexOf(toSelect));
}

function renderGamesList(games) {
  if (!games || games.length === 0) {
    gamesList.innerHTML = `<div style="font-size:11px;color:var(--text-muted);padding:6px 18px">No games yet</div>`;
    return;
  }

  gamesList.innerHTML = games.map((g, i) => `
    <div
      class="game-item${window.currentGameId === g.id ? ' active' : ''}"
      data-game-id="${g.id}"
      data-game-index="${i}"
      role="button"
      tabindex="0"
      aria-label="Select game ${g.name}"
    >
      <div class="game-dot" style="background:${GAME_COLORS[i % GAME_COLORS.length]}" aria-hidden="true"></div>
      <span class="game-name">${escapeHtml(g.name)}</span>
    </div>
  `).join('');

  // Click handlers
  gamesList.querySelectorAll('.game-item').forEach(item => {
    const handler = () => {
      const id  = item.dataset.gameId;
      const idx = parseInt(item.dataset.gameIndex, 10);
      const game = games.find(g => g.id === id);
      if (game) selectGame(game, idx);
    };
    item.addEventListener('click', handler);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });
}

// ── Select a game ─────────────────────────────────────────────────────────────
function selectGame(game, index = 0) {
  window.currentGame   = game;
  window.currentGameId = game.id;
  localStorage.setItem('fluxiads_game_id', game.id);

  // Update topbar
  topbarGameName.textContent = game.name;

  // Update sidebar active state
  document.querySelectorAll('.game-item').forEach(el => {
    el.classList.toggle('active', el.dataset.gameId === game.id);
  });

  // Update endpoint URL
  const github_repo = localStorage.getItem('github_repo') || 'novagames911/FluxiAds';
  endpointUrl.textContent =
    `https://raw.githubusercontent.com/${github_repo}/main/api/${game.slug}.json`;

  // Load all data for this game
  showStatSkeletons();
  loadStats(game.id);
  loadBarChart(game.id);
  loadDonut(game.id);

  // Signal ads.js to reload table (if function exists)
  if (typeof window.loadAds === 'function') window.loadAds(game.id);
}

// ── Load stats ────────────────────────────────────────────────────────────────
async function loadStats(gameId) {
  const today = dateStr(new Date());

  console.log('[FluxiAds] loadStats() for gameId:', gameId);

  const [impRes, clickRes, adsRes] = await Promise.all([
    // Impressions today
    sb.from('events')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('type', 'impression')
      .gte('created_at', today + 'T00:00:00.000Z'),

    // Clicks today
    sb.from('events')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('type', 'click')
      .gte('created_at', today + 'T00:00:00.000Z'),

    // Active ads (with type breakdown)
    sb.from('ads')
      .select('type')
      .eq('game_id', gameId)
      .eq('is_active', true),
  ]);

  clearStatSkeletons();

  // Impressions
  const impressions = impRes.count ?? 0;
  animateCount(statImpressions, impressions);
  statImpSub.textContent = `all time: ${(impRes.count ?? 0).toLocaleString()}`;

  // Clicks
  const clicks = clickRes.count ?? 0;
  animateCount(statClicks, clicks);
  statClickSub.textContent = `all time: ${(clickRes.count ?? 0).toLocaleString()}`;

  // CTR
  const ctr = impressions > 0 ? ((clicks / impressions) * 100) : 0;
  animateCount(statCTR, ctr, 1, '%');

  // Active ads breakdown
  const ads      = adsRes.data || [];
  const rewarded = ads.filter(a => a.type === 'rewarded').length;
  const inter    = ads.filter(a => a.type === 'interstitial').length;
  const total    = ads.length;

  animateCount(statActiveAds, total);
  statAdTypes.textContent = `${rewarded} rewarded · ${inter} interstitial`;

  // Update ad count badge in table header
  const adCountEl = document.getElementById('adCount');
  if (adCountEl) adCountEl.textContent = total;
}

// ── Load bar chart (7-day impressions) ───────────────────────────────────────
async function loadBarChart(gameId) {
  // Build last 7 days array
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ date: dateStr(d), label: dayLabel(d), count: 0 });
  }

  const from = days[0].date + 'T00:00:00.000Z';

  const { data, error } = await sb
    .from('events')
    .select('created_at')
    .eq('game_id', gameId)
    .eq('type', 'impression')
    .gte('created_at', from);

  if (!error && data) {
    data.forEach(ev => {
      const d = ev.created_at.slice(0, 10);
      const day = days.find(x => x.date === d);
      if (day) day.count++;
    });
  }

  renderBarChart(days);
}

function renderBarChart(days) {
  const maxCount = Math.max(...days.map(d => d.count), 1);

  barChartEl.innerHTML = days.map((day, i) => {
    const pct = Math.max((day.count / maxCount) * 100, 3);
    return `
      <div class="bar-col">
        <div
          class="bar"
          style="height:${pct}%;animation:barGrow 0.6s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.07}s both;"
          title="${day.count.toLocaleString()} impressions on ${day.date}"
          role="img"
          aria-label="${day.label}: ${day.count} impressions"
        ></div>
        <div class="bar-label">${day.label.slice(0, 3)}</div>
      </div>
    `;
  }).join('');
}

// ── Load donut chart (rewarded vs interstitial) ───────────────────────────────
async function loadDonut(gameId) {
  const { data, error } = await sb
    .from('ads')
    .select('type')
    .eq('game_id', gameId)
    .eq('is_active', true);

  if (error || !data) return;

  const rewarded = data.filter(a => a.type === 'rewarded').length;
  const inter    = data.filter(a => a.type === 'interstitial').length;
  const total    = rewarded + inter;

  animateCount(donutTotal, total);

  const circumference = 2 * Math.PI * 40; // r=40 → ≈ 251.2

  if (total === 0) {
    donutRewarded.setAttribute('stroke-dasharray', `0 ${circumference}`);
    donutInter.setAttribute('stroke-dasharray',    `0 ${circumference}`);
    legendRewarded.textContent = 'Rewarded (0)';
    legendInter.textContent    = 'Interstitial (0)';
    return;
  }

  const rewardedArc = (rewarded / total) * circumference;
  const interArc    = (inter    / total) * circumference;

  // Rewarded starts at 0 offset; interstitial starts after rewarded arc
  donutRewarded.setAttribute('stroke-dasharray',  `${rewardedArc} ${circumference}`);
  donutRewarded.setAttribute('stroke-dashoffset', '0');

  // Offset interstitial arc to start after rewarded
  donutInter.setAttribute('stroke-dasharray',  `${interArc} ${circumference}`);
  donutInter.setAttribute('stroke-dashoffset', `${-rewardedArc}`);

  legendRewarded.textContent = `Rewarded (${rewarded})`;
  legendInter.textContent    = `Interstitial (${inter})`;
}

// ── Add Game modal — save ─────────────────────────────────────────────────────
modalSaveBtn.addEventListener('click', async () => {
  console.log('[FluxiAds] modalSaveBtn clicked');
  const name = document.getElementById('gameName').value.trim();
  const slug = document.getElementById('gameSlug').value.trim();

  modalError.classList.remove('visible');

  if (!name) { showModalError('Game name is required.'); return; }
  if (!slug)  { showModalError('Slug is required.'); return; }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    showModalError('Slug can only contain lowercase letters, numbers, and hyphens.');
    return;
  }

  modalSaveBtn.disabled = true;
  modalSaveBtn.innerHTML = '<span class="btn-spinner"></span> Saving…';

  const { data, error } = await sb
    .from('games')
    .insert({ name, slug })
    .select()
    .single();

  modalSaveBtn.disabled = false;
  modalSaveBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
    Add Game`;

  if (error) {
    console.error('[FluxiAds] modalSaveBtn insert error:', error);
    showModalError(error.message || 'Failed to save game.');
    return;
  }

  console.log('[FluxiAds] Game inserted successfully:', data);

  // Close modal, refresh games list, select new game
  closeModal();
  await loadGames();
  if (data) {
    const idx = (window._allGames || []).findIndex(g => g.id === data.id);
    selectGame(data, idx >= 0 ? idx : 0);
  }
  showToast('Game added!', 'success');
});

function showModalError(msg) {
  modalError.textContent = msg;
  modalError.classList.add('visible');
}

// ── XSS-safe escape ───────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
console.log('[FluxiAds] dashboard.js loaded');

(function init() {
  function tryLoad() {
    if (window.currentUser) {
      console.log('[FluxiAds] currentUser ready, calling loadGames()');
      loadGames();
    } else {
      setTimeout(tryLoad, 80);
    }
  }
  tryLoad();
})();
