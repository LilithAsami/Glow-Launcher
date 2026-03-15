import type {
  PageDefinition,
  AutoKickData,
  AutoKickAccountConfig,
  AutoKickStatus,
  AutoKickLogEntry,
  AccountsData,
} from '../../shared/types';

let el: HTMLElement | null = null;
let akData: AutoKickData = { accounts: {} };
let statuses: AutoKickStatus[] = [];
let accounts: AccountsData['accounts'] = [];
let logs: AutoKickLogEntry[] = [];

const MAX_LOGS = 80;

// ─── Bulk copy state ─────────────────────────────────────────
let akBulkOpen = false;
let akBulkSourceId = '';
let akBulkTargets: Set<string> = new Set();
let akBulkApplying = false;

// ─── Render orchestrator ─────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (accounts.length === 0) {
    el.innerHTML = `
      <div class="page-autokick">
        <h1 class="page-title">AutoKick</h1>
        <p class="page-subtitle">Automatic STW mission monitor</p>
        <div class="empty-state">
          <span class="empty-icon">👤</span>
          <p class="empty-text">No accounts registered</p>
          <p class="empty-subtext">Add an Epic Games account first from the Accounts page.</p>
        </div>
      </div>`;
    return;
  }

  const cardsHtml = accounts.map((acc) => {
    const cfg = akData.accounts[acc.accountId];
    const status = statuses.find((s) => s.accountId === acc.accountId);
    const isActive = cfg?.isActive ?? false;
    const connected = status?.connected ?? false;
    const error = status?.error;

    return `
      <div class="ak-account-card ${isActive ? 'ak-card-active' : ''}" data-id="${acc.accountId}">
        <div class="ak-card-header">
          <div class="ak-card-identity">
            <div class="account-avatar ${isActive ? '' : 'ak-avatar-off'}">
              <span class="account-avatar-letter">${acc.displayName.charAt(0).toUpperCase()}</span>
            </div>
            <div class="ak-card-name-wrap">
              <span class="account-name">${acc.displayName}</span>
              <span class="ak-status-badge ${connected ? 'ak-badge-ok' : (isActive ? (error ? 'ak-badge-err' : 'ak-badge-warn') : 'ak-badge-off')}">
                ${connected ? '● Connected' : (isActive ? (error || '● Connecting...') : 'Disabled')}
              </span>
            </div>
          </div>
          <label class="ak-toggle">
            <input type="checkbox" class="ak-toggle-input" data-id="${acc.accountId}" ${isActive ? 'checked' : ''}>
            <span class="ak-toggle-slider"></span>
          </label>
        </div>

        ${isActive ? renderConfigOptions(acc.accountId, cfg!) : ''}
      </div>`;
  }).join('');

  const logsHtml = logs.length === 0
    ? '<p class="ak-log-empty">No events yet. AutoKick will log activity here.</p>'
    : logs.slice().reverse().map((l) => `
        <div class="ak-log-entry ak-log-${l.type}">
          <span class="ak-log-dot"></span>
          <span class="ak-log-name">${l.displayName}</span>
          <span class="ak-log-msg">${l.message}</span>
        </div>
      `).join('');

  el.innerHTML = `
    <div class="page-autokick">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">AutoKick</h1>
          <p class="page-subtitle">Automatic STW mission monitor — per-account configuration</p>
        </div>
        <button class="bulk-copy-btn" id="ak-bulk-open" ${accounts.length < 2 ? 'disabled' : ''} title="Copy settings from one account to others">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy to All
        </button>
      </div>

      <div class="ak-cards">${cardsHtml}</div>

      <div class="ak-log-section">
        <h3 class="ak-log-title">Activity Log</h3>
        <div class="ak-log-list" id="ak-log-list">${logsHtml}</div>
      </div>
      ${akBulkOpen ? renderAkBulkModal() : ''}
    </div>`;

  bindEvents();
}

