import type {
  PageDefinition,
  AutoDailyData,
  AutoDailyLogEntry,
  AccountsData,
} from '../../shared/types';

let el: HTMLElement | null = null;
let adData: AutoDailyData = { accounts: {} };
let accounts: AccountsData['accounts'] = [];
let logs: AutoDailyLogEntry[] = [];

const MAX_LOGS = 80;

// ─── Bulk copy state ─────────────────────────────────────────
let adBulkOpen = false;
let adBulkSourceId = '';
let adBulkTargets: Set<string> = new Set();
let adBulkApplying = false;

// ─── Render ──────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (accounts.length === 0) {
    el.innerHTML = `
      <div class="page-autodaily">
        <h1 class="page-title">AutoDaily</h1>
        <p class="page-subtitle">Automatic STW daily login reward collection</p>
        <div class="empty-state">
          <span class="empty-icon">👤</span>
          <p class="empty-text">No accounts registered</p>
          <p class="empty-subtext">Add an Epic Games account first from the Accounts page.</p>
        </div>
      </div>`;
    return;
  }

  const cardsHtml = accounts.map((acc) => {
    const cfg = adData.accounts[acc.accountId];
    const isActive = cfg?.isActive ?? false;
    const lastCollected = cfg?.lastCollected;

    return `
      <div class="ad-account-card ${isActive ? 'ad-card-active' : ''}" data-id="${acc.accountId}">
        <div class="ad-card-header">
          <div class="ad-card-identity">
            <div class="account-avatar ${isActive ? '' : 'ad-avatar-off'}">
              <span class="account-avatar-letter">${acc.displayName.charAt(0).toUpperCase()}</span>
            </div>
            <div class="ad-card-name-wrap">
              <span class="account-name">${acc.displayName}</span>
              <span class="ad-status-badge ${isActive ? 'ad-badge-ok' : 'ad-badge-off'}">
                ${isActive ? '● Active' : 'Disabled'}
              </span>
              ${lastCollected ? `<span class="ad-last-collected">Last collected: ${new Date(lastCollected).toLocaleString()}</span>` : ''}
            </div>
          </div>
          <label class="ad-toggle">
            <input type="checkbox" class="ad-toggle-input" data-id="${acc.accountId}" ${isActive ? 'checked' : ''}>
            <span class="ad-toggle-slider"></span>
          </label>
        </div>
      </div>`;
  }).join('');

  const nextReset = getNextResetLabel();

  const logsHtml = logs.length === 0
    ? '<p class="ad-log-empty">No events yet. AutoDaily will log activity here.</p>'
    : logs.slice().reverse().map((l) => `
        <div class="ad-log-entry ad-log-${l.type}">
          <span class="ad-log-dot"></span>
          <span class="ad-log-name">${l.displayName}</span>
          <span class="ad-log-msg">${l.message}</span>
        </div>
      `).join('');

  el.innerHTML = `
    <div class="page-autodaily">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">AutoDaily</h1>
          <p class="page-subtitle">Automatic STW daily login reward collection — runs at daily reset (00:00 UTC)</p>
        </div>
        <button class="bulk-copy-btn" id="ad-bulk-open" ${accounts.length < 2 ? 'disabled' : ''} title="Copy enabled state from one account to others">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy to All
        </button>
      </div>

      <div class="ad-controls">
        <button class="ad-run-now-btn" id="ad-run-now">▶ Run Now</button>
        <span class="ad-next-reset">${nextReset}</span>
      </div>

      <div class="ad-cards">${cardsHtml}</div>

      <div class="ad-log-section">
        <h3 class="ad-log-title">Activity Log</h3>
        <div class="ad-log-list" id="ad-log-list">${logsHtml}</div>
      </div>
      ${adBulkOpen ? renderAdBulkModal() : ''}
    </div>`;

  bindEvents();
}

