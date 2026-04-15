// ── FluxiAds — Ads ────────────────────────────────────────────────────────────
// Requires: supabase.js (sb), dashboard.js (currentGameId), auth.js
// Handles: ad packs table render, toggle active, delete, create, edit

// ── State ─────────────────────────────────────────────────────────────────────
let _ads      = [];       // current game's ads array
let _editAdId = null;     // id of ad being edited (null = new ad)

// ── DOM refs ──────────────────────────────────────────────────────────────────
const adsTableBody = document.getElementById('adsTableBody');
const adCountEl    = document.getElementById('adCount');
const panelSaveBtn = document.getElementById('panelSaveBtn');
const ctxEdit      = document.getElementById('ctxEdit');
const ctxDelete    = document.getElementById('ctxDelete');

// ── Load ads for a game ───────────────────────────────────────────────────────
window.loadAds = async function (gameId) {
  if (!gameId) return;

  // Show skeleton rows
  adsTableBody.innerHTML = skeletonRows(4);

  const { data, error } = await sb
    .from('ads')
    .select('*')
    .eq('game_id', gameId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    adsTableBody.innerHTML = `
      <tr><td colspan="7">
        <div class="table-empty">
          <div class="table-empty-icon">⚠️</div>
          ${escapeHtml(error.message)}
        </div>
      </td></tr>`;
    return;
  }

  _ads = data || [];
  renderAdsTable(_ads);
};

// ── Render table ──────────────────────────────────────────────────────────────
function renderAdsTable(ads) {
  if (adCountEl) adCountEl.textContent = ads.length;

  if (ads.length === 0) {
    adsTableBody.innerHTML = `
      <tr><td colspan="7">
        <div class="table-empty">
          <div class="table-empty-icon">📦</div>
          <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:4px">No ads yet</div>
          <div style="font-size:12px;color:var(--text-muted)">Click "+ New Ad" to create your first ad pack</div>
        </div>
      </td></tr>`;
    return;
  }

  adsTableBody.innerHTML = ads.map(ad => `
    <tr data-ad-id="${ad.id}">

      <!-- Type thumbnail -->
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="
            width:36px;height:36px;border-radius:8px;flex-shrink:0;
            background:${ad.type === 'rewarded' ? 'rgba(124,58,237,0.15)' : 'rgba(6,182,212,0.12)'};
            display:flex;align-items:center;justify-content:center;font-size:16px;
          " aria-hidden="true">${ad.type === 'rewarded' ? '🎬' : '🖼️'}</div>
          <div style="min-width:0">
            <div style="font-size:13px;font-weight:500;color:var(--text-primary);
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px"
              title="${escapeHtml(ad.name)}">${escapeHtml(ad.name)}</div>
            <div style="font-family:monospace;font-size:10px;color:var(--accent-light);
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px"
              title="${escapeHtml(ad.click_url)}">${escapeHtml(ad.click_url)}</div>
          </div>
        </div>
      </td>

      <!-- Type badge -->
      <td>
        <span class="badge badge-${ad.type}">${ad.type}</span>
      </td>

      <!-- Priority -->
      <td>
        <span style="font-size:13px;font-weight:500;color:var(--text-secondary)">${ad.priority}</span>
      </td>

      <!-- Active toggle -->
      <td>
        <label class="toggle" aria-label="${ad.is_active ? 'Deactivate' : 'Activate'} ${escapeHtml(ad.name)}">
          <input
            type="checkbox"
            ${ad.is_active ? 'checked' : ''}
            onchange="toggleAd('${ad.id}', this.checked)"
          />
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </td>

      <!-- Impressions -->
      <td>
        <span style="font-size:13px;color:var(--text-secondary)">${(ad.impressions || 0).toLocaleString()}</span>
      </td>

      <!-- Clicks -->
      <td>
        <span style="font-size:13px;color:var(--text-secondary)">${(ad.clicks || 0).toLocaleString()}</span>
      </td>

      <!-- Context menu trigger -->
      <td>
        <button
          class="menu-btn"
          onclick="openCtxMenu(event, '${ad.id}')"
          aria-label="More options for ${escapeHtml(ad.name)}"
          aria-haspopup="menu"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5"  r="1.5"/>
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      </td>

    </tr>
  `).join('');
}

// ── Toggle ad active state ────────────────────────────────────────────────────
window.toggleAd = async function (adId, isActive) {
  const { error } = await sb
    .from('ads')
    .update({ is_active: isActive })
    .eq('id', adId);

  if (error) {
    showToast('Failed to update ad: ' + error.message, 'error');
    // Revert UI
    const row = adsTableBody.querySelector(`tr[data-ad-id="${adId}"]`);
    if (row) {
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = !isActive;
    }
    return;
  }

  // Update local state
  const ad = _ads.find(a => a.id === adId);
  if (ad) ad.is_active = isActive;

  showToast(isActive ? 'Ad activated' : 'Ad deactivated', 'success');

  // Regenerate JSON
  if (typeof regenerateJSON === 'function' && window.currentGameId) {
    regenerateJSON(window.currentGameId);
  }

  // Refresh stats
  if (typeof loadStats === 'function' && window.currentGameId) {
    loadStats(window.currentGameId);
  }
  if (typeof loadDonut === 'function' && window.currentGameId) {
    loadDonut(window.currentGameId);
  }
};

