/**
 * Taxi Page — Compact card layout with cosmetic picker modals.
 */

import type {
  PageDefinition,
  TaxiAccountStatus,
  TaxiLogEntry,
  TaxiAccountConfig,
} from '../../shared/types';

let el: HTMLElement | null = null;
let taxiList: TaxiAccountStatus[] = [];
let loading = false;
let logs: TaxiLogEntry[] = [];
let whitelistSearch: Record<string, string> = {};
let whitelistResults: Record<string, { accountId: string; displayName: string; platform?: string }[]> = {};
let modalAccountId: string | null = null;
let activatingAccounts = new Set<string>();
let whitelistModalAccountId: string | null = null;
let cooldownAccounts = new Map<string, number>();
let cooldownInterval: ReturnType<typeof setInterval> | null = null;
let avatars: Record<string, string> = {};

// Cosmetic picker state
let cosmeticPickerForAccount: string | null = null;
let cosmeticPickerType: 'skin' | 'emote' | null = null;
let cosmeticSearch = '';
let cosmeticResults: { id: string; name: string; rarity: string; imageUrl: string }[] = [];
let cosmeticLoading = false;
let cosmeticCache: Record<string, { id: string; name: string; rarity: string; imageUrl: string }[]> = {};
let cosmeticCacheExpiry: Record<string, number> = {};

// Status editor state
let statusEditorAccountId: string | null = null;

const MAX_LOGS_PER_ACCOUNT = 30;

const RARITY_COLORS: Record<string, string> = {
  legendary: '#f0a030', epic: '#b845e6', rare: '#3c9cff', uncommon: '#69bb1e', common: '#808080',
};

// ─── Fetch ──────────────────────────────────────────────

async function fetchTaxis(): Promise<void> {
  loading = true;
  draw();
  try {
    const [taxiRes, avatarRes] = await Promise.all([
      window.glowAPI.taxi.getAll(),
      window.glowAPI.taxi.getAvatars(),
    ]);
    if (taxiRes.success) {
      taxiList = taxiRes.statuses;
      for (const s of taxiList) { if (s.isConnected) activatingAccounts.delete(s.accountId); }
    }
    if (avatarRes.success) avatars = avatarRes.avatars;
  } catch {}
  loading = false;
  draw();
}

// ─── Cosmetic data ──────────────────────────────────────

async function fetchCosmetics(type: 'skin' | 'emote'): Promise<void> {
  const key = type;
  if (cosmeticCache[key] && Date.now() < (cosmeticCacheExpiry[key] || 0)) return;
  cosmeticLoading = true;
  try {
    const res = await fetch('https://fortnite-api.com/v2/cosmetics?language=en', { signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    if (data?.status === 200 && data?.data?.br) {
      const typeMap: Record<string, string> = { skin: 'outfit', emote: 'emote' };
      const items = (data.data.br as any[])
        .filter((i: any) => i.type?.value === typeMap[type])
        .map((i: any) => ({
          id: i.id,
          name: i.name || i.id,
          rarity: (i.rarity?.value || 'common').toLowerCase(),
          imageUrl: i.images?.smallIcon || i.images?.icon || '',
        }))
        .filter((i: any) => i.id && i.name)
        .sort((a: any, b: any) => {
          const ro: Record<string, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
          const ra = ro[a.rarity] ?? 99, rb = ro[b.rarity] ?? 99;
          return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
        });
      cosmeticCache[key] = items;
      cosmeticCacheExpiry[key] = Date.now() + 30 * 60 * 1000;
    }
  } catch {}
  cosmeticLoading = false;
}

function filterCosmetics(): { id: string; name: string; rarity: string; imageUrl: string }[] {
  const type = cosmeticPickerType;
  if (!type || !cosmeticSearch.trim()) return [];
  const all = cosmeticCache[type] || [];
  const q = cosmeticSearch.toLowerCase();
  return all.filter((i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)).slice(0, 80);
}

// ─── Draw ───────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading && taxiList.length === 0) {
    el.innerHTML = `<div class="taxi-page"><h1 class="page-title">Taxi</h1><p class="page-subtitle">Fortnite Taxi Bot System</p><div class="taxi-loading"><div class="auth-spinner"></div></div></div>`;
    return;
  }
  if (taxiList.length === 0) {
    el.innerHTML = `<div class="taxi-page"><h1 class="page-title">Taxi</h1><p class="page-subtitle">Fortnite Taxi Bot System</p><div class="taxi-empty"><p>No accounts found. Add accounts first.</p></div></div>`;
    return;
  }

  el.innerHTML = `
    <div class="taxi-page">
      <h1 class="page-title">Taxi</h1>
      <p class="page-subtitle">Fortnite Taxi Bot System</p>
      <div class="taxi-grid">${taxiList.map((s) => renderCard(s)).join('')}</div>
    </div>
    ${modalAccountId ? renderWarningModal(modalAccountId) : ''}
    ${whitelistModalAccountId ? renderWhitelistModal(whitelistModalAccountId) : ''}
    ${statusEditorAccountId ? renderStatusModal(statusEditorAccountId) : ''}
    ${cosmeticPickerForAccount ? renderCosmeticPicker() : ''}
  `;
  bindEvents();
}

