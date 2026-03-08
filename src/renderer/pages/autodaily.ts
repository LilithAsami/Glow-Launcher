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
      <h1 class="page-title">AutoDaily</h1>
      <p class="page-subtitle">Automatic STW daily login reward collection — runs at daily reset (00:00 UTC)</p>

      <div class="ad-controls">
        <button class="ad-run-now-btn" id="ad-run-now">▶ Run Now</button>
        <span class="ad-next-reset">${nextReset}</span>
      </div>

      <div class="ad-cards">${cardsHtml}</div>

      <div class="ad-log-section">
        <h3 class="ad-log-title">Activity Log</h3>
        <div class="ad-log-list" id="ad-log-list">${logsHtml}</div>
      </div>
    </div>`;

  bindEvents();
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
