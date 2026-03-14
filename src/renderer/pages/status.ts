/**
 * Status Page — Manage Fortnite XMPP presence status per account.
 *
 * Shows all launcher accounts with their status state,
 * allows activating/deactivating, editing message, platform, and presence mode.
 */

import type { PageDefinition, StatusConnectionInfo } from '../../shared/types';

let el: HTMLElement | null = null;
let statusList: StatusConnectionInfo[] = [];
let loading = false;

// ─── Bulk copy state ─────────────────────────────────────────
let stBulkOpen = false;
let stBulkSourceId = '';
let stBulkTargets: Set<string> = new Set();
let stBulkApplying = false;

const PLATFORMS = [
  { name: 'Android', value: 'AND' },
  { name: 'Windows', value: 'WIN' },
  { name: 'PlayStation', value: 'PSN' },
  { name: 'Xbox', value: 'XBL' },
  { name: 'Switch', value: 'SWT' },
  { name: 'iOS', value: 'IOS' },
  { name: 'Mac', value: 'MAC' },
] as const;

const PRESENCE_MODES = [
  { name: 'Online', value: 'online' },
  { name: 'Away (no visible)', value: 'dnd' },
  { name: 'Away (visible)', value: 'away' },
] as const;

// ─── Fetch ────────────────────────────────────────────────

async function fetchStatuses(): Promise<void> {
  loading = true;
  draw();

  try {
    const res = await window.glowAPI.status.getAll();
    if (res.success) {
      statusList = res.statuses;
    }
  } catch {}

  loading = false;
  draw();
}

// ─── Draw ─────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading && statusList.length === 0) {
    el.innerHTML = `
      <div class="status-page">
        <h1 class="page-title">Status</h1>
        <p class="page-subtitle">Manage Fortnite XMPP presence status for your accounts</p>
        <div class="status-loading"><div class="auth-spinner"></div></div>
      </div>
    `;
    return;
  }

  if (statusList.length === 0) {
    el.innerHTML = `
      <div class="status-page">
        <h1 class="page-title">Status</h1>
        <p class="page-subtitle">Manage Fortnite XMPP presence status for your accounts</p>
        <div class="status-empty">
          <p>No accounts found. Add accounts first in the accounts section.</p>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="status-page">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">Status</h1>
          <p class="page-subtitle">Manage Fortnite XMPP presence status for your accounts</p>
        </div>
        <button class="bulk-copy-btn" id="st-bulk-open" ${statusList.length < 2 ? 'disabled' : ''} title="Copy status settings from one account to others">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy to All
        </button>
      </div>

      <div class="status-grid">
        ${statusList.map((s) => renderAccountCard(s)).join('')}
      </div>
      ${stBulkOpen ? renderStBulkModal() : ''}
    </div>
  `;

  bindEvents();
}