// ─── Card ───────────────────────────────────────────────

function renderCard(s: TaxiAccountStatus): string {
  const cfg = s.config;
  const active = cfg.isActive;
  const accepted = cfg.responsabilityAccepted;
  const connected = s.isConnected;
  const isActivating = activatingAccounts.has(s.accountId);
  const cdUntil = cooldownAccounts.get(s.accountId) || 0;
  const isCooldown = Date.now() < cdUntil;
  const cdSec = isCooldown ? Math.ceil((cdUntil - Date.now()) / 1000) : 0;

  let badge: string, badgeClass: string;
  if (isCooldown) { badge = `Cooldown ${cdSec}s`; badgeClass = 'cooldown'; }
  else if (connected && s.isOccupied) { badge = `Occupied (${s.queue.length})`; badgeClass = 'occupied'; }
  else if (connected) { badge = 'Online'; badgeClass = 'connected'; }
  else if (isActivating || (active && !connected)) { badge = 'Connecting...'; badgeClass = 'activating'; }
  else { badge = 'Offline'; badgeClass = 'offline'; }

  const av = avatars[s.accountId] || '';
  const skinImg = cfg.skin ? `https://fortnite-api.com/images/cosmetics/br/${esc(cfg.skin)}/smallicon.png` : '';
  const emoteImg = cfg.emote ? `https://fortnite-api.com/images/cosmetics/br/${esc(cfg.emote)}/smallicon.png` : '';
  const accountLogs = logs.filter((l) => l.accountId === s.accountId).slice(-6);

  return `
    <div class="tx-card ${active ? 'tx-active' : ''}" data-account="${s.accountId}">
      <!-- Header -->
      <div class="tx-head">
        <div class="tx-head-left">
          ${av ? `<img class="tx-av" src="${escAttr(av)}" alt="" onerror="this.style.display='none'" />` : ''}
          <div>
            <div class="tx-name">${esc(s.displayName)}</div>
            <span class="tx-badge tx-badge--${badgeClass}">${badge}</span>
          </div>
        </div>
        <div class="tx-head-right">
          ${!accepted
            ? `<button class="tx-btn-accept" data-accept="${s.accountId}">Accept Risk</button>`
            : `<label class="tx-toggle" title="${active ? 'Deactivate' : 'Activate'}">
                <input type="checkbox" class="tx-toggle-in" data-taxi-toggle="${s.accountId}" ${active || isActivating ? 'checked' : ''} ${isActivating || isCooldown ? 'disabled' : ''}>
                <span class="tx-toggle-track"></span>
              </label>`
          }
        </div>
      </div>

      <!-- Body -->
      <div class="tx-body">
        <!-- Row 1: Cosmetics + Settings -->
        <div class="tx-row">
          <!-- Skin -->
          <button class="tx-cosmetic" data-pick-skin="${s.accountId}" title="Change Skin">
            <div class="tx-cosmetic-img">
              ${skinImg ? `<img src="${skinImg}" alt="" onerror="this.style.display='none'" />` : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`}
            </div>
            <div class="tx-cosmetic-info">
              <span class="tx-cosmetic-label">Skin</span>
              <span class="tx-cosmetic-id">${cfg.skin ? esc(cfg.skin) : 'None'}</span>
            </div>
          </button>

          <!-- Emote -->
          <button class="tx-cosmetic" data-pick-emote="${s.accountId}" title="Change Emote">
            <div class="tx-cosmetic-img">
              ${emoteImg ? `<img src="${emoteImg}" alt="" onerror="this.style.display='none'" />` : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`}
            </div>
            <div class="tx-cosmetic-info">
              <span class="tx-cosmetic-label">Emote</span>
              <span class="tx-cosmetic-id">${cfg.emote ? esc(cfg.emote) : 'None'}</span>
            </div>
          </button>

          <!-- Settings cluster -->
          <div class="tx-settings-group">
            <div class="tx-mini-field">
              <span class="tx-mini-label">Time</span>
              <input type="number" class="tx-mini-input" data-cfg-tiempoParaIrse="${s.accountId}" value="${cfg.tiempoParaIrse}" min="1" max="30" />
              <span class="tx-mini-unit">min</span>
            </div>
            <div class="tx-mini-field">
              <span class="tx-mini-label">Level</span>
              <input type="number" class="tx-mini-input" data-cfg-level="${s.accountId}" value="${cfg.level}" min="1" max="9999" />
            </div>
            <div class="tx-mini-field">
              <span class="tx-mini-label">Power</span>
              <input type="number" class="tx-mini-input" data-cfg-powerLevel="${s.accountId}" value="${cfg.powerLevel}" min="-2147483647" max="2147483647" />
              ${(cfg.powerLevel < 1 || cfg.powerLevel > 288) ? `<span class="tx-power-warn" title="Fuera del rango calibrado (1-288), el poder puede no ser exacto">⚠ uncalibrated</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Row 2: Privacy + Status + Actions -->
        <div class="tx-row tx-row-bottom">
          <div class="tx-privacy-group">
            <select class="tx-mini-select tx-privacy-sel" data-cfg-isPrivate="${s.accountId}">
              <option value="false" ${!cfg.isPrivate ? 'selected' : ''}>Public</option>
              <option value="true" ${cfg.isPrivate ? 'selected' : ''}>Private</option>
            </select>
            ${cfg.isPrivate ? `<button class="tx-btn-wl" data-wl-modal="${s.accountId}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
              WL (${cfg.whitelist.length})
            </button>` : ''}
          </div>

          <button class="tx-btn-status" data-edit-status="${s.accountId}" title="Edit status messages">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Status
          </button>

          <button class="tx-btn-save" data-save="${s.accountId}">Save</button>
        </div>

        <!-- Queue -->
        ${s.queue.length > 0 ? `
          <div class="tx-queue">
            <span class="tx-section-label">Queue (${s.queue.length})</span>
            ${s.queue.map((q, i) => `<span class="tx-queue-tag">${i + 1}. ${esc(q.displayName)}</span>`).join('')}
          </div>` : ''}

        <!-- Logs -->
        ${accountLogs.length > 0 ? `
          <div class="tx-logs">
            ${accountLogs.slice().reverse().map((l) => `
              <div class="tx-log tx-log--${l.type}">
                <span class="tx-log-t">${new Date(l.timestamp).toLocaleTimeString()}</span>
                ${esc(l.message)}
              </div>`).join('')}
          </div>` : ''}
      </div>
    </div>`;
}

// ─── Warning Modal ──────────────────────────────────────

function renderWarningModal(accountId: string): string {
  const acc = taxiList.find((s) => s.accountId === accountId);
  return `
    <div class="taxi-modal-overlay" data-modal-overlay>
      <div class="taxi-modal">
        <div class="taxi-modal-header">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffa726" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <h2>Matchmaking Ban Warning</h2>
        </div>
        <div class="taxi-modal-body">
          <p><strong>Account:</strong> ${esc(acc?.displayName || accountId)}</p>
          <div class="taxi-modal-warning">
            <p>Using the taxi bot with <strong>low stats</strong> may result in a <strong>permanent matchmaking ban</strong>.</p>
            <p>By accepting, you acknowledge all risks and that the developer is <strong>not responsible</strong> for any bans.</p>
          </div>
          <label class="taxi-modal-check"><input type="checkbox" id="taxi-modal-checkbox" /><span>I understand and accept all risks</span></label>
        </div>
        <div class="taxi-modal-footer">
          <button class="btn taxi-modal-cancel" data-modal-cancel>Cancel</button>
          <button class="btn btn-accent taxi-modal-confirm" data-modal-confirm disabled>Accept</button>
        </div>
      </div>
    </div>`;
}

// ─── Status Editor Modal ────────────────────────────────

function renderStatusModal(accountId: string): string {
  const acc = taxiList.find((s) => s.accountId === accountId);
  if (!acc) return '';
  const cfg = acc.config;
  return `
    <div class="taxi-modal-overlay" data-status-overlay>
      <div class="taxi-modal tx-status-modal">
        <div class="taxi-modal-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <h2>Status Messages — ${esc(acc.displayName)}</h2>
        </div>
        <div class="taxi-modal-body">
          <div class="tx-status-field">
            <label class="tx-status-label">Status (Free)</label>
            <input type="text" class="taxi-input" id="tx-status-free" value="${escAttr(cfg.statusLibre)}" maxlength="200" placeholder="Status when free..." />
          </div>
          <div class="tx-status-field">
            <label class="tx-status-label">Status (Busy) <small>Use {queue} for queue count</small></label>
            <input type="text" class="taxi-input" id="tx-status-busy" value="${escAttr(cfg.statusOcupado)}" maxlength="200" placeholder="Status when busy..." />
          </div>
        </div>
        <div class="taxi-modal-footer">
          <button class="btn taxi-modal-cancel" data-status-cancel>Cancel</button>
          <button class="btn btn-accent" data-status-save="${accountId}">Save</button>
        </div>
      </div>
    </div>`;
}

// ─── Cosmetic Picker Modal ──────────────────────────────

function renderCosmeticPicker(): string {
  const typeLabel = cosmeticPickerType === 'skin' ? 'Skin' : 'Emote';
  const filtered = filterCosmetics();

  let listHtml: string;
  if (cosmeticLoading) {
    listHtml = '<div class="tx-pick-loading"><div class="auth-spinner"></div><p>Loading...</p></div>';
  } else if (!cosmeticSearch.trim()) {
    listHtml = '<div class="tx-pick-empty"><p>Type a name to search</p></div>';
  } else if (filtered.length === 0) {
    listHtml = '<div class="tx-pick-empty"><p>No results found</p></div>';
  } else {
    listHtml = filtered.map((item) => {
      const rc = RARITY_COLORS[item.rarity] || '#808080';
      return `
        <div class="tx-pick-item" data-cosmetic-id="${esc(item.id)}" style="--item-accent:${rc}">
          <div class="tx-pick-item-img">
            ${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="" onerror="this.style.display='none'" />` : ''}
          </div>
          <span class="tx-pick-item-name">${esc(item.name)}</span>
          <span class="tx-pick-item-rarity" style="color:${rc}">${esc(item.rarity)}</span>
        </div>`;
    }).join('');
  }

  return `
    <div class="taxi-modal-overlay" data-cosmetic-overlay>
      <div class="taxi-modal tx-pick-modal">
        <div class="taxi-modal-header">
          <h2>Select ${typeLabel}</h2>
          <button class="tx-pick-close" data-cosmetic-close>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="tx-pick-search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="tx-pick-search" id="tx-pick-search" placeholder="Search ${typeLabel.toLowerCase()}s..." value="${esc(cosmeticSearch)}" />
        </div>
        <div class="tx-pick-grid" id="tx-pick-grid">${listHtml}</div>
      </div>
    </div>`;
}

