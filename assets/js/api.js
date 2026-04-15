// ── FluxiAds — API / JSON Generation ─────────────────────────────────────────
// Requires: supabase.js (sb)
// Handles: build ad JSON payload, push to GitHub Pages via GitHub Contents API

// ── Push JSON to GitHub ───────────────────────────────────────────────────────
// Exact implementation per CLAUDE.md spec.
async function pushJsonToGitHub(slug, jsonContent) {
  const token = localStorage.getItem('github_token');
  const repo  = localStorage.getItem('github_repo');

  if (!token) throw new Error('GitHub token not set. Configure it in Settings.');
  if (!repo)  throw new Error('GitHub repo not set. Configure it in Settings.');

  const path    = `api/${slug}.json`;
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(jsonContent, null, 2))));

  // Get current file SHA (required for updates, undefined for new files)
  const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: { Authorization: `token ${token}` },
  });

  const sha = getRes.ok ? (await getRes.json()).sha : undefined;

  const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `update ads: ${slug}`,
      content,
      ...(sha && { sha }),
    }),
  });

  if (!putRes.ok) {
    const body = await putRes.json().catch(() => ({}));
    throw new Error(body.message || `GitHub API error ${putRes.status}`);
  }

  return await putRes.json();
}

// ── Build JSON payload from active ads ───────────────────────────────────────
function buildAdJson(ads) {
  const active = ads.filter(ad => ad.is_active);

  const rewarded     = active.filter(ad => ad.type === 'rewarded');
  const interstitial = active.filter(ad => ad.type === 'interstitial');

  // Determine mixAds per type (true if any ad in that type has mix_ads = true)
  const rewardedMix = rewarded.some(ad => ad.mix_ads);
  const interMix    = interstitial.some(ad => ad.mix_ads);

  return {
    RewardedAds: {
      mixAds: rewardedMix,
      mediaPacks: rewarded.map(ad => ({
        id:       ad.id,
        videoURL: ad.video_url  || '',
        imageURL: ad.image_url  || '',
        webURL:   ad.click_url,
        priority: ad.priority,
      })),
    },
    InterstitialAds: {
      mixAds: interMix,
      mediaPacks: interstitial.map(ad => ({
        id:       ad.id,
        imageURL: ad.image_url || '',
        webURL:   ad.click_url,
        priority: ad.priority,
      })),
    },
  };
}

// ── Regenerate JSON (fetch → build → push) ────────────────────────────────────
// Called automatically after every ad create / update / toggle / delete.
// Also exposed globally so other modules can trigger it.
window.regenerateJSON = async function (gameId) {
  if (!gameId) return;

  // Find game slug
  const game = (window._allGames || []).find(g => g.id === gameId)
    || window.currentGame;

  if (!game) return;

  // Fetch all active ads for this game
  const { data: ads, error } = await sb
    .from('ads')
    .select('*')
    .eq('game_id', gameId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('[FluxiAds] regenerateJSON fetch error:', error.message);
    return;
  }

  const json = buildAdJson(ads || []);

  try {
    await pushJsonToGitHub(game.slug, json);
    console.info(`[FluxiAds] JSON pushed → api/${game.slug}.json`);
  } catch (err) {
    // Silent fail for background regeneration — only surface errors on manual export
    console.warn('[FluxiAds] JSON push skipped:', err.message);
  }
};

// ── Manual export (Export JSON button) ───────────────────────────────────────
// Replaces the placeholder listener added in dashboard.html
const exportBtn = document.getElementById('exportJsonBtn');

if (exportBtn) {
  // Remove the placeholder listener from dashboard.html (capture phase)
  exportBtn.replaceWith(exportBtn.cloneNode(true));

  document.getElementById('exportJsonBtn').addEventListener('click', async () => {
    const gameId = window.currentGameId;
    const game   = window.currentGame;

    if (!gameId || !game) {
      showToast('Select a game first.', 'error');
      return;
    }

    const btn = document.getElementById('exportJsonBtn');
    btn.disabled = true;
    btn.innerHTML = `
      <span style="display:inline-block;width:12px;height:12px;border:2px solid
        rgba(167,139,250,0.3);border-top-color:var(--accent-light);border-radius:50%;
        animation:spin 0.6s linear infinite" aria-hidden="true"></span>
      Exporting…`;

    try {
      const { data: ads, error } = await sb
        .from('ads')
        .select('*')
        .eq('game_id', gameId)
        .eq('is_active', true)
        .order('priority', { ascending: true });

      if (error) throw new Error(error.message);

      const json = buildAdJson(ads || []);
      await pushJsonToGitHub(game.slug, json);

      showToast(`JSON pushed → api/${game.slug}.json`, 'success');

    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export JSON`;
    }
  });
}

// ── Preview JSON in console (dev helper) ─────────────────────────────────────
window.previewJSON = async function () {
  const gameId = window.currentGameId;
  if (!gameId) { console.warn('No game selected.'); return; }

  const { data: ads } = await sb
    .from('ads')
    .select('*')
    .eq('game_id', gameId)
    .eq('is_active', true);

  console.log(JSON.stringify(buildAdJson(ads || []), null, 2));
};
