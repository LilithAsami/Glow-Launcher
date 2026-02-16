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
      <h1 class="page-title">AutoKick</h1>
      <p class="page-subtitle">Automatic STW mission monitor — per-account configuration</p>

      <div class="ak-cards">${cardsHtml}</div>

      <div class="ak-log-section">
        <h3 class="ak-log-title">Activity Log</h3>
        <div class="ak-log-list" id="ak-log-list">${logsHtml}</div>
      </div>
    </div>`;

  bindEvents();
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
}

// ─── IPC listeners ───────────────────────────────────────────

function onStatusUpdate(newStatuses: AutoKickStatus[]): void {
  for (const s of newStatuses) {
    const idx = statuses.findIndex((x) => x.accountId === s.accountId);
    if (idx >= 0) statuses[idx] = s;
    else statuses.push(s);
  }
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
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>`,
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