// ─── Whitelist Modal ────────────────────────────────────

function renderWhitelistModal(accountId: string): string {
  const acc = taxiList.find((s) => s.accountId === accountId);
  if (!acc) return '';
  const cfg = acc.config;
  const sv = whitelistSearch[accountId] || '';
  const results = whitelistResults[accountId] || [];

  return `
    <div class="taxi-modal-overlay" data-wl-modal-overlay>
      <div class="taxi-modal taxi-wl-modal">
        <div class="taxi-modal-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
          <h2>Whitelist — ${esc(acc.displayName)}</h2>
        </div>
        <div class="taxi-modal-body">
          <div class="taxi-wl-search-row">
            <input type="text" class="taxi-input" data-wl-search="${accountId}" value="${escAttr(sv)}" placeholder="Search by name or Account ID..." />
            <button class="taxi-btn-small" data-wl-search-btn="${accountId}">Search</button>
          </div>
          ${results.length > 0 ? `<div class="taxi-wl-results">${results.map((r) => `
            <div class="taxi-wl-result">
              <div class="taxi-wl-result-info">
                <span>${esc(r.displayName)} <small>(${r.accountId.slice(0, 8)}...)</small></span>
                ${r.platform ? `<span class="taxi-wl-platform taxi-wl-platform--${r.platform.toLowerCase()}">${esc(r.platform)}</span>` : ''}
              </div>
              <button class="taxi-btn-small taxi-btn-add" data-wl-add="${accountId}" data-target-id="${r.accountId}" data-target-name="${escAttr(r.displayName)}">Add</button>
            </div>`).join('')}</div>` : ''}
          <div class="taxi-wl-list-section">
            <span class="taxi-field-label">Whitelisted (${cfg.whitelist.length})</span>
            <div class="taxi-wl-list">
              ${cfg.whitelist.length === 0 ? '<div class="taxi-wl-empty">No whitelisted accounts</div>' : ''}
              ${cfg.whitelist.map((w) => `<div class="taxi-wl-entry"><span>${esc(w.displayName)} <small>(${w.accountId.slice(0, 12)}...)</small></span><button class="taxi-btn-small taxi-btn-remove" data-wl-remove="${accountId}" data-target-id="${w.accountId}">Remove</button></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="taxi-modal-footer"><button class="btn taxi-modal-cancel" data-wl-modal-close>Close</button></div>
      </div>
    </div>`;
}

// ─── Events ─────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // Toggle activation
  el.querySelectorAll('[data-taxi-toggle]').forEach((input) => {
    input.addEventListener('change', async () => {
      const accountId = (input as HTMLInputElement).dataset.taxiToggle!;
      const checked = (input as HTMLInputElement).checked;
      if (checked) {
        const cd = cooldownAccounts.get(accountId) || 0;
        if (Date.now() < cd) { (input as HTMLInputElement).checked = false; return; }
        activatingAccounts.add(accountId);
        draw();
        await saveConfig(accountId);
        const result = await window.glowAPI.taxi.activate(accountId);
        if (!result.success) { activatingAccounts.delete(accountId); showCardError(accountId, result.error || 'Failed'); draw(); }
      } else {
        activatingAccounts.delete(accountId);
        await window.glowAPI.taxi.deactivate(accountId);
        cooldownAccounts.set(accountId, Date.now() + 10_000);
        startCooldownTicker();
        draw();
      }
    });
  });

  // Accept responsibility
  el.querySelectorAll('[data-accept]').forEach((b) => { b.addEventListener('click', () => { modalAccountId = (b as HTMLElement).dataset.accept!; draw(); }); });
  el.querySelector('[data-modal-overlay]')?.addEventListener('click', (e) => { if ((e.target as HTMLElement).hasAttribute('data-modal-overlay')) { modalAccountId = null; draw(); } });
  el.querySelector('[data-modal-cancel]')?.addEventListener('click', () => { modalAccountId = null; draw(); });
  const chk = el.querySelector('#taxi-modal-checkbox') as HTMLInputElement;
  const cfmBtn = el.querySelector('[data-modal-confirm]') as HTMLButtonElement;
  if (chk && cfmBtn) chk.addEventListener('change', () => { cfmBtn.disabled = !chk.checked; });
  cfmBtn?.addEventListener('click', async () => { if (!modalAccountId) return; await window.glowAPI.taxi.acceptResponsibility(modalAccountId); modalAccountId = null; await fetchTaxis(); });

  // Save config
  el.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const accountId = (btn as HTMLElement).dataset.save!;
      (btn as HTMLButtonElement).disabled = true;
      (btn as HTMLButtonElement).textContent = 'Saving...';
      await saveConfig(accountId);
      (btn as HTMLButtonElement).textContent = '✓ Saved';
      setTimeout(() => { (btn as HTMLButtonElement).disabled = false; (btn as HTMLButtonElement).textContent = 'Save'; }, 1500);
    });
  });

  // Status editor
  el.querySelectorAll('[data-edit-status]').forEach((b) => { b.addEventListener('click', () => { statusEditorAccountId = (b as HTMLElement).dataset.editStatus!; draw(); }); });
  el.querySelector('[data-status-overlay]')?.addEventListener('click', (e) => { if ((e.target as HTMLElement).hasAttribute('data-status-overlay')) { statusEditorAccountId = null; draw(); } });
  el.querySelector('[data-status-cancel]')?.addEventListener('click', () => { statusEditorAccountId = null; draw(); });
  el.querySelectorAll('[data-status-save]').forEach((b) => {
    b.addEventListener('click', async () => {
      const accId = (b as HTMLElement).dataset.statusSave!;
      const free = (el!.querySelector('#tx-status-free') as HTMLInputElement)?.value || '';
      const busy = (el!.querySelector('#tx-status-busy') as HTMLInputElement)?.value || '';
      await window.glowAPI.taxi.updateConfig(accId, { statusLibre: free, statusOcupado: busy });
      const acc = taxiList.find((s) => s.accountId === accId);
      if (acc) { acc.config.statusLibre = free; acc.config.statusOcupado = busy; }
      statusEditorAccountId = null;
      draw();
    });
  });

  // Cosmetic picker: open
  el.querySelectorAll('[data-pick-skin]').forEach((b) => {
    b.addEventListener('click', () => {
      cosmeticPickerForAccount = (b as HTMLElement).dataset.pickSkin!;
      cosmeticPickerType = 'skin';
      cosmeticSearch = '';
      cosmeticResults = [];
      draw();
      fetchCosmetics('skin').then(() => { if (cosmeticPickerType === 'skin') draw(); });
    });
  });
  el.querySelectorAll('[data-pick-emote]').forEach((b) => {
    b.addEventListener('click', () => {
      cosmeticPickerForAccount = (b as HTMLElement).dataset.pickEmote!;
      cosmeticPickerType = 'emote';
      cosmeticSearch = '';
      cosmeticResults = [];
      draw();
      fetchCosmetics('emote').then(() => { if (cosmeticPickerType === 'emote') draw(); });
    });
  });

  // Cosmetic picker: close
  el.querySelector('[data-cosmetic-overlay]')?.addEventListener('click', (e) => { if ((e.target as HTMLElement).hasAttribute('data-cosmetic-overlay')) { cosmeticPickerForAccount = null; cosmeticPickerType = null; draw(); } });
  el.querySelector('[data-cosmetic-close]')?.addEventListener('click', () => { cosmeticPickerForAccount = null; cosmeticPickerType = null; draw(); });

  // Cosmetic picker: search
  const pickSearch = el.querySelector('#tx-pick-search') as HTMLInputElement;
  let pickDebounce: ReturnType<typeof setTimeout>;
  pickSearch?.addEventListener('input', () => {
    clearTimeout(pickDebounce);
    pickDebounce = setTimeout(() => {
      cosmeticSearch = pickSearch.value;
      renderPickerGrid();
    }, 200);
  });

  // Cosmetic picker: select item
  el.querySelectorAll('.tx-pick-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = (item as HTMLElement).dataset.cosmeticId!;
      if (!cosmeticPickerForAccount || !cosmeticPickerType) return;
      const acc = taxiList.find((s) => s.accountId === cosmeticPickerForAccount);
      if (acc) {
        if (cosmeticPickerType === 'skin') acc.config.skin = id;
        else acc.config.emote = id;
      }
      cosmeticPickerForAccount = null;
      cosmeticPickerType = null;
      draw();
    });
  });

  // Whitelist
  el.querySelectorAll('[data-wl-modal]').forEach((b) => { b.addEventListener('click', () => { whitelistModalAccountId = (b as HTMLElement).dataset.wlModal!; draw(); }); });
  el.querySelector('[data-wl-modal-overlay]')?.addEventListener('click', (e) => { if ((e.target as HTMLElement).hasAttribute('data-wl-modal-overlay')) { whitelistModalAccountId = null; whitelistResults = {}; whitelistSearch = {}; draw(); } });
  el.querySelector('[data-wl-modal-close]')?.addEventListener('click', () => { whitelistModalAccountId = null; whitelistResults = {}; whitelistSearch = {}; draw(); });
  el.querySelectorAll('[data-wl-search-btn]').forEach((b) => {
    b.addEventListener('click', async () => {
      const accId = (b as HTMLElement).dataset.wlSearchBtn!;
      const input = el!.querySelector(`[data-wl-search="${accId}"]`) as HTMLInputElement;
      const sv = input?.value?.trim() || '';
      if (!sv) return;
      whitelistSearch[accId] = sv;
      if (/^[a-f0-9]{32}$/i.test(sv)) {
        whitelistResults[accId] = [{ accountId: sv.toLowerCase(), displayName: sv.toLowerCase() }];
        try { const res = await window.glowAPI.stalk.search(sv); if (res.success && res.results.length) whitelistResults[accId] = res.results.map((r: any) => ({ accountId: r.accountId, displayName: r.displayName, platform: r.platform })); } catch {}
      } else {
        try { const res = await window.glowAPI.stalk.search(sv); if (res.success) whitelistResults[accId] = res.results.map((r: any) => ({ accountId: r.accountId, displayName: r.displayName, platform: r.platform })); } catch {}
      }
      draw();
    });
  });
  el.querySelectorAll('[data-wl-search]').forEach((i) => { i.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { const accId = (i as HTMLInputElement).dataset.wlSearch!; (el?.querySelector(`[data-wl-search-btn="${accId}"]`) as HTMLElement)?.click(); } }); });
  el.querySelectorAll('[data-wl-add]').forEach((b) => { b.addEventListener('click', async () => { const accId = (b as HTMLElement).dataset.wlAdd!; await window.glowAPI.taxi.addWhitelist(accId, (b as HTMLElement).dataset.targetId!, (b as HTMLElement).dataset.targetName!); whitelistResults[accId] = []; whitelistSearch[accId] = ''; await fetchTaxis(); }); });
  el.querySelectorAll('[data-wl-remove]').forEach((b) => { b.addEventListener('click', async () => { await window.glowAPI.taxi.removeWhitelist((b as HTMLElement).dataset.wlRemove!, (b as HTMLElement).dataset.targetId!); await fetchTaxis(); }); });
}

// ─── Render cosmetic picker grid in-place (no full redraw) ──

function renderPickerGrid(): void {
  const grid = el?.querySelector('#tx-pick-grid') as HTMLElement;
  if (!grid) return;
  const filtered = filterCosmetics();

  if (!cosmeticSearch.trim()) {
    grid.innerHTML = '<div class="tx-pick-empty"><p>Type a name to search</p></div>';
    return;
  }
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="tx-pick-empty"><p>No results found</p></div>';
    return;
  }

  grid.innerHTML = filtered.map((item) => {
    const rc = RARITY_COLORS[item.rarity] || '#808080';
    return `<div class="tx-pick-item" data-cosmetic-id="${esc(item.id)}" style="--item-accent:${rc}">
      <div class="tx-pick-item-img">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="" onerror="this.style.display='none'" />` : ''}</div>
      <span class="tx-pick-item-name">${esc(item.name)}</span>
      <span class="tx-pick-item-rarity" style="color:${rc}">${esc(item.rarity)}</span>
    </div>`;
  }).join('');

  grid.querySelectorAll('.tx-pick-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = (item as HTMLElement).dataset.cosmeticId!;
      if (!cosmeticPickerForAccount || !cosmeticPickerType) return;
      const acc = taxiList.find((s) => s.accountId === cosmeticPickerForAccount);
      if (acc) { if (cosmeticPickerType === 'skin') acc.config.skin = id; else acc.config.emote = id; }
      cosmeticPickerForAccount = null; cosmeticPickerType = null; draw();
    });
  });
}

