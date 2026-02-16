import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;
let loading = false;
let worldInfoData: any = null;
let worldInfoStats: { missions: number; alerts: number; theaters: number; sizeMB: string } | null = null;
let errorMsg: string | null = null;

// ─── Helpers ──────────────────────────────────────────────────

function getDefaultFileName(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `worldinfo_${y}_${m}_${d}`;
}

// ─── Draw ─────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="files-page">
      <div class="files-header">
        <h1 class="page-title">Files</h1>
        <p class="page-subtitle">Generate and download data files from your Fortnite account</p>
      </div>

      <div class="files-grid">
        <!-- World Info Card -->
        <div class="files-card" id="files-worldinfo-card">
          <div class="files-card-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <div class="files-card-body">
            <h3 class="files-card-title">World Info</h3>
            <p class="files-card-desc">STW world info JSON without modifiers (no miniboss, etc...)</p>

            ${loading ? `
              <div class="files-card-loading">
                <div class="files-spinner"></div>
                <span>Fetching world info...</span>
              </div>
            ` : errorMsg ? `
              <div class="files-card-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <span>${errorMsg}</span>
              </div>
              <button class="files-btn files-btn--primary" id="files-worldinfo-generate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Retry
              </button>
            ` : worldInfoData ? `
              <div class="files-card-stats">
                <div class="files-stat">
                  <span class="files-stat-value">${worldInfoStats?.theaters ?? 0}</span>
                  <span class="files-stat-label">Theaters</span>
                </div>
                <div class="files-stat">
                  <span class="files-stat-value">${worldInfoStats?.missions ?? 0}</span>
                  <span class="files-stat-label">Missions</span>
                </div>
                <div class="files-stat">
                  <span class="files-stat-value">${worldInfoStats?.alerts ?? 0}</span>
                  <span class="files-stat-label">Alerts</span>
                </div>
                <div class="files-stat">
                  <span class="files-stat-value">${worldInfoStats?.sizeMB ?? '0'}MB</span>
                  <span class="files-stat-label">Size</span>
                </div>
              </div>
              <div class="files-card-actions">
                <button class="files-btn files-btn--primary" id="files-worldinfo-download">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download JSON
                </button>
                <button class="files-btn files-btn--secondary" id="files-worldinfo-preview">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Preview JSON
                </button>
                <button class="files-btn files-btn--ghost" id="files-worldinfo-refresh">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
              </div>
            ` : `
              <button class="files-btn files-btn--primary" id="files-worldinfo-generate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Generate World Info
              </button>
            `}
          </div>
        </div>

        <!-- Placeholder for future files -->
        <div class="files-card files-card--soon">
          <div class="files-card-icon files-card-icon--muted">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <div class="files-card-body">
            <h3 class="files-card-title files-card-title--muted">More files soon</h3>
            <p class="files-card-desc files-card-desc--muted">Additional file exports will be added in future updates.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- JSON Preview Modal -->
    <div class="files-modal-overlay" id="files-modal-overlay" style="display:none">
      <div class="files-modal">
        <div class="files-modal-header">
          <h2 class="files-modal-title">World Info Preview</h2>
          <div class="files-modal-header-actions">
            <button class="files-btn files-btn--ghost files-modal-copy" id="files-modal-copy" title="Copy to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="files-btn files-btn--ghost files-modal-close" id="files-modal-close" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="files-modal-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="files-modal-search-input" placeholder="Search in JSON..." autocomplete="off" spellcheck="false"/>
        </div>
        <pre class="files-modal-json" id="files-modal-json"></pre>
      </div>
    </div>
  `;

  bindEvents();
}

// ─── Events ───────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  const genBtn = el.querySelector('#files-worldinfo-generate') as HTMLButtonElement | null;
  genBtn?.addEventListener('click', () => loadWorldInfo());

  const downloadBtn = el.querySelector('#files-worldinfo-download') as HTMLButtonElement | null;
  downloadBtn?.addEventListener('click', () => downloadWorldInfo());

  const previewBtn = el.querySelector('#files-worldinfo-preview') as HTMLButtonElement | null;
  previewBtn?.addEventListener('click', () => openPreview());

  const refreshBtn = el.querySelector('#files-worldinfo-refresh') as HTMLButtonElement | null;
  refreshBtn?.addEventListener('click', () => loadWorldInfo());

  // Modal events
  const overlay = el.querySelector('#files-modal-overlay') as HTMLElement | null;
  const closeBtn = el.querySelector('#files-modal-close') as HTMLButtonElement | null;
  const copyBtn = el.querySelector('#files-modal-copy') as HTMLButtonElement | null;
  const searchInput = el.querySelector('#files-modal-search-input') as HTMLInputElement | null;

  closeBtn?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'files-modal-overlay') closeModal();
  });

  copyBtn?.addEventListener('click', () => {
    if (!worldInfoData) return;
    const jsonStr = JSON.stringify(worldInfoData, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      if (copyBtn) {
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        }, 2000);
      }
    });
  });

  searchInput?.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    highlightJson(query);
  });

  // Esc key to close
  document.addEventListener('keydown', handleEsc);
}

function handleEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeModal();
}

// ─── Actions ──────────────────────────────────────────────────

async function loadWorldInfo(): Promise<void> {
  if (loading) return;
  loading = true;
  errorMsg = null;
  draw();

  try {
    const result = await window.glowAPI.files.getWorldInfo();
    if (result.success) {
      worldInfoData = result.data;
      worldInfoStats = {
        missions: result.missions ?? 0,
        alerts: result.alerts ?? 0,
        theaters: result.theaters ?? 0,
        sizeMB: result.sizeMB ?? '0',
      };
      errorMsg = null;
    } else {
      errorMsg = result.error || 'Failed to fetch world info';
    }
  } catch (err: any) {
    errorMsg = err.message || 'Unexpected error';
  } finally {
    loading = false;
    draw();
  }
}

async function downloadWorldInfo(): Promise<void> {
  if (!worldInfoData) return;
  const jsonStr = JSON.stringify(worldInfoData, null, 2);
  try {
    await window.glowAPI.files.save(jsonStr, getDefaultFileName());
  } catch {
    // user cancelled or error — silent
  }
}

function openPreview(): void {
  if (!worldInfoData || !el) return;
  const overlay = el.querySelector('#files-modal-overlay') as HTMLElement;
  const jsonPre = el.querySelector('#files-modal-json') as HTMLPreElement;
  const searchInput = el.querySelector('#files-modal-search-input') as HTMLInputElement;
  if (!overlay || !jsonPre) return;

  // Render syntax-highlighted JSON
  const jsonStr = JSON.stringify(worldInfoData, null, 2);
  jsonPre.innerHTML = syntaxHighlight(jsonStr);
  overlay.style.display = 'flex';
  if (searchInput) searchInput.value = '';
}

function closeModal(): void {
  if (!el) return;
  const overlay = el.querySelector('#files-modal-overlay') as HTMLElement;
  if (overlay) overlay.style.display = 'none';
}

// ─── JSON Syntax Highlighting ─────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          // Remove trailing colon from display, we'll add it back
          const inner = escapeHtml(match.slice(1, -2));
          return `<span class="${cls}">"${inner}"</span>:`;
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${escapeHtml(match)}</span>`;
    }
  );
}

