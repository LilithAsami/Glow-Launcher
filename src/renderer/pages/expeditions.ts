/**
 * Auto-Expeditions Page — Automated STW expedition management per account.
 *
 * Two sections:
 *  1. Auto-expedition config cards (toggle, reward types, run-now)
 *  2. Expedition browser panel (sent/completed on top, available below)
 *     with send / collect / abandon actions
 *  3. Activity log
 */

import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── Types ─────────────────────────────────────────────────────

interface ExpAccount {
  accountId: string;
  displayName: string;
  isMain: boolean;
}

interface ExpAccountConfig {
  isActive: boolean;
  rewardTypes: string[];
  lastActivity?: string;
  lastCollected?: number;
  lastSent?: number;
}

interface ExpData {
  accounts: Record<string, ExpAccountConfig>;
}

interface ExpeditionEntry {
  itemId: string;
  templateId: string;
  name: string;
  rewardType: string;
  power: number;
  duration: number;
  endTime: string | null;
  status: 'sent' | 'completed' | 'available';
  timeRemaining?: string;
}

interface LogEntry {
  accountId: string;
  displayName: string;
  type: 'info' | 'success' | 'error' | 'warn';
  message: string;
  timestamp: number;
}

// ── State ─────────────────────────────────────────────────────

let expData: ExpData = { accounts: {} };
let accounts: ExpAccount[] = [];
let loading = false;
let runningAccounts = new Set<string>();

// Expedition browser state
let browserAccountId = '';
let browserLoading = false;
let sentExps: ExpeditionEntry[] = [];
let completedExps: ExpeditionEntry[] = [];
let availableExps: ExpeditionEntry[] = [];
let slotsUsed = 0;
let slotsMax = 6;
let browserError = '';

// Send modal state
let sendModalOpen = false;
let sendType = 'Heroes';
let sendAmount = 1;
let sending = false;

// Action states
let collectingAll = false;
let abandoningIds = new Set<string>();

let logs: LogEntry[] = [];
const MAX_LOGS = 100;

const REWARD_TYPES = [
  { id: 'Heroes', label: 'Heroes' },
  { id: 'Survivors', label: 'Survivors' },
  { id: 'Supplies', label: 'Supplies' },
  { id: 'Resources', label: 'Resources' },
  { id: 'Traps', label: 'Traps' },
  { id: 'Weapons', label: 'Weapons' },
] as const;