// ─── Save config ────────────────────────────────────────

async function saveConfig(accountId: string): Promise<void> {
  if (!el) return;
  const acc = taxiList.find((s) => s.accountId === accountId);
  if (!acc) return;

  const getVal = (attr: string) => {
    const input = el!.querySelector(`[data-cfg-${attr}="${accountId}"]`) as HTMLInputElement | HTMLSelectElement;
    return input?.value ?? '';
  };

  const isPrivate = getVal('isPrivate') === 'true';

  const partial: Partial<TaxiAccountConfig> = {
    statusLibre: acc.config.statusLibre,
    statusOcupado: acc.config.statusOcupado,
    tiempoParaIrse: Math.max(1, Math.min(30, parseInt(getVal('tiempoParaIrse')) || 2)),
    skin: acc.config.skin,
    emote: acc.config.emote,
    level: Math.max(1, Math.min(9999, parseInt(getVal('level')) || 100)),
    isPrivate,
    powerLevel: Math.max(-2147483647, Math.min(2147483647, parseInt(getVal('powerLevel')) || 130)),
    // Auto-accept: always ON for public, always OFF for private
    autoAcceptFriends: !isPrivate,
  };

  await window.glowAPI.taxi.updateConfig(accountId, partial);
}

// ─── Helpers ────────────────────────────────────────────