function highlightJson(query: string): void {
  if (!el || !worldInfoData) return;
  const jsonPre = el.querySelector('#files-modal-json') as HTMLPreElement;
  if (!jsonPre) return;

  const jsonStr = JSON.stringify(worldInfoData, null, 2);

  if (!query) {
    jsonPre.innerHTML = syntaxHighlight(jsonStr);
    return;
  }

  // First apply syntax highlighting then wrap matches
  let highlighted = syntaxHighlight(jsonStr);

  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    // We need to highlight within text content only, not in tags
    // Simple approach: highlight in the original JSON then syntax-highlight won't work well
    // Better: do it by highlighting the raw text and then adding syntax classes

    // Simpler approach: just highlight in the already-highlighted HTML
    // but skip anything inside < >
    highlighted = highlighted.replace(/>[^<]*</g, (segment) => {
      return segment.replace(regex, '<mark class="json-match">$1</mark>');
    });
  } catch {
    // invalid regex — ignore
  }

  jsonPre.innerHTML = highlighted;

  // Scroll to first match
  const firstMatch = jsonPre.querySelector('.json-match');
  if (firstMatch) firstMatch.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ─── Page Definition ──────────────────────────────────────────

export const filesPage: PageDefinition = {
  id: 'files',
  label: 'Files',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  order: 17,
  render(container) {
    el = container;
    draw();
  },
  cleanup() {
    document.removeEventListener('keydown', handleEsc);
    el = null;
  },
};