// ── Helpers ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timeAgo(isoDate?: string): string {
  if (!isoDate) return 'Never';
  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function prettyName(templateId: string): string {
  return templateId
    .replace('Expedition:expedition_', '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function rewardIcon(type: string): string {
  const iconMap: Record<string, string> = {
    Heroes:    'assets/icons/stw/resources/voucher_generic_hero.png',
    Survivors:  'assets/icons/stw/resources/voucher_generic_worker.png',
    Supplies:   'assets/icons/stw/resources/supply.png',
    Resources:  'assets/icons/stw/resources/resources.png',
    Traps:      'assets/icons/stw/resources/voucher_generic_trap.png',
    Weapons:    'assets/icons/stw/resources/voucher_generic_ranged.png',
  };
  const src = iconMap[type];
  if (!src) return '';
  return `<img src="${src}" alt="${type}" width="18" height="18" style="object-fit:contain" />`;
}

function getMainAccount(): ExpAccount | undefined {
  return accounts.find((a) => a.isMain) || accounts[0];
}

// ── Data fetching ─────────────────────────────────────────────

async function reload(): Promise<void> {
  loading = true;
  draw();

  try {
    const res = await window.glowAPI.expeditions.getStatus();
    if (res.success) {
      expData = res.data;
      accounts = res.accounts;
    }
  } catch {}

  if (!browserAccountId) {
    const main = getMainAccount();
    if (main) browserAccountId = main.accountId;
  }

  loading = false;
  draw();

  if (browserAccountId && sentExps.length === 0 && completedExps.length === 0 && availableExps.length === 0) {
    await loadExpeditionList();
  }
}

async function loadExpeditionList(): Promise<void> {
  if (!browserAccountId) return;
  browserLoading = true;
  browserError = '';
  draw();

  try {
    const res = await window.glowAPI.expeditions.list(browserAccountId);
    if (res.success) {
      sentExps = res.sent || [];
      completedExps = res.completed || [];
      availableExps = res.available || [];
      slotsUsed = res.slots?.used || 0;
      slotsMax = res.slots?.max || 6;
    } else {
      browserError = res.error || 'Failed to load expeditions';
    }
  } catch (e: any) {
    browserError = e.message || 'Failed to load expeditions';
  }

  browserLoading = false;
  draw();
}

// ── Draw ──────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading && accounts.length === 0) {
    el.innerHTML = `
      <div class="autoexp-page">
        <div class="autoexp-header">
          <h1 class="page-title">Auto-Expeditions</h1>
          <p class="page-subtitle">Automated STW expedition management — collect rewards & send expeditions</p>
        </div>
        <div class="autoexp-loading"><div class="auth-spinner"></div></div>
      </div>`;
    return;
  }

  if (accounts.length === 0) {
    el.innerHTML = `
      <div class="autoexp-page">
        <div class="autoexp-header">
          <h1 class="page-title">Auto-Expeditions</h1>
          <p class="page-subtitle">Automated STW expedition management — collect rewards & send expeditions</p>
        </div>
        <div class="autoexp-empty"><p>No accounts found. Add an Epic Games account first.</p></div>
      </div>`;
    return;
  }

  const cardsHtml = accounts.map((acc) => renderAutoCard(acc)).join('');
  const browserHtml = renderBrowserPanel();
  const logsHtml = renderLogs();

  el.innerHTML = `
    <div class="autoexp-page">
      <div class="autoexp-header">
        <h1 class="page-title">Auto-Expeditions</h1>
        <p class="page-subtitle">Automated STW expedition management — collect rewards & send expeditions every hour</p>
      </div>

      <div class="autoexp-cards">${cardsHtml}</div>

      ${browserHtml}

      <div class="autoexp-log-section">
        <h3 class="autoexp-log-title">Activity Log</h3>
        <div class="autoexp-log-list">${logsHtml}</div>
      </div>
    </div>`;

  bindEvents();
}

// ── Auto-config card ──────────────────────────────────────────

