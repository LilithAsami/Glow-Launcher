/**
 * Taxi Page — Fortnite Taxi Bot system.
 *
 * Per-account cards with:
 * - Responsibility acceptance modal (matchmaking ban warning)
 * - Toggle activation
 * - Config: status messages, time, skin, emote, level, privacy, stats
 * - Whitelist management (private mode)
 * - Queue display + live logs
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
let whitelistResults: Record<string, { accountId: string; displayName: string }[]> = {};
let modalAccountId: string | null = null;
let activatingAccounts = new Set<string>();
let whitelistModalAccountId: string | null = null;
let cooldownAccounts = new Map<string, number>(); // accountId → cooldownUntil timestamp
let cooldownInterval: ReturnType<typeof setInterval> | null = null;
let avatars: Record<string, string> = {};

// ─── Constants ───────────────────────────────────────────

const MAX_LOGS_PER_ACCOUNT = 30;

// ─── Fetch ──────────────────────────────────────────────

async function fetchTaxis(): Promise<void> {
  loading = true;
  draw();

  try {
    const [taxiRes, avatarRes] = await Promise.all([
      window.glowAPI.taxi.getAll(),
      window.glowAPI.taxi.getAvatars(),
    ]);
    console.log('[TaxiPage] taxiRes:', JSON.stringify(taxiRes));
    console.log('[TaxiPage] avatarRes:', JSON.stringify(avatarRes));
    if (taxiRes.success) {
      taxiList = taxiRes.statuses;
      // Clear activating flag for already-connected accounts
      for (const s of taxiList) {
        if (s.isConnected) activatingAccounts.delete(s.accountId);
      }
    }
    if (avatarRes.success) {
      avatars = avatarRes.avatars;
      console.log('[TaxiPage] Avatars loaded:', JSON.stringify(avatars));
    }
  } catch {}

  loading = false;
  draw();
}

// ─── Draw ───────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading && taxiList.length === 0) {
    el.innerHTML = `
      <div class="taxi-page">
        <h1 class="page-title">Taxi</h1>
        <p class="page-subtitle">Fortnite Taxi Bot System — Join parties and taxi players</p>
        <div class="taxi-loading"><div class="auth-spinner"></div></div>
      </div>`;
    return;
  }

  if (taxiList.length === 0) {
    el.innerHTML = `
      <div class="taxi-page">
        <h1 class="page-title">Taxi</h1>
        <p class="page-subtitle">Fortnite Taxi Bot System — Join parties and taxi players</p>
        <div class="taxi-empty"><p>No accounts found. Add accounts first.</p></div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="taxi-page">
      <h1 class="page-title">Taxi</h1>
      <p class="page-subtitle">Fortnite Taxi Bot System — Join parties and taxi players</p>

      <div class="taxi-grid">
        ${taxiList.map((s) => renderCard(s)).join('')}
      </div>
    </div>
    ${modalAccountId ? renderModal(modalAccountId) : ''}
    ${whitelistModalAccountId ? renderWhitelistModal(whitelistModalAccountId) : ''}
  `;

  bindEvents();
}

// ─── Card ───────────────────────────────────────────────

function renderCard(s: TaxiAccountStatus): string {
  const cfg = s.config;
  const connected = s.isConnected;
  const active = cfg.isActive;
  const accepted = cfg.responsabilityAccepted;
  const accountLogs = logs.filter((l) => l.accountId === s.accountId).slice(-8);

  const isActivating = activatingAccounts.has(s.accountId);
  const cooldownUntil = cooldownAccounts.get(s.accountId) || 0;
  const isCooldown = Date.now() < cooldownUntil;
  const cooldownRemaining = isCooldown ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;

  let statusBadge: string;
  let statusClass: string;
  if (isCooldown) {
    statusBadge = `Cooldown (${cooldownRemaining}s)`;
    statusClass = 'cooldown';
  } else if (connected && s.isOccupied) {
    statusBadge = `Occupied (${s.queue.length} queue)`;
    statusClass = 'occupied';
  } else if (connected) {
    statusBadge = 'Connected';
    statusClass = 'connected';
  } else if (isActivating || (active && !connected)) {
    statusBadge = 'Activating...';
    statusClass = 'activating';
  } else {
    statusBadge = 'Offline';
    statusClass = 'offline';
  }

  const avatarUrl = avatars[s.accountId] || '';

  return `
    <div class="taxi-card ${active ? 'active' : ''}" data-account="${s.accountId}">
      <div class="taxi-card-header">
        <div class="taxi-card-info">
          ${avatarUrl
            ? `<img class="taxi-avatar" src="${escAttr(avatarUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
               <div class="status-indicator ${statusClass}" style="display:none"></div>`
            : `<div class="status-indicator ${statusClass}"></div>`
          }
          <div>
            <h3 class="taxi-card-name">${esc(s.displayName)}</h3>
            <span class="status-badge ${statusClass}">${statusBadge}</span>
          </div>
        </div>
        <div class="taxi-header-right">
          <span class="taxi-accepted-badge ${accepted ? 'yes' : 'no'}">${accepted ? '✓ Accepted' : '✕ Not Accepted'}</span>
          ${accepted
            ? `<label class="status-toggle">
                <input type="checkbox" class="status-toggle-input" data-taxi-toggle="${s.accountId}" ${active || isActivating ? 'checked' : ''} ${isActivating || isCooldown ? 'disabled' : ''}>
                <span class="status-toggle-slider"></span>
              </label>`
            : `<button class="btn btn-accent taxi-btn-accept" data-accept="${s.accountId}">Accept Risk</button>`
          }
        </div>
      </div>

      <div class="taxi-card-body">
        <!-- Status messages -->
        <div class="taxi-field-row">
          <div class="taxi-field">
            <label class="taxi-field-label">Status (Free)</label>
            <input type="text" class="taxi-input" data-cfg-statusLibre="${s.accountId}"
                   value="${escAttr(cfg.statusLibre)}" maxlength="200" />
          </div>
          <div class="taxi-field">
            <label class="taxi-field-label">Status (Busy) <small>{queue} = count</small></label>
            <input type="text" class="taxi-input" data-cfg-statusOcupado="${s.accountId}"
                   value="${escAttr(cfg.statusOcupado)}" maxlength="200" />
          </div>
        </div>

        <!-- Time, Skin, Emote, Level -->
        <div class="taxi-field-row taxi-field-row-4">
          <div class="taxi-field">
            <label class="taxi-field-label">Time (min)</label>
            <input type="number" class="taxi-input taxi-input-sm" data-cfg-tiempoParaIrse="${s.accountId}"
                   value="${cfg.tiempoParaIrse}" min="1" max="30" />
          </div>
          <div class="taxi-field">
            <label class="taxi-field-label">Skin (CID)</label>
            <input type="text" class="taxi-input" data-cfg-skin="${s.accountId}"
                   value="${escAttr(cfg.skin)}" placeholder="CID_028_Athena..." />
          </div>
          <div class="taxi-field">
            <label class="taxi-field-label">Emote (EID)</label>
            <input type="text" class="taxi-input" data-cfg-emote="${s.accountId}"
                   value="${escAttr(cfg.emote)}" placeholder="EID_Floss" />
          </div>
          <div class="taxi-field">
            <label class="taxi-field-label">Level</label>
            <input type="number" class="taxi-input taxi-input-sm" data-cfg-level="${s.accountId}"
                   value="${cfg.level}" min="1" max="9999" />
          </div>
        </div>

        <!-- Privacy, Stats, Auto-Accept -->
        <div class="taxi-field-row taxi-field-row-3">
          <div class="taxi-field">
            <label class="taxi-field-label">Privacy</label>
            <div class="taxi-privacy-row">
              <select class="taxi-select" data-cfg-isPrivate="${s.accountId}">
                <option value="false" ${!cfg.isPrivate ? 'selected' : ''}>Public</option>
                <option value="true" ${cfg.isPrivate ? 'selected' : ''}>Private</option>
              </select>
              ${cfg.isPrivate ? `<button class="taxi-btn-whitelist" data-wl-modal="${s.accountId}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Whitelist (${cfg.whitelist.length})
              </button>` : ''}
            </div>
          </div>
          <div class="taxi-field">
            <label class="taxi-field-label">Stats Mode</label>
            <select class="taxi-select" data-cfg-statsMode="${s.accountId}">
              <option value="low" ${cfg.statsMode === 'low' ? 'selected' : ''}>Low Stats</option>
              <option value="normal" ${cfg.statsMode === 'normal' ? 'selected' : ''}>High Stats</option>
            </select>
          </div>
          <div class="taxi-field">
            <label class="taxi-field-label">Auto-Accept Friends</label>
            <select class="taxi-select" data-cfg-autoAcceptFriends="${s.accountId}">
              <option value="true" ${cfg.autoAcceptFriends ? 'selected' : ''}>Yes</option>
              <option value="false" ${!cfg.autoAcceptFriends ? 'selected' : ''}>No</option>
            </select>
          </div>
        </div>

        <!-- Save button -->
        <button class="btn btn-accent taxi-save-btn" data-save="${s.accountId}">Save Config</button>



        <!-- Queue -->
        ${s.queue.length > 0 ? `
          <div class="taxi-queue">
            <span class="taxi-field-label">Queue (${s.queue.length})</span>
            ${s.queue.map((q, i) => `<div class="taxi-queue-entry">${i + 1}. ${esc(q.displayName)}</div>`).join('')}
          </div>
        ` : ''}

        <!-- Logs -->
        ${accountLogs.length > 0 ? `
          <div class="taxi-logs">
            <span class="taxi-field-label">Activity Log</span>
            <div class="taxi-log-list">
              ${accountLogs.reverse().map((l) => `
                <div class="taxi-log taxi-log-${l.type}">
                  <span class="taxi-log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
                  <span>${esc(l.message)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ─── Modal ──────────────────────────────────────────────

function renderModal(accountId: string): string {
  const acc = taxiList.find((s) => s.accountId === accountId);
  const name = acc?.displayName || accountId;

  return `
    <div class="taxi-modal-overlay" data-modal-overlay>
      <div class="taxi-modal">
        <div class="taxi-modal-header">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffa726" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <h2>Matchmaking Ban Warning</h2>
        </div>
        <div class="taxi-modal-body">
          <p><strong>Account:</strong> ${esc(name)}</p>
          <div class="taxi-modal-warning">
            <p>Using the taxi bot system with <strong>low stats</strong> to enter lower-level
            matchmaking lobbies may result in a <strong>permanent matchmaking ban</strong> from
            Epic Games on this account.</p>
            <p>Additionally, using automated systems to interact with Fortnite services violates
            Epic's Terms of Service and may result in <strong>account suspension</strong>.</p>
            <p>By accepting, you acknowledge that:</p>
            <ul>
              <li>You understand the risk of matchmaking restrictions or bans</li>
              <li>You accept full responsibility for any consequences</li>
              <li>The developer of GLOW Launcher is <strong>not responsible</strong> for any bans or penalties</li>
            </ul>
          </div>
          <label class="taxi-modal-check">
            <input type="checkbox" id="taxi-modal-checkbox" />
            <span>I understand and accept all risks and responsibilities</span>
          </label>
        </div>
        <div class="taxi-modal-footer">
          <button class="btn taxi-modal-cancel" data-modal-cancel>Cancel</button>
          <button class="btn btn-accent taxi-modal-confirm" data-modal-confirm disabled>Accept Responsibility</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Whitelist Modal ────────────────────────────────────

function renderWhitelistModal(accountId: string): string {
  const acc = taxiList.find((s) => s.accountId === accountId);
  if (!acc) return '';
  const cfg = acc.config;
  const searchVal = whitelistSearch[accountId] || '';
  const results = whitelistResults[accountId] || [];

  return `
    <div class="taxi-modal-overlay" data-wl-modal-overlay>
      <div class="taxi-modal taxi-wl-modal">
        <div class="taxi-modal-header">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <h2>Whitelist — ${esc(acc.displayName)}</h2>
        </div>
        <div class="taxi-modal-body">
          <div class="taxi-wl-search-row">
            <input type="text" class="taxi-input" data-wl-search="${accountId}"
                   value="${escAttr(searchVal)}"
                   placeholder="Search by name or 32-char Account ID..." />
            <button class="taxi-btn-small" data-wl-search-btn="${accountId}">Search</button>
          </div>
          ${results.length > 0 ? `
            <div class="taxi-wl-results">
              ${results.map((r) => `
                <div class="taxi-wl-result">
                  <span>${esc(r.displayName)} <small>(${r.accountId.slice(0, 8)}...)</small></span>
                  <button class="taxi-btn-small taxi-btn-add" data-wl-add="${accountId}"
                          data-target-id="${r.accountId}" data-target-name="${escAttr(r.displayName)}">Add</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div class="taxi-wl-list-section">
            <span class="taxi-field-label">Whitelisted Players (${cfg.whitelist.length})</span>
            <div class="taxi-wl-list">
              ${cfg.whitelist.length === 0 ? '<div class="taxi-wl-empty">No whitelisted accounts</div>' : ''}
              ${cfg.whitelist.map((w) => `
                <div class="taxi-wl-entry">
                  <span>${esc(w.displayName)} <small>(${w.accountId.slice(0, 12)}...)</small></span>
                  <button class="taxi-btn-small taxi-btn-remove" data-wl-remove="${accountId}"
                          data-target-id="${w.accountId}">Remove</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="taxi-modal-footer">
          <button class="btn taxi-modal-cancel" data-wl-modal-close>Close</button>
        </div>
      </div>
    </div>
  `;
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
        // Check local cooldown
        const cd = cooldownAccounts.get(accountId) || 0;
        if (Date.now() < cd) {
          (input as HTMLInputElement).checked = false;
          showCardError(accountId, `Cooldown active (${Math.ceil((cd - Date.now()) / 1000)}s)`);
          return;
        }
        activatingAccounts.add(accountId);
        draw(); // immediately show "Activating..."
        await saveConfig(accountId);
        const result = await window.glowAPI.taxi.activate(accountId);
        if (!result.success) {
          activatingAccounts.delete(accountId);
          showCardError(accountId, result.error || 'Activation failed');
          draw();
        }
      } else {
        activatingAccounts.delete(accountId);
        await window.glowAPI.taxi.deactivate(accountId);
        // deactivate sets a 10s cooldown on backend; set it locally too
        const cdEnd = Date.now() + 10_000;
        cooldownAccounts.set(accountId, cdEnd);
        startCooldownTicker();
        draw();
      }
    });
  });

  // Accept responsibility button → show modal
  el.querySelectorAll('[data-accept]').forEach((btn) => {
    btn.addEventListener('click', () => {
      modalAccountId = (btn as HTMLElement).dataset.accept!;
      draw();
    });
  });

  // Modal overlay cancel
  el.querySelector('[data-modal-overlay]')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).hasAttribute('data-modal-overlay')) {
      modalAccountId = null;
      draw();
    }
  });

  // Modal cancel
  el.querySelector('[data-modal-cancel]')?.addEventListener('click', () => {
    modalAccountId = null;
    draw();
  });

  // Modal checkbox → enable confirm
  const checkbox = el.querySelector('#taxi-modal-checkbox') as HTMLInputElement;
  const confirmBtn = el.querySelector('[data-modal-confirm]') as HTMLButtonElement;
  if (checkbox && confirmBtn) {
    checkbox.addEventListener('change', () => {
      confirmBtn.disabled = !checkbox.checked;
    });
  }

  // Modal confirm
  confirmBtn?.addEventListener('click', async () => {
    if (!modalAccountId) return;
    await window.glowAPI.taxi.acceptResponsibility(modalAccountId);
    modalAccountId = null;
    await fetchTaxis();
  });

  // Save config buttons
  el.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const accountId = (btn as HTMLElement).dataset.save!;
      (btn as HTMLButtonElement).disabled = true;
      (btn as HTMLButtonElement).textContent = 'Saving...';
      await saveConfig(accountId);
      (btn as HTMLButtonElement).textContent = 'Saved ✓';
      setTimeout(() => {
        if (btn) {
          (btn as HTMLButtonElement).disabled = false;
          (btn as HTMLButtonElement).textContent = 'Save Config';
        }
      }, 1500);
    });
  });

  // Open whitelist modal
  el.querySelectorAll('[data-wl-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      whitelistModalAccountId = (btn as HTMLElement).dataset.wlModal!;
      draw();
    });
  });

  // Close whitelist modal (overlay click)
  el.querySelector('[data-wl-modal-overlay]')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).hasAttribute('data-wl-modal-overlay')) {
      whitelistModalAccountId = null;
      whitelistResults = {};
      whitelistSearch = {};
      draw();
    }
  });

  // Close whitelist modal (close button)
  el.querySelector('[data-wl-modal-close]')?.addEventListener('click', () => {
    whitelistModalAccountId = null;
    whitelistResults = {};
    whitelistSearch = {};
    draw();
  });

  // Whitelist search
  el.querySelectorAll('[data-wl-search-btn]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const accId = (btn as HTMLElement).dataset.wlSearchBtn!;
      const input = el!.querySelector(`[data-wl-search="${accId}"]`) as HTMLInputElement;
      const searchVal = input?.value?.trim() || '';
      if (!searchVal) return;

      whitelistSearch[accId] = searchVal;

      // Check if 32 hex chars → direct accountId
      if (/^[a-f0-9]{32}$/i.test(searchVal)) {
        whitelistResults[accId] = [{ accountId: searchVal.toLowerCase(), displayName: searchVal.toLowerCase() }];
        // Try to resolve display name
        try {
          const res = await window.glowAPI.stalk.search(searchVal);
          if (res.success && res.results.length > 0) {
            whitelistResults[accId] = res.results.map((r: any) => ({
              accountId: r.accountId,
              displayName: r.displayName,
            }));
          }
        } catch {}
      } else {
        // Search by name
        try {
          const res = await window.glowAPI.stalk.search(searchVal);
          if (res.success) {
            whitelistResults[accId] = res.results.map((r: any) => ({
              accountId: r.accountId,
              displayName: r.displayName,
            }));
          }
        } catch {}
      }

      draw();
    });
  });

  // Whitelist search enter key
  el.querySelectorAll('[data-wl-search]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        const accId = (input as HTMLInputElement).dataset.wlSearch!;
        const btn = el?.querySelector(`[data-wl-search-btn="${accId}"]`) as HTMLElement;
        btn?.click();
      }
    });
  });

  // Whitelist add
  el.querySelectorAll('[data-wl-add]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const accId = (btn as HTMLElement).dataset.wlAdd!;
      const targetId = (btn as HTMLElement).dataset.targetId!;
      const targetName = (btn as HTMLElement).dataset.targetName!;
      await window.glowAPI.taxi.addWhitelist(accId, targetId, targetName);
      whitelistResults[accId] = [];
      whitelistSearch[accId] = '';
      await fetchTaxis();
    });
  });

  // Whitelist remove
  el.querySelectorAll('[data-wl-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const accId = (btn as HTMLElement).dataset.wlRemove!;
      const targetId = (btn as HTMLElement).dataset.targetId!;
      await window.glowAPI.taxi.removeWhitelist(accId, targetId);
      await fetchTaxis();
    });
  });
}

// ─── Save config ────────────────────────────────────────

async function saveConfig(accountId: string): Promise<void> {
  if (!el) return;

  const getVal = (attr: string) => {
    const input = el!.querySelector(`[data-cfg-${attr}="${accountId}"]`) as HTMLInputElement | HTMLSelectElement;
    return input?.value ?? '';
  };

  const partial: Partial<TaxiAccountConfig> = {
    statusLibre: getVal('statusLibre'),
    statusOcupado: getVal('statusOcupado'),
    tiempoParaIrse: Math.max(1, Math.min(30, parseInt(getVal('tiempoParaIrse')) || 2)),
    skin: getVal('skin'),
    emote: getVal('emote'),
    level: Math.max(1, Math.min(9999, parseInt(getVal('level')) || 100)),
    isPrivate: getVal('isPrivate') === 'true',
    statsMode: getVal('statsMode') as 'normal' | 'low',
    autoAcceptFriends: getVal('autoAcceptFriends') === 'true',
  };

  await window.glowAPI.taxi.updateConfig(accountId, partial);
}

// ─── Helpers ────────────────────────────────────────────

function startCooldownTicker(): void {
  if (cooldownInterval) return;
  cooldownInterval = setInterval(() => {
    const now = Date.now();
    let anyActive = false;
    for (const [accId, until] of cooldownAccounts) {
      if (now >= until) {
        cooldownAccounts.delete(accId);
      } else {
        anyActive = true;
      }
    }
    draw();
    if (!anyActive && cooldownInterval) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
      // Refresh data after all cooldowns expire
      fetchTaxis();
    }
  }, 1000);
}

function showCardError(accountId: string, message: string): void {
  if (!el) return;
  const card = el.querySelector(`[data-account="${accountId}"] .taxi-card-body`);
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
    taxiList = [];
    logs = [];
    avatars = {};
    activatingAccounts.clear();
    whitelistModalAccountId = null;
    whitelistSearch = {};
    whitelistResults = {};
    modalAccountId = null;

    fetchTaxis();

    // Live connection updates
    window.glowAPI.taxi.onStatusUpdate((data) => {
      const idx = taxiList.findIndex((s) => s.accountId === data.accountId);
      if (idx >= 0) {
        taxiList[idx].isConnected = data.connected;
        if (data.connected) activatingAccounts.delete(data.accountId);
        if (data.error) (taxiList[idx] as any).error = data.error;
        draw();
      }
    });

    // Logs
    window.glowAPI.taxi.onLog((entry) => {
      logs.push(entry);
      // Cap logs
      if (logs.length > MAX_LOGS_PER_ACCOUNT * 10) {
        logs = logs.slice(-MAX_LOGS_PER_ACCOUNT * 5);
      }
      draw();
    });

    // Data changed
    window.glowAPI.taxi.onDataChanged(() => {
      if (el) fetchTaxis();
    });

    // Cooldown events (from backend auto-disable on flap)
    window.glowAPI.taxi.onCooldown((data) => {
      cooldownAccounts.set(data.accountId, data.cooldownUntil);
      activatingAccounts.delete(data.accountId);
      startCooldownTicker();
      draw();
    });

    // Account changes
    window.glowAPI.accounts.onDataChanged(() => {
      if (el) fetchTaxis();
    });
  },
  cleanup() {
    el = null;
    taxiList = [];
    logs = [];
    avatars = {};
    modalAccountId = null;
    whitelistModalAccountId = null;
    activatingAccounts.clear();
    cooldownAccounts.clear();
    if (cooldownInterval) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
    }
    window.glowAPI.taxi.offStatusUpdate();
    window.glowAPI.taxi.offLog();
    window.glowAPI.taxi.offDataChanged();
    window.glowAPI.taxi.offCooldown();
  },
};
