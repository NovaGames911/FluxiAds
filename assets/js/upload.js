// ── FluxiAds — Upload ─────────────────────────────────────────────────────────
// Requires: supabase.js (sb)
// Handles: file uploads to Supabase Storage (bucket: ad-creatives)
// Injects upload buttons next to the video/image URL inputs in the New Ad panel.

const BUCKET = 'ad-creatives';

// ── Core upload function ──────────────────────────────────────────────────────
/**
 * Upload a File object to Supabase Storage.
 * @param {File}   file       - The file to upload
 * @param {string} storagePath - Path inside the bucket, e.g. "game-id/timestamp-filename"
 * @returns {Promise<string>}  - Public URL of the uploaded file
 */
window.uploadFile = async function (file, storagePath) {
  const { data, error } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });

  if (error) throw new Error(error.message);

  const { data: urlData } = sb.storage
    .from(BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
};

// ── Build a storage path ──────────────────────────────────────────────────────
function buildPath(file) {
  const gameId    = window.currentGameId || 'ungrouped';
  const timestamp = Date.now();
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${gameId}/${timestamp}-${safeName}`;
}

// ── Inject upload UI into the New Ad panel ────────────────────────────────────
// Runs once after DOM is ready. Adds an "Upload file" button beneath each URL
// input, with a hidden <input type="file">. On selection the file is uploaded
// and the public URL is written into the corresponding text input.

function injectUploadButtons() {
  injectUploader({
    fieldId:   'adVideoUrl',
    label:     'or upload video',
    accept:    'video/*',
    maxMB:     200,
    mimeCheck: t => t.startsWith('video/'),
    mimeError: 'Please select a video file.',
  });

  injectUploader({
    fieldId:   'adImageUrl',
    label:     'or upload image',
    accept:    'image/*',
    maxMB:     10,
    mimeCheck: t => t.startsWith('image/'),
    mimeError: 'Please select an image file.',
  });
}

function injectUploader({ fieldId, label, accept, maxMB, mimeCheck, mimeError }) {
  const urlInput = document.getElementById(fieldId);
  if (!urlInput) return;

  // Wrap input + button together
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:8px';

  // Move input into wrapper
  urlInput.parentNode.insertBefore(wrapper, urlInput);
  wrapper.appendChild(urlInput);

  // Hidden file input
  const fileInput = document.createElement('input');
  fileInput.type   = 'file';
  fileInput.accept = accept;
  fileInput.style.display = 'none';
  fileInput.setAttribute('aria-label', label);
  wrapper.appendChild(fileInput);

  // Visible upload row
  const uploadRow = document.createElement('div');
  uploadRow.style.cssText = 'display:flex;align-items:center;gap:10px';

  const uploadBtn = document.createElement('button');
  uploadBtn.type      = 'button';
  uploadBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
    ${label}`;
  uploadBtn.style.cssText = `
    display:inline-flex;align-items:center;gap:6px;
    background:transparent;border:1px dashed rgba(124,58,237,0.3);
    color:var(--text-muted);font-family:'Space Grotesk',sans-serif;
    font-size:11px;font-weight:500;letter-spacing:0.04em;
    border-radius:8px;padding:6px 12px;cursor:pointer;
    transition:color 0.15s,border-color 0.15s,background 0.15s;`;

  uploadBtn.addEventListener('mouseenter', () => {
    uploadBtn.style.color       = 'var(--accent-light)';
    uploadBtn.style.borderColor = 'rgba(124,58,237,0.5)';
    uploadBtn.style.background  = 'rgba(124,58,237,0.06)';
  });
  uploadBtn.addEventListener('mouseleave', () => {
    uploadBtn.style.color       = 'var(--text-muted)';
    uploadBtn.style.borderColor = 'rgba(124,58,237,0.3)';
    uploadBtn.style.background  = 'transparent';
  });

  // Status label
  const statusEl = document.createElement('span');
  statusEl.style.cssText = 'font-size:11px;color:var(--text-muted);';

  uploadRow.appendChild(uploadBtn);
  uploadRow.appendChild(statusEl);
  wrapper.appendChild(uploadRow);

  // Click handler → trigger file picker
  uploadBtn.addEventListener('click', () => {
    if (!window.currentGameId) {
      showUploadStatus(statusEl, 'Select a game first.', 'error');
      return;
    }
    fileInput.value = '';
    fileInput.click();
  });

  // File selected → validate → upload
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    // MIME check
    if (!mimeCheck(file.type)) {
      showUploadStatus(statusEl, mimeError, 'error');
      return;
    }

    // Size check
    if (file.size > maxMB * 1024 * 1024) {
      showUploadStatus(statusEl, `File too large (max ${maxMB} MB).`, 'error');
      return;
    }

    // Upload
    setUploadLoading(uploadBtn, statusEl, true);

    try {
      const path      = buildPath(file);
      const publicUrl = await window.uploadFile(file, path);

      urlInput.value = publicUrl;
      setUploadLoading(uploadBtn, statusEl, false);
      showUploadStatus(statusEl, `✓ Uploaded (${formatBytes(file.size)})`, 'success');

      // Clear success message after 4s
      setTimeout(() => {
        if (statusEl.dataset.state === 'success') statusEl.textContent = '';
      }, 4000);

    } catch (err) {
      setUploadLoading(uploadBtn, statusEl, false);
      showUploadStatus(statusEl, err.message || 'Upload failed.', 'error');
    }
  });

  // Drag-and-drop support on the URL input
  urlInput.addEventListener('dragover', e => {
    e.preventDefault();
    urlInput.style.borderColor = 'var(--accent)';
  });

  urlInput.addEventListener('dragleave', () => {
    urlInput.style.borderColor = '';
  });

  urlInput.addEventListener('drop', e => {
    e.preventDefault();
    urlInput.style.borderColor = '';
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    // Simulate file selection
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change'));
  });
}

// ── Upload state helpers ──────────────────────────────────────────────────────
function setUploadLoading(btn, statusEl, loading) {
  btn.disabled = loading;
  if (loading) {
    btn.innerHTML = `<span class="animate-spin" style="display:inline-block;width:12px;height:12px;
      border:2px solid rgba(124,58,237,0.3);border-top-color:var(--accent);border-radius:50%"></span> Uploading…`;
    showUploadStatus(statusEl, '', '');
  } else {
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <polyline points="16 16 12 12 8 16"/>
        <line x1="12" y1="12" x2="12" y2="21"/>
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
      </svg>
      upload file`;
    btn.disabled = false;
  }
}

function showUploadStatus(el, msg, state) {
  el.dataset.state = state;
  el.textContent   = msg;
  el.style.color   = state === 'success' ? 'var(--green)'
                   : state === 'error'   ? 'var(--red)'
                   : 'var(--text-muted)';
}

// ── Format bytes ──────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024)         return bytes + ' B';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Init ──────────────────────────────────────────────────────────────────────
// Inject after DOM settles (panel is already in the DOM, just hidden)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectUploadButtons);
} else {
  injectUploadButtons();
}