function renderAutoCard(acc: ExpAccount): string {
  const cfg = expData.accounts[acc.accountId];
  const isActive = cfg?.isActive ?? false;
  const rewardTypes = cfg?.rewardTypes ?? [];
  const isRunning = runningAccounts.has(acc.accountId);
  const lastActivity = cfg?.lastActivity;
  const lastCollected = cfg?.lastCollected ?? 0;
  const lastSent = cfg?.lastSent ?? 0;

  const typeChips = REWARD_TYPES.map((rt) => {
    const selected = rewardTypes.includes(rt.id);
    return `<button class="autoexp-type-chip ${selected ? 'autoexp-type-chip--selected' : ''}"
              data-type-toggle="${acc.accountId}" data-type="${rt.id}"
              ${!isActive ? 'disabled' : ''}>${rt.label}</button>`;
  }).join('');

  return `
    <div class="autoexp-card ${isActive ? 'autoexp-card--active' : ''}" data-account="${acc.accountId}">
      <div class="autoexp-card-header">
        <div class="autoexp-card-identity">
          <div class="autoexp-avatar ${isActive ? '' : 'autoexp-avatar--off'}">
            <span>${acc.displayName.charAt(0).toUpperCase()}</span>
          </div>
          <div class="autoexp-card-name-wrap">
            <span class="autoexp-card-name">${esc(acc.displayName)}</span>
            <span class="autoexp-card-status ${isActive ? 'autoexp-status--on' : 'autoexp-status--off'}">
              ${isActive ? '● Active' : 'Disabled'}
            </span>
          </div>
        </div>
        <label class="autoexp-toggle">
          <input type="checkbox" class="autoexp-toggle-input" data-toggle="${acc.accountId}" ${isActive ? 'checked' : ''}>
          <span class="autoexp-toggle-slider"></span>
        </label>
      </div>
      ${isActive ? `
        <div class="autoexp-card-body">
          <div class="autoexp-types-section">
            <label class="autoexp-section-label">Reward Types</label>
            <div class="autoexp-types-grid">${typeChips}</div>
            ${rewardTypes.length === 0 ? '<p class="autoexp-types-hint">Select at least one reward type to send expeditions</p>' : ''}
          </div>
          <div class="autoexp-info-row">
            <div class="autoexp-info-item">
              <span class="autoexp-info-label">Last Run</span>
              <span class="autoexp-info-value">${timeAgo(lastActivity)}</span>
            </div>
            <div class="autoexp-info-item">
              <span class="autoexp-info-label">Last Collected</span>
              <span class="autoexp-info-value">${lastCollected}</span>
            </div>
            <div class="autoexp-info-item">
              <span class="autoexp-info-label">Last Sent</span>
              <span class="autoexp-info-value">${lastSent}</span>
            </div>
          </div>
          <button class="autoexp-run-btn" data-run="${acc.accountId}" ${isRunning ? 'disabled' : ''}>
            ${isRunning
              ? '<div class="autoexp-spinner"></div> Running...'
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Now'}
          </button>
        </div>
      ` : ''}
    </div>`;
}

// ── Expedition Browser Panel ──────────────────────────────────

function renderBrowserPanel(): string {
  const accOptions = accounts.map((a) =>
    `<option value="${a.accountId}" ${a.accountId === browserAccountId ? 'selected' : ''}>${esc(a.displayName)}</option>`
  ).join('');

  let content = '';

  if (browserLoading) {
    content = '<div class="expbr-loading"><div class="auth-spinner"></div></div>';
  } else if (browserError) {
    content = `<div class="expbr-error">${esc(browserError)}</div>`;
  } else {
    content = renderExpeditionList();
  }

  const sendModalHtml = sendModalOpen ? renderSendModal() : '';

  return `
    <div class="expbr-panel">
      <div class="expbr-toolbar">
        <h3 class="expbr-title">Expedition Browser</h3>
        <div class="expbr-toolbar-right">
          <select class="expbr-account-select" data-browser-account>${accOptions}</select>
          <button class="expbr-action-btn expbr-btn-refresh" data-browser-refresh title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
          <button class="expbr-action-btn expbr-btn-send" data-open-send title="Send Expeditions">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send
          </button>
          <button class="expbr-action-btn expbr-btn-collect" data-collect-all ${collectingAll || completedExps.length === 0 ? 'disabled' : ''} title="Collect All Completed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            ${collectingAll ? 'Collecting...' : `Collect (${completedExps.length})`}
          </button>
        </div>
      </div>

      <div class="expbr-slots">
        <span class="expbr-slots-label">Slots</span>
        <div class="expbr-slots-bar">
          <div class="expbr-slots-fill" style="width: ${Math.round((slotsUsed / slotsMax) * 100)}%"></div>
        </div>
        <span class="expbr-slots-count">${slotsUsed}/${slotsMax}</span>
      </div>

      <div class="expbr-list-container">
        ${content}
      </div>

      ${sendModalHtml}
    </div>`;
}

function renderExpeditionList(): string {
  const hasAny = sentExps.length > 0 || completedExps.length > 0 || availableExps.length > 0;

  if (!hasAny) {
    return '<div class="expbr-empty">No expeditions found. Try refreshing or check your account.</div>';
  }

  let html = '';

  // Completed (top) — ready to collect
  if (completedExps.length > 0) {
    html += `<div class="expbr-section-header expbr-sh-completed">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      Completed (${completedExps.length})
    </div>`;
    for (const exp of completedExps) html += renderExpRow(exp, 'completed');
  }

  // Sent (active, in progress)
  if (sentExps.length > 0) {
    html += `<div class="expbr-section-header expbr-sh-sent">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      In Progress (${sentExps.length})
    </div>`;
    for (const exp of sentExps) html += renderExpRow(exp, 'sent');
  }

  // Available
  if (availableExps.length > 0) {
    html += `<div class="expbr-section-header expbr-sh-available">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      Available (${availableExps.length})
    </div>`;
    for (const exp of availableExps) html += renderExpRow(exp, 'available');
  }

  return html;
}

function renderExpRow(exp: ExpeditionEntry, section: 'completed' | 'sent' | 'available'): string {
  const isAbandoning = abandoningIds.has(exp.itemId);
  const displayName = esc(exp.name || prettyName(exp.templateId));
  const icon = rewardIcon(exp.rewardType);

  let statusHtml = '';
  let actionsHtml = '';

  if (section === 'completed') {
    statusHtml = '<span class="expbr-badge expbr-badge-completed">Ready</span>';
    actionsHtml = `
      <button class="expbr-row-btn expbr-row-collect" data-collect-one="${exp.itemId}" title="Collect">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>`;
  } else if (section === 'sent') {
    statusHtml = `<span class="expbr-badge expbr-badge-sent">${esc(exp.timeRemaining || '')}</span>`;
    actionsHtml = `
      <button class="expbr-row-btn expbr-row-abandon" data-abandon="${exp.itemId}" ${isAbandoning ? 'disabled' : ''} title="Abandon">
        ${isAbandoning
          ? '<div class="autoexp-spinner" style="width:10px;height:10px"></div>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}
      </button>`;
  } else {
    statusHtml = `<span class="expbr-badge expbr-badge-available">PL ${exp.power}</span>`;
    actionsHtml = '';
  }

  return `
    <div class="expbr-row expbr-row--${section}">
      <span class="expbr-row-icon">${icon}</span>
      <span class="expbr-row-type">${esc(exp.rewardType)}</span>
      <span class="expbr-row-name">${displayName}</span>
      ${statusHtml}
      <div class="expbr-row-actions">${actionsHtml}</div>
    </div>`;
}

// ── Send Modal ────────────────────────────────────────────────

function renderSendModal(): string {
  const freeSlots = Math.max(0, slotsMax - slotsUsed);
  const maxSend = Math.min(6, freeSlots);

  const typeOptions = REWARD_TYPES.map((rt) =>
    `<button class="expbr-send-type ${sendType === rt.id ? 'expbr-send-type--active' : ''}"
            data-send-type="${rt.id}">${rt.label}</button>`
  ).join('');

  const amountOptions = maxSend > 0
    ? Array.from({ length: maxSend }, (_, i) => i + 1)
        .map((n) => `<option value="${n}" ${sendAmount === n ? 'selected' : ''}>${n}</option>`)
        .join('')
    : '<option disabled>0</option>';

  return `
    <div class="expbr-modal-overlay" data-close-send-overlay>
      <div class="expbr-modal">
        <div class="expbr-modal-header">
          <h4>Send Expeditions</h4>
          <button class="expbr-modal-close" data-close-send>&times;</button>
        </div>
        <div class="expbr-modal-body">
          <label class="autoexp-section-label">Expedition Type</label>
          <div class="expbr-send-types">${typeOptions}</div>

          <label class="autoexp-section-label" style="margin-top:12px">
            Amount ${freeSlots === 0 ? '<span style="color:var(--danger,#ff4757)">(No slots available)</span>' : ''}
          </label>
          <select class="expbr-send-amount" data-send-amount ${freeSlots === 0 ? 'disabled' : ''}>${amountOptions}</select>
        </div>
        <div class="expbr-modal-footer">
          <button class="expbr-modal-cancel" data-close-send>Cancel</button>
          <button class="expbr-modal-confirm" data-confirm-send ${sending || freeSlots === 0 ? 'disabled' : ''}>
            ${sending ? '<div class="autoexp-spinner"></div> Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>`;
}

// ── Logs ──────────────────────────────────────────────────────

function renderLogs(): string {
  const accountLogs = logs.slice(-40).reverse();
  if (accountLogs.length === 0) {
    return '<p class="autoexp-log-empty">No activity yet. Logs will appear here when expeditions run.</p>';
  }
  return accountLogs.map((l) => `
    <div class="autoexp-log-entry autoexp-log-${l.type}">
      <span class="autoexp-log-dot"></span>
      <span class="autoexp-log-name">${esc(l.displayName)}</span>
      <span class="autoexp-log-msg">${esc(l.message)}</span>
      <span class="autoexp-log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
    </div>
  `).join('');
}

// ── Events ────────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // Toggle activation
  el.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((input) => {
    input.addEventListener('change', async () => {
      const accountId = input.dataset.toggle!;
      const active = input.checked;
      const cfg = expData.accounts[accountId];
      const rewardTypes = cfg?.rewardTypes ?? [];
      await window.glowAPI.expeditions.toggle(accountId, active, rewardTypes);
      await reload();
    });
  });

  // Reward type toggle chips
  el.querySelectorAll<HTMLElement>('[data-type-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.typeToggle!;
      const type = btn.dataset.type!;
      const cfg = expData.accounts[accountId];
      if (!cfg) return;
      const current = [...(cfg.rewardTypes || [])];
      const idx = current.indexOf(type);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(type);
      await window.glowAPI.expeditions.updateConfig(accountId, { rewardTypes: current });
      await reload();
    });
  });

  // Run now button
  el.querySelectorAll<HTMLElement>('[data-run]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.run!;
      if (runningAccounts.has(accountId)) return;
      runningAccounts.add(accountId);
      draw();
      try { await window.glowAPI.expeditions.runCycle(accountId); } catch {}
      runningAccounts.delete(accountId);
      await reload();
      await loadExpeditionList();
    });
  });

  // Browser: account select
  const accSelect = el.querySelector<HTMLSelectElement>('[data-browser-account]');
  if (accSelect) {
    accSelect.addEventListener('change', () => {
      browserAccountId = accSelect.value;
      sentExps = [];
      completedExps = [];
      availableExps = [];
      loadExpeditionList();
    });
  }

  // Browser: refresh
  el.querySelector('[data-browser-refresh]')?.addEventListener('click', () => loadExpeditionList());

  // Browser: open send modal
  el.querySelector('[data-open-send]')?.addEventListener('click', () => {
    sendModalOpen = true;
    sendType = 'Heroes';
    sendAmount = 1;
    draw();
  });

  // Send modal: close overlay
  el.querySelector('[data-close-send-overlay]')?.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).hasAttribute('data-close-send-overlay')) {
      sendModalOpen = false;
      draw();
    }
  });

  // Send modal: close buttons
  el.querySelectorAll('[data-close-send]').forEach((e) => {
    e.addEventListener('click', () => { sendModalOpen = false; draw(); });
  });

  // Send modal: type buttons
  el.querySelectorAll<HTMLElement>('[data-send-type]').forEach((btn) => {
    btn.addEventListener('click', () => { sendType = btn.dataset.sendType!; draw(); });
  });

  // Send modal: amount
  const amountSel = el.querySelector<HTMLSelectElement>('[data-send-amount]');
  if (amountSel) amountSel.addEventListener('change', () => { sendAmount = parseInt(amountSel.value, 10) || 1; });

  // Send modal: confirm
  el.querySelector('[data-confirm-send]')?.addEventListener('click', async () => {
    if (sending || !browserAccountId) return;
    sending = true;
    window.glowAPI.discordRpc.setDetail('Sending expeditions...');
    draw();
    try {
      const res = await window.glowAPI.expeditions.send(browserAccountId, [sendType], sendAmount);
      const acc = accounts.find((a) => a.accountId === browserAccountId);
      const name = acc?.displayName || 'Unknown';
      if (res.success) {
        const total = res.summary?.totalSent ?? res.sent ?? 0;
        logs.push({ accountId: browserAccountId, displayName: name, type: 'success', message: `Sent ${total} ${sendType} expedition(s)`, timestamp: Date.now() });
      } else {
        logs.push({ accountId: browserAccountId, displayName: name, type: 'error', message: res.error || 'Send failed', timestamp: Date.now() });
      }
    } catch (e: any) {
      logs.push({ accountId: browserAccountId, displayName: 'Error', type: 'error', message: e.message, timestamp: Date.now() });
    }
    sending = false;
    sendModalOpen = false;
    window.glowAPI.discordRpc.setDetail(null);
    await loadExpeditionList();
  });

  // Collect all completed
  el.querySelector('[data-collect-all]')?.addEventListener('click', async () => {
    if (collectingAll || !browserAccountId) return;
    collectingAll = true;
    window.glowAPI.discordRpc.setDetail('Collecting expeditions...');
    draw();
    try {
      const res = await window.glowAPI.expeditions.collect(browserAccountId);
      const acc = accounts.find((a) => a.accountId === browserAccountId);
      const name = acc?.displayName || 'Unknown';
      if (res.success) {
        logs.push({ accountId: browserAccountId, displayName: name, type: 'success', message: `Collected ${res.collected ?? 0} expedition(s)`, timestamp: Date.now() });
      } else {
        logs.push({ accountId: browserAccountId, displayName: name, type: 'error', message: res.error || 'Collect failed', timestamp: Date.now() });
      }
    } catch {}
    collectingAll = false;
    window.glowAPI.discordRpc.setDetail(null);
    await loadExpeditionList();
  });

  // Collect single
  el.querySelectorAll<HTMLElement>('[data-collect-one]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.collectOne!;
      if (!browserAccountId) return;
      btn.setAttribute('disabled', 'true');
      try { await window.glowAPI.expeditions.collect(browserAccountId, [id]); } catch {}
      await loadExpeditionList();
    });
  });

  // Abandon
  el.querySelectorAll<HTMLElement>('[data-abandon]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.abandon!;
      if (abandoningIds.has(id) || !browserAccountId) return;
      abandoningIds.add(id);
      draw();
      try {
        const res = await window.glowAPI.expeditions.abandon(browserAccountId, [id]);
        const acc = accounts.find((a) => a.accountId === browserAccountId);
        const name = acc?.displayName || 'Unknown';
        if (res.success) {
          logs.push({ accountId: browserAccountId, displayName: name, type: 'info', message: 'Abandoned expedition', timestamp: Date.now() });
        }
      } catch {}
      abandoningIds.delete(id);
      await loadExpeditionList();
    });
  });
}

// ── IPC listeners ─────────────────────────────────────────────

function onLog(entry: LogEntry): void {
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
  draw();
}

function onDataChanged(): void { reload(); }

// ── Page Definition ───────────────────────────────────────────

export const expeditionsPage: PageDefinition = {
  id: 'expeditions',
  label: 'Expeditions',
  icon: `<img src="assets/icons/fnui/Automated/expedition.png" alt="Status" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 26,
  async render(container) {
    el = container;
    logs = [];
    runningAccounts.clear();
    abandoningIds.clear();
    sentExps = [];
    completedExps = [];
    availableExps = [];
    browserAccountId = '';
    sendModalOpen = false;
    sending = false;
    collectingAll = false;
    browserError = '';

    window.glowAPI.expeditions.onLog(onLog);
    window.glowAPI.expeditions.onDataChanged(onDataChanged);

    await reload();
  },
  cleanup() {
    window.glowAPI.expeditions.offLog();
    window.glowAPI.expeditions.offDataChanged();
    el = null;
  },
};