function startCooldownTicker(): void {
  if (cooldownInterval) return;
  cooldownInterval = setInterval(() => {
    let any = false;
    for (const [a, u] of cooldownAccounts) { if (Date.now() >= u) cooldownAccounts.delete(a); else any = true; }
    draw();
    if (!any && cooldownInterval) { clearInterval(cooldownInterval); cooldownInterval = null; fetchTaxis(); }
  }, 1000);
}

function showCardError(accountId: string, message: string): void {
  if (!el) return;
  const card = el.querySelector(`[data-account="${accountId}"] .tx-body`);
  if (!card) return;
  const existing = card.querySelector('.taxi-card-error');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = 'taxi-card-error';
  div.textContent = message;
  card.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Page Definition ────────────────────────────────────

export const taxiPage: PageDefinition = {
  id: 'taxi',
  label: 'Taxi',
  icon: `<img src="assets/icons/fnui/Automated/taxi.png" alt="Taxi" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 25,
  render(container) {
    el = container;
    taxiList = []; logs = []; avatars = {};
    activatingAccounts.clear();
    whitelistModalAccountId = null; whitelistSearch = {}; whitelistResults = {};
    modalAccountId = null; statusEditorAccountId = null;
    cosmeticPickerForAccount = null; cosmeticPickerType = null;
    fetchTaxis();

    window.glowAPI.taxi.onStatusUpdate((data) => {
      const idx = taxiList.findIndex((s) => s.accountId === data.accountId);
      if (idx >= 0) {
        taxiList[idx].isConnected = data.connected;
        if (data.connected) activatingAccounts.delete(data.accountId);
        if (data.error) (taxiList[idx] as any).error = data.error;
        draw();
      }
    });
    window.glowAPI.taxi.onLog((entry) => { logs.push(entry); if (logs.length > MAX_LOGS_PER_ACCOUNT * 10) logs = logs.slice(-MAX_LOGS_PER_ACCOUNT * 5); draw(); });
    window.glowAPI.taxi.onDataChanged(() => { if (el) fetchTaxis(); });
    window.glowAPI.taxi.onCooldown((data) => { cooldownAccounts.set(data.accountId, data.cooldownUntil); activatingAccounts.delete(data.accountId); startCooldownTicker(); draw(); });
    window.glowAPI.accounts.onDataChanged(() => { if (el) fetchTaxis(); });
  },
  cleanup() {
    el = null; taxiList = []; logs = []; avatars = {};
    modalAccountId = null; whitelistModalAccountId = null; statusEditorAccountId = null;
    cosmeticPickerForAccount = null; cosmeticPickerType = null;
    activatingAccounts.clear(); cooldownAccounts.clear();
    if (cooldownInterval) { clearInterval(cooldownInterval); cooldownInterval = null; }
    window.glowAPI.taxi.offStatusUpdate(); window.glowAPI.taxi.offLog();
    window.glowAPI.taxi.offDataChanged(); window.glowAPI.taxi.offCooldown();
  },
};