// ── Context menu — Edit ───────────────────────────────────────────────────────
ctxEdit.addEventListener('click', () => {
  const adId = window.ctxAdId;
  closeCtxMenu();
  if (!adId) return;
  const ad = _ads.find(a => a.id === adId);
  if (ad) openEditPanel(ad);
});

// ── Context menu — Delete ─────────────────────────────────────────────────────
ctxDelete.addEventListener('click', async () => {
  const adId = window.ctxAdId;
  closeCtxMenu();
  if (!adId) return;

  const ad = _ads.find(a => a.id === adId);
  if (!ad) return;

  // Inline confirmation using the toast area (no alert())
  if (!confirm(`Delete "${ad.name}"? This cannot be undone.`)) return;

  const { error } = await sb
    .from('ads')
    .delete()
    .eq('id', adId);

  if (error) {
    showToast('Delete failed: ' + error.message, 'error');
    return;
  }

  _ads = _ads.filter(a => a.id !== adId);
  renderAdsTable(_ads);
  showToast('Ad deleted', 'success');

  if (typeof regenerateJSON === 'function' && window.currentGameId) {
    regenerateJSON(window.currentGameId);
  }
  if (typeof loadStats === 'function' && window.currentGameId) {
    loadStats(window.currentGameId);
  }
});

// ── Open edit panel ───────────────────────────────────────────────────────────
function openEditPanel(ad) {
  _editAdId = ad.id;

  openPanel('Edit Ad');

  document.getElementById('adName').value     = ad.name;
  document.getElementById('adVideoUrl').value = ad.video_url  || '';
  document.getElementById('adImageUrl').value = ad.image_url  || '';
  document.getElementById('adClickUrl').value = ad.click_url  || '';
  document.getElementById('adPriority').value = ad.priority   || 1;
  document.getElementById('adMixAds').checked = ad.mix_ads    ?? true;

  setAdType(ad.type || 'rewarded');
}

// ── Reset panel to "new ad" state ─────────────────────────────────────────────
function resetPanel() {
  _editAdId = null;
  document.getElementById('adName').value     = '';
  document.getElementById('adVideoUrl').value = '';
  document.getElementById('adImageUrl').value = '';
  document.getElementById('adClickUrl').value = '';
  document.getElementById('adPriority').value = '1';
  document.getElementById('adMixAds').checked = true;
  setAdType('rewarded');
  clearPanelError();
}

// Reset panel when "New Ad" button is clicked (override dashboard.html handler)
document.getElementById('newAdBtn').addEventListener('click', () => {
  resetPanel();
  openPanel('New Ad');
}, { capture: true });

// Also reset on close
document.getElementById('panelClose').addEventListener('click', resetPanel);
document.getElementById('panelCancelBtn').addEventListener('click', resetPanel);

// ── Save ad (create or update) ────────────────────────────────────────────────
panelSaveBtn.addEventListener('click', async () => {
  clearPanelError();

  const name      = document.getElementById('adName').value.trim();
  const type      = document.getElementById('adType').value;
  const video_url = document.getElementById('adVideoUrl').value.trim() || null;
  const image_url = document.getElementById('adImageUrl').value.trim() || null;
  const click_url = document.getElementById('adClickUrl').value.trim();
  const priority  = parseInt(document.getElementById('adPriority').value, 10) || 1;
  const mix_ads   = document.getElementById('adMixAds').checked;

  // Validate
  if (!name)      { showPanelError('Ad name is required.'); return; }
  if (!click_url) { showPanelError('Click URL is required.'); return; }
  if (!isValidUrl(click_url)) { showPanelError('Click URL must be a valid URL.'); return; }
  if (!window.currentGameId)  { showPanelError('No game selected.'); return; }
  if (priority < 1 || priority > 10) { showPanelError('Priority must be between 1 and 10.'); return; }

  panelSaveBtn.disabled = true;
  panelSaveBtn.innerHTML = '<span class="btn-spinner"></span> Saving…';

  const payload = {
    name, type, video_url, image_url, click_url,
    priority, mix_ads,
    game_id: window.currentGameId,
  };

  let error;

  if (_editAdId) {
    // Update existing
    ({ error } = await sb
      .from('ads')
      .update(payload)
      .eq('id', _editAdId));
  } else {
    // Insert new
    ({ error } = await sb
      .from('ads')
      .insert(payload));
  }

  panelSaveBtn.disabled = false;
  panelSaveBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    Save Ad`;

  if (error) {
    showPanelError(error.message || 'Failed to save ad.');
    return;
  }

  closePanel();
  resetPanel();
  showToast(_editAdId ? 'Ad updated' : 'Ad created', 'success');

  // Reload table and stats
  await window.loadAds(window.currentGameId);

  if (typeof regenerateJSON === 'function') {
    regenerateJSON(window.currentGameId);
  }
  if (typeof loadStats === 'function') {
    loadStats(window.currentGameId);
  }
  if (typeof loadDonut === 'function') {
    loadDonut(window.currentGameId);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function skeletonRows(n) {
  return Array.from({ length: n }, () => `
    <tr>
      ${Array.from({ length: 7 }, () =>
        `<td><div class="skeleton" style="height:16px;border-radius:4px">&nbsp;</div></td>`
      ).join('')}
    </tr>
  `).join('');
}