function renderAkBulkModal(): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const srcOpts = accounts
    .map((a) => `<option value="${a.accountId}" ${a.accountId === akBulkSourceId ? 'selected' : ''}>${esc(a.displayName)}</option>`)
    .join('');
  const targets = accounts
    .map((a) => {
      const isSrc = a.accountId === akBulkSourceId;
      const checked = !isSrc && akBulkTargets.has(a.accountId);
      return `
        <label class="bulk-target-item${isSrc ? ' bulk-target-source' : ''}">
          <input type="checkbox" class="bulk-target-check" data-target-id="${a.accountId}" ${checked ? 'checked' : ''} ${isSrc ? 'disabled' : ''}>
          <span>${esc(a.displayName)}</span>
          ${isSrc ? '<span class="bulk-source-label">(source)</span>' : ''}
        </label>`;
    })
    .join('');
  const count = akBulkTargets.size;
  return `
    <div class="bulk-modal-overlay" id="ak-bulk-overlay">
      <div class="bulk-modal">
        <div class="bulk-modal-header">
          <h4>Copy Settings to Accounts</h4>
          <button class="bulk-modal-close" id="ak-bulk-close">&times;</button>
        </div>
        <div class="bulk-modal-body">
          <div class="bulk-field">
            <label class="bulk-label">Copy settings from</label>
            <select class="bulk-source-select" id="ak-bulk-source">${srcOpts}</select>
          </div>
          <div class="bulk-field">
            <div class="bulk-targets-header">
              <label class="bulk-label">Apply to</label>
              <div class="bulk-targets-actions">
                <button class="bulk-sel-all" id="ak-sel-all">All</button>
                <button class="bulk-sel-none" id="ak-sel-none">None</button>
              </div>
            </div>
            <div class="bulk-targets-list">${targets}</div>
          </div>
        </div>
        <div class="bulk-modal-footer">
          <button class="bulk-cancel" id="ak-bulk-cancel">Cancel</button>
          <button class="bulk-apply" id="ak-bulk-apply" ${!akBulkSourceId || count === 0 || akBulkApplying ? 'disabled' : ''}>
            ${akBulkApplying ? '⏳ Applying...' : `Apply to ${count} account${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>`;
}

function renderConfigOptions(accountId: string, cfg: AutoKickAccountConfig): string {
  const options: { key: keyof AutoKickAccountConfig; label: string; desc: string }[] = [
    { key: 'collectRewards',   label: 'Collect Rewards',     desc: 'Automatically collect STW mission rewards' },
    { key: 'kickPartyMembers', label: 'Kick Party Members',  desc: 'Kick all party members after mission' },
    { key: 'transferMaterials', label: 'Transfer Materials', desc: 'Move materials from storage to inventory' },
    { key: 'autoLeave',        label: 'Auto Leave',         desc: 'Leave the party after actions complete' },
    { key: 'autoReinvite',     label: 'Auto Reinvite',      desc: 'Reinvite kicked members after mission' },
    { key: 'autoJoin',         label: 'Auto Join',          desc: 'Automatically join party invites' },
  ];

  return `
    <div class="ak-config-grid">
      ${options.map((opt) => `
        <div class="ak-config-item">
          <div class="ak-config-info">
            <span class="ak-config-label">${opt.label}</span>
            <span class="ak-config-desc">${opt.desc}</span>
          </div>
          <label class="ak-toggle ak-toggle-sm">
            <input type="checkbox" class="ak-option-input"
              data-id="${accountId}" data-key="${opt.key}"
              ${(cfg as any)[opt.key] ? 'checked' : ''}>
            <span class="ak-toggle-slider"></span>
          </label>
        </div>
      `).join('')}
    </div>`;
}

// ─── Events ──────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // Toggle active/inactive
  el.querySelectorAll<HTMLInputElement>('.ak-toggle-input').forEach((input) => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id!;
      await window.glowAPI.autokick.toggle(id, input.checked);
    });
  });

  // Option toggles — update local state directly (no full redraw)
  el.querySelectorAll<HTMLInputElement>('.ak-option-input').forEach((input) => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id!;
      const key = input.dataset.key!;
      const updatedData = await window.glowAPI.autokick.updateConfig(id, { [key]: input.checked });
      // Apply returned data locally — no data-changed event is sent
      akData = updatedData;
    });
  });

  // ── Bulk copy ──────────────────────────────────────────────
  el.querySelector('#ak-bulk-open')?.addEventListener('click', () => {
    akBulkSourceId = accounts[0]?.accountId ?? '';
    akBulkTargets = new Set(accounts.filter((a) => a.accountId !== akBulkSourceId).map((a) => a.accountId));
    akBulkOpen = true;
    draw();
  });

  if (akBulkOpen) {
    const closeBulk = () => { akBulkOpen = false; draw(); };
    el.querySelector('#ak-bulk-close')?.addEventListener('click', closeBulk);
    el.querySelector('#ak-bulk-cancel')?.addEventListener('click', closeBulk);
    el.querySelector('#ak-bulk-overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'ak-bulk-overlay') closeBulk();
    });
    el.querySelector<HTMLSelectElement>('#ak-bulk-source')?.addEventListener('change', (e) => {
      akBulkSourceId = (e.target as HTMLSelectElement).value;
      akBulkTargets = new Set(accounts.filter((a) => a.accountId !== akBulkSourceId).map((a) => a.accountId));
      draw();
    });
    el.querySelector('#ak-sel-all')?.addEventListener('click', () => {
      akBulkTargets = new Set(accounts.filter((a) => a.accountId !== akBulkSourceId).map((a) => a.accountId));
      draw();
    });
    el.querySelector('#ak-sel-none')?.addEventListener('click', () => {
      akBulkTargets = new Set();
      draw();
    });
    el.querySelectorAll<HTMLInputElement>('.bulk-target-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.targetId!;
        if (cb.checked) akBulkTargets.add(id);
        else akBulkTargets.delete(id);
        const applyBtn = el?.querySelector<HTMLButtonElement>('#ak-bulk-apply');
        if (applyBtn) {
          const c = akBulkTargets.size;
          applyBtn.textContent = `Apply to ${c} account${c !== 1 ? 's' : ''}`;
          applyBtn.disabled = c === 0 || akBulkApplying;
        }
      });
    });
    el.querySelector('#ak-bulk-apply')?.addEventListener('click', async () => {
      if (akBulkApplying || !akBulkSourceId || akBulkTargets.size === 0) return;
      const sourceCfg = akData.accounts[akBulkSourceId];
      if (!sourceCfg) return;
      akBulkApplying = true;
      draw();
      const patch = {
        collectRewards:   sourceCfg.collectRewards,
        kickPartyMembers: sourceCfg.kickPartyMembers,
        transferMaterials: sourceCfg.transferMaterials,
        autoLeave:        sourceCfg.autoLeave,
        autoReinvite:     sourceCfg.autoReinvite,
        autoJoin:         sourceCfg.autoJoin,
      };
      for (const targetId of akBulkTargets) {
        try { akData = await window.glowAPI.autokick.updateConfig(targetId, patch); } catch {}
        try { await window.glowAPI.autokick.toggle(targetId, sourceCfg.isActive); } catch {}
      }
      akBulkApplying = false;
      akBulkOpen = false;
      draw();
    });
  }
}

// ─── IPC listeners ───────────────────────────────────────────

function onStatusUpdate(newStatuses: AutoKickStatus[]): void {
  for (const s of newStatuses) {
    const idx = statuses.findIndex((x) => x.accountId === s.accountId);
    if (idx >= 0) statuses[idx] = s;
    else statuses.push(s);
  }
  const active = statuses.filter((s) => s.isConnected).length;
  window.glowAPI.discordRpc.setDetail(active > 0 ? `Monitoring ${active} account${active !== 1 ? 's' : ''}` : null);
  draw();
}

function onDataChanged(): void {
  reload();
}

function onLog(entry: AutoKickLogEntry): void {
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);

  // Append to log list without full redraw
  const list = el?.querySelector('#ak-log-list');
  if (list) {
    // Remove "no events" placeholder if present
    const empty = list.querySelector('.ak-log-empty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = `ak-log-entry ak-log-${entry.type}`;
    div.innerHTML = `
      <span class="ak-log-dot"></span>
      <span class="ak-log-name">${entry.displayName}</span>
      <span class="ak-log-msg">${entry.message}</span>`;
    list.prepend(div);
  }
}

async function reload(): Promise<void> {
  const result = await window.glowAPI.autokick.getFullStatus();
  akData = result.data;
  statuses = result.statuses;

  const accAll = await window.glowAPI.accounts.getAll();
  accounts = accAll.accounts;

  draw();
}

// ─── Page Definition ─────────────────────────────────────────

export const autokickPage: PageDefinition = {
  id: 'autokick',
  label: 'AutoKick',
  icon: `<img src="assets/icons/fnui/Automated/autokick.png" alt="AutoKick" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 20,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    logs = [];

    window.glowAPI.autokick.onStatusUpdate(onStatusUpdate);
    window.glowAPI.autokick.onDataChanged(onDataChanged);
    window.glowAPI.autokick.onLog(onLog);

    await reload();
  },

  cleanup(): void {
    window.glowAPI.autokick.offStatusUpdate();
    window.glowAPI.autokick.offDataChanged();
    window.glowAPI.autokick.offLog();
    el = null;
  },
};