function renderAdBulkModal(): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const srcOpts = accounts
    .map((a) => `<option value="${a.accountId}" ${a.accountId === adBulkSourceId ? 'selected' : ''}>${esc(a.displayName)}</option>`)
    .join('');
  const targets = accounts
    .map((a) => {
      const isSrc = a.accountId === adBulkSourceId;
      const checked = !isSrc && adBulkTargets.has(a.accountId);
      const srcCfg = adData.accounts[adBulkSourceId];
      const srcActive = srcCfg?.isActive ?? false;
      return `
        <label class="bulk-target-item${isSrc ? ' bulk-target-source' : ''}">
          <input type="checkbox" class="bulk-target-check" data-target-id="${a.accountId}" ${checked ? 'checked' : ''} ${isSrc ? 'disabled' : ''}>
          <span>${esc(a.displayName)}</span>
          ${isSrc ? `<span class="bulk-source-label">(source — ${srcActive ? 'enabled' : 'disabled'})</span>` : ''}
        </label>`;
    })
    .join('');
  const count = adBulkTargets.size;
  const srcActive = adData.accounts[adBulkSourceId]?.isActive ?? false;
  return `
    <div class="bulk-modal-overlay" id="ad-bulk-overlay">
      <div class="bulk-modal">
        <div class="bulk-modal-header">
          <h4>Copy State to Accounts</h4>
          <button class="bulk-modal-close" id="ad-bulk-close">&times;</button>
        </div>
        <div class="bulk-modal-body">
          <div class="bulk-field">
            <label class="bulk-label">Copy enabled state from</label>
            <select class="bulk-source-select" id="ad-bulk-source">${srcOpts}</select>
          </div>
          <div class="bulk-field">
            <div class="bulk-targets-header">
              <label class="bulk-label">Apply to (will ${srcActive ? 'enable' : 'disable'})</label>
              <div class="bulk-targets-actions">
                <button class="bulk-sel-all" id="ad-sel-all">All</button>
                <button class="bulk-sel-none" id="ad-sel-none">None</button>
              </div>
            </div>
            <div class="bulk-targets-list">${targets}</div>
          </div>
        </div>
        <div class="bulk-modal-footer">
          <button class="bulk-cancel" id="ad-bulk-cancel">Cancel</button>
          <button class="bulk-apply" id="ad-bulk-apply" ${!adBulkSourceId || count === 0 || adBulkApplying ? 'disabled' : ''}>
            ${adBulkApplying ? '⏳ Applying...' : `Apply to ${count} account${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>`;
}

// ─── Helpers ─────────────────────────────────────────────────

function getNextResetLabel(): string {
  const now = new Date();
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 10, 0);
  if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0 && now.getUTCSeconds() < 10) {
    next.setUTCDate(now.getUTCDate());
  }
  const diff = next.getTime() - now.getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `Next run in ~${h}h ${m}m`;
}

// ─── Events ──────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  el.querySelectorAll<HTMLInputElement>('.ad-toggle-input').forEach((input) => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id!;
      adData = await window.glowAPI.autodaily.toggle(id, input.checked);
      draw();
    });
  });

  const runBtn = el.querySelector('#ad-run-now');
  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      (runBtn as HTMLButtonElement).disabled = true;
      (runBtn as HTMLButtonElement).textContent = '⏳ Running...';
      try {
        await window.glowAPI.autodaily.runNow();
      } finally {
        await reload();
      }
    });
  }

  // ── Bulk copy ──────────────────────────────────────────────
  el.querySelector('#ad-bulk-open')?.addEventListener('click', () => {
    adBulkSourceId = accounts[0]?.accountId ?? '';
    adBulkTargets = new Set(accounts.filter((a) => a.accountId !== adBulkSourceId).map((a) => a.accountId));
    adBulkOpen = true;
    draw();
  });

  if (adBulkOpen) {
    const closeBulk = () => { adBulkOpen = false; draw(); };
    el.querySelector('#ad-bulk-close')?.addEventListener('click', closeBulk);
    el.querySelector('#ad-bulk-cancel')?.addEventListener('click', closeBulk);
    el.querySelector('#ad-bulk-overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'ad-bulk-overlay') closeBulk();
    });
    el.querySelector<HTMLSelectElement>('#ad-bulk-source')?.addEventListener('change', (e) => {
      adBulkSourceId = (e.target as HTMLSelectElement).value;
      adBulkTargets = new Set(accounts.filter((a) => a.accountId !== adBulkSourceId).map((a) => a.accountId));
      draw();
    });
    el.querySelector('#ad-sel-all')?.addEventListener('click', () => {
      adBulkTargets = new Set(accounts.filter((a) => a.accountId !== adBulkSourceId).map((a) => a.accountId));
      draw();
    });
    el.querySelector('#ad-sel-none')?.addEventListener('click', () => {
      adBulkTargets = new Set();
      draw();
    });
    el.querySelectorAll<HTMLInputElement>('.bulk-target-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.targetId!;
        if (cb.checked) adBulkTargets.add(id);
        else adBulkTargets.delete(id);
        const applyBtn = el?.querySelector<HTMLButtonElement>('#ad-bulk-apply');
        if (applyBtn) {
          const c = adBulkTargets.size;
          applyBtn.textContent = `Apply to ${c} account${c !== 1 ? 's' : ''}`;
          applyBtn.disabled = c === 0 || adBulkApplying;
        }
      });
    });
    el.querySelector('#ad-bulk-apply')?.addEventListener('click', async () => {
      if (adBulkApplying || !adBulkSourceId || adBulkTargets.size === 0) return;
      const srcActive = adData.accounts[adBulkSourceId]?.isActive ?? false;
      adBulkApplying = true;
      draw();
      for (const targetId of adBulkTargets) {
        try { adData = await window.glowAPI.autodaily.toggle(targetId, srcActive); } catch {}
      }
      adBulkApplying = false;
      adBulkOpen = false;
      draw();
    });
  }
}

// ─── IPC listeners ───────────────────────────────────────────

function onDataChanged(): void {
  reload();
}

function onLog(entry: AutoDailyLogEntry): void {
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);

  const list = el?.querySelector('#ad-log-list');
  if (list) {
    const empty = list.querySelector('.ad-log-empty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = `ad-log-entry ad-log-${entry.type}`;
    div.innerHTML = `
      <span class="ad-log-dot"></span>
      <span class="ad-log-name">${entry.displayName}</span>
      <span class="ad-log-msg">${entry.message}</span>`;
    list.prepend(div);
  }
}

async function reload(): Promise<void> {
  const result = await window.glowAPI.autodaily.getFullStatus();
  adData = result.data;

  accounts = result.accounts.map((a) => ({
    accountId: a.accountId,
    displayName: a.displayName,
    deviceAuth: {} as any,
  }));

  draw();
}

// ─── Page Definition ─────────────────────────────────────────

export const autodailyPage: PageDefinition = {
  id: 'autodaily',
  label: 'AutoDaily',
  icon: `<img src="assets/icons/fnui/Automated/quests.png" alt="Status" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 21,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    logs = [];

    window.glowAPI.autodaily.onDataChanged(onDataChanged);
    window.glowAPI.autodaily.onLog(onLog);

    await reload();
  },

  cleanup(): void {
    window.glowAPI.autodaily.offDataChanged();
    window.glowAPI.autodaily.offLog();
    el = null;
  },
};