function renderStBulkModal(): string {
  const srcOpts = statusList
    .map((s) => `<option value="${s.accountId}" ${s.accountId === stBulkSourceId ? 'selected' : ''}>${escapeHtml(s.displayName)}</option>`)
    .join('');
  const src = statusList.find((s) => s.accountId === stBulkSourceId);
  const targets = statusList
    .map((s) => {
      const isSrc = s.accountId === stBulkSourceId;
      const checked = !isSrc && stBulkTargets.has(s.accountId);
      return `
        <label class="bulk-target-item${isSrc ? ' bulk-target-source' : ''}">
          <input type="checkbox" class="bulk-target-check" data-target-id="${s.accountId}" ${checked ? 'checked' : ''} ${isSrc ? 'disabled' : ''}>
          <span>${escapeHtml(s.displayName)}</span>
          ${isSrc ? `<span class="bulk-source-label">[${s.plataforma || 'AND'}]</span>` : ''}
        </label>`;
    })
    .join('');
  const count = stBulkTargets.size;
  return `
    <div class="bulk-modal-overlay" id="st-bulk-overlay">
      <div class="bulk-modal">
        <div class="bulk-modal-header">
          <h4>Copy Status Settings</h4>
          <button class="bulk-modal-close" id="st-bulk-close">&times;</button>
        </div>
        <div class="bulk-modal-body">
          <div class="bulk-field">
            <label class="bulk-label">Copy settings from</label>
            <select class="bulk-source-select" id="st-bulk-source">${srcOpts}</select>
          </div>
          ${src ? `<div class="bulk-field">
            <label class="bulk-label">Settings to apply</label>
            <div style="font-size:12px;color:var(--text-secondary,#aaa);background:rgba(255,255,255,0.04);border-radius:6px;padding:8px 10px;line-height:1.7">
              Message: <b style="color:var(--text-primary,#fff)">${escapeHtml(src.mensaje || '(empty)')}</b><br>
              Platform: <b style="color:var(--text-primary,#fff)">${src.plataforma || 'AND'}</b><br>
              Presence: <b style="color:var(--text-primary,#fff)">${src.presenceMode || 'online'}</b>
            </div>
          </div>` : ''}
          <div class="bulk-field">
            <div class="bulk-targets-header">
              <label class="bulk-label">Apply to</label>
              <div class="bulk-targets-actions">
                <button class="bulk-sel-all" id="st-sel-all">All</button>
                <button class="bulk-sel-none" id="st-sel-none">None</button>
              </div>
            </div>
            <div class="bulk-targets-list">${targets}</div>
          </div>
        </div>
        <div class="bulk-modal-footer">
          <button class="bulk-cancel" id="st-bulk-cancel">Cancel</button>
          <button class="bulk-apply" id="st-bulk-apply" ${!stBulkSourceId || count === 0 || stBulkApplying ? 'disabled' : ''}>
            ${stBulkApplying ? '⏳ Applying...' : `Apply to ${count} account${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>`;
}

function renderAccountCard(s: StatusConnectionInfo): string {
  const connected = s.isConnected;
  const active = s.isActive;
  const reconnecting = s.isReconnecting;

  let statusBadge: string;
  let statusClass: string;
  if (connected) {
    statusBadge = 'Connected';
    statusClass = 'connected';
  } else if (reconnecting) {
    statusBadge = 'Reconnecting...';
    statusClass = 'reconnecting';
  } else if (active) {
    statusBadge = 'Connecting...';
    statusClass = 'connecting';
  } else {
    statusBadge = 'Offline';
    statusClass = 'offline';
  }

  const currentPlatform = s.plataforma || 'AND';
  const currentPresence = s.presenceMode || 'online';
  const currentMessage = escapeAttr(s.mensaje || '');

  return `
    <div class="status-card ${active ? 'active' : ''}" data-account="${s.accountId}">
      <div class="status-card-header">
        <div class="status-card-info">
          <div class="status-indicator ${statusClass}"></div>
          <div>
            <h3 class="status-card-name">${escapeHtml(s.displayName)}</h3>
            <span class="status-badge ${statusClass}">${statusBadge}</span>
          </div>
        </div>
        <label class="status-toggle">
          <input type="checkbox" class="status-toggle-input" data-toggle="${s.accountId}" ${active ? 'checked' : ''}>
          <span class="status-toggle-slider"></span>
        </label>
      </div>

      <div class="status-card-body">
        <div class="status-field">
          <label class="status-field-label">Message</label>
          <div class="status-input-row">
            <input type="text" class="status-input" data-message="${s.accountId}"
                   value="${currentMessage}" placeholder="Enter status message..."
                   maxlength="200" />
            ${active ? `<button class="status-btn-small" data-update-msg="${s.accountId}" title="Update message">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>` : ''}
          </div>
        </div>

        <div class="status-field-row">
          <div class="status-field">
            <label class="status-field-label">Platform</label>
            <select class="status-select" data-platform="${s.accountId}">
              ${PLATFORMS.map((p) => `<option value="${p.value}" ${p.value === currentPlatform ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="status-field">
            <label class="status-field-label">Presence</label>
            <select class="status-select" data-presence="${s.accountId}">
              ${PRESENCE_MODES.map((p) => `<option value="${p.value}" ${p.value === currentPresence ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
        </div>

        ${s.lastUpdate ? `<div class="status-last-update">Last update: ${new Date(s.lastUpdate).toLocaleString()}</div>` : ''}
        ${s.error ? `<div class="status-error">${escapeHtml(s.error)}</div>` : ''}
      </div>
    </div>
  `;
}

// ─── Events ───────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // Toggle switches
  el.querySelectorAll('.status-toggle-input[data-toggle]').forEach((input) => {
    input.addEventListener('change', async () => {
      const accountId = (input as HTMLInputElement).dataset.toggle!;
      const checked = (input as HTMLInputElement).checked;

      if (checked) {
        // Get current field values
        const msgEl = el!.querySelector(`[data-message="${accountId}"]`) as HTMLInputElement;
        const platEl = el!.querySelector(`[data-platform="${accountId}"]`) as HTMLSelectElement;
        const presEl = el!.querySelector(`[data-presence="${accountId}"]`) as HTMLSelectElement;

        const mensaje = msgEl?.value || 'GLOW Launcher';
        const plataforma = platEl?.value || 'AND';
        const presenceMode = presEl?.value || 'online';

        // Disable toggle while processing
        (input as HTMLInputElement).disabled = true;

        const result = await window.glowAPI.status.activate(accountId, mensaje, plataforma, presenceMode);
        if (!result.success) {
          (input as HTMLInputElement).checked = false;
          showError(accountId, result.error || 'Activation failed');
        }

        (input as HTMLInputElement).disabled = false;
      } else {
        (input as HTMLInputElement).disabled = true;
        await window.glowAPI.status.deactivate(accountId);
        (input as HTMLInputElement).disabled = false;
      }

      // Refresh after a short delay
      setTimeout(() => fetchStatuses(), 1500);
    });
  });

  // Update message buttons
  el.querySelectorAll('[data-update-msg]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const accountId = (btn as HTMLElement).dataset.updateMsg!;
      const msgEl = el!.querySelector(`[data-message="${accountId}"]`) as HTMLInputElement;
      if (!msgEl) return;

      const result = await window.glowAPI.status.updateMessage(accountId, msgEl.value);
      if (result.success) {
        // Flash success
        (btn as HTMLElement).classList.add('success-flash');
        setTimeout(() => (btn as HTMLElement).classList.remove('success-flash'), 1500);
      } else {
        showError(accountId, result.error || 'Update failed');
      }
    });
  });

  // Enter key on message input → update message
  el.querySelectorAll('.status-input[data-message]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        const accountId = (input as HTMLInputElement).dataset.message!;
        const btn = el?.querySelector(`[data-update-msg="${accountId}"]`) as HTMLElement;
        btn?.click();
      }
    });
  });

  // ── Bulk copy ──────────────────────────────────────────────
  el.querySelector('#st-bulk-open')?.addEventListener('click', () => {
    stBulkSourceId = statusList[0]?.accountId ?? '';
    stBulkTargets = new Set(statusList.filter((s) => s.accountId !== stBulkSourceId).map((s) => s.accountId));
    stBulkOpen = true;
    draw();
  });

  if (stBulkOpen) {
    const closeBulk = () => { stBulkOpen = false; draw(); };
    el.querySelector('#st-bulk-close')?.addEventListener('click', closeBulk);
    el.querySelector('#st-bulk-cancel')?.addEventListener('click', closeBulk);
    el.querySelector('#st-bulk-overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'st-bulk-overlay') closeBulk();
    });
    el.querySelector<HTMLSelectElement>('#st-bulk-source')?.addEventListener('change', (e) => {
      stBulkSourceId = (e.target as HTMLSelectElement).value;
      stBulkTargets = new Set(statusList.filter((s) => s.accountId !== stBulkSourceId).map((s) => s.accountId));
      draw();
    });
    el.querySelector('#st-sel-all')?.addEventListener('click', () => {
      stBulkTargets = new Set(statusList.filter((s) => s.accountId !== stBulkSourceId).map((s) => s.accountId));
      draw();
    });
    el.querySelector('#st-sel-none')?.addEventListener('click', () => {
      stBulkTargets = new Set();
      draw();
    });
    el.querySelectorAll<HTMLInputElement>('.bulk-target-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.targetId!;
        if (cb.checked) stBulkTargets.add(id);
        else stBulkTargets.delete(id);
        const applyBtn = el?.querySelector<HTMLButtonElement>('#st-bulk-apply');
        if (applyBtn) {
          const c = stBulkTargets.size;
          applyBtn.textContent = `Apply to ${c} account${c !== 1 ? 's' : ''}`;
          applyBtn.disabled = c === 0 || stBulkApplying;
        }
      });
    });
    el.querySelector('#st-bulk-apply')?.addEventListener('click', async () => {
      if (stBulkApplying || !stBulkSourceId || stBulkTargets.size === 0) return;
      const src = statusList.find((s) => s.accountId === stBulkSourceId);
      if (!src) return;
      const { mensaje, plataforma, presenceMode } = src;
      stBulkApplying = true;
      draw();
      for (const targetId of stBulkTargets) {
        try {
          await window.glowAPI.status.activate(targetId, mensaje || '', plataforma || 'AND', presenceMode || 'online');
        } catch {}
      }
      stBulkApplying = false;
      stBulkOpen = false;
      setTimeout(() => fetchStatuses(), 1500);
      draw();
    });
  }
}

function showError(accountId: string, message: string): void {
  if (!el) return;
  const card = el.querySelector(`[data-account="${accountId}"]`);
  if (!card) return;

  // Remove existing error
  const existing = card.querySelector('.status-error');
  if (existing) existing.remove();

  const errorDiv = document.createElement('div');
  errorDiv.className = 'status-error';
  errorDiv.textContent = message;
  card.querySelector('.status-card-body')?.appendChild(errorDiv);

  setTimeout(() => errorDiv.remove(), 5000);
}

// ─── Helpers ──────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Page Definition ──────────────────────────────────────

export const statusPage: PageDefinition = {
  id: 'status',
  label: 'Status',
  icon: `<img src="assets/icons/fnui/Automated/custom-status.png" alt="Status" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 24,
  render(container) {
    el = container;
    statusList = [];
    fetchStatuses();

    // Listen for live connection updates
    window.glowAPI.status.onConnectionUpdate((data) => {
      const idx = statusList.findIndex((s) => s.accountId === data.accountId);
      if (idx >= 0) {
        statusList[idx].isConnected = data.connected;
        if (data.error) statusList[idx].error = data.error;
        else delete statusList[idx].error;
        const connected = statusList.filter((s) => s.isConnected).length;
        window.glowAPI.discordRpc.setDetail(connected > 0 ? `${connected} status${connected !== 1 ? 'es' : ''} active` : null);
        draw();
      }
    });

    // Listen for data changes (activate/deactivate from elsewhere)
    window.glowAPI.status.onDataChanged(() => {
      if (el) fetchStatuses();
    });

    // Account changes
    window.glowAPI.accounts.onDataChanged(() => {
      if (el) fetchStatuses();
    });
  },
  cleanup() {
    el = null;
    statusList = [];
    window.glowAPI.status.offConnectionUpdate();
    window.glowAPI.status.offDataChanged();
  },
};
