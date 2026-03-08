import type { Router } from './router';
import { initNotifications, togglePanel } from './notifications';

/**
 * Renders the toolbar bar (below the header).
 *
 * Layout:
 *  [Logo Area (sidebar-width)] | [Select Menu] [Launch] ... [Accounts btn]
 *
 * The logo area matches the sidebar width so the vertical
 * separator aligns perfectly with the sidebar border.
 */
export function initToolbar(router: Router): void {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;

  toolbar.innerHTML = `
    <div class="toolbar-brand" id="toolbar-logo" title="Home">
      <img src="assets/banner.png" alt="GLOW" draggable="false">
    </div>

    <div class="toolbar-content">
      <div class="toolbar-left">
        <div class="toolbar-account-wrap">
          <img class="toolbar-avatar" id="toolbar-avatar" src="" alt="" style="display:none" />
          <div class="toolbar-select-wrap">
            <select class="toolbar-select" id="account-select" title="Select account">
              <option value="">No accounts</option>
            </select>
            <svg class="toolbar-select-arrow" width="10" height="10" viewBox="0 0 10 10">
              <path d="M2 3.5L5 7L8 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>

        <button class="toolbar-btn-launch" id="btn-launch" title="Launch Fortnite">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"/>
          </svg>
          <span>Launch</span>
        </button>

        <button class="toolbar-btn-kill" id="btn-kill" title="Close Fortnite">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" stroke="none"/>
          </svg>
          <span>Close</span>
        </button>
      </div>

      <div class="toolbar-drag"></div>

      <div class="toolbar-right">
        <div class="toolbar-rpc-status" id="toolbar-rpc-status" title="Discord RPC">
          <span class="toolbar-rpc-dot toolbar-rpc-dot--off" id="toolbar-rpc-dot"></span>
          <span class="toolbar-rpc-label" id="toolbar-rpc-label">RPC</span>
        </div>
        <button class="toolbar-btn-round" id="btn-notifications" title="Notifications">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span class="notif-badge" id="notif-badge" style="display:none">0</span>
        </button>
        <button class="toolbar-btn-round" id="btn-discord" title="Join our Discord server">
          <img src="assets/icons/discord.png" alt="Discord" class="toolbar-discord-icon" />
        </button>
        <button class="toolbar-btn-round" id="btn-settings" title="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button class="toolbar-btn-round" id="btn-accounts" title="Manage accounts">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span class="notif-badge" id="accounts-badge" style="display:none">!</span>
        </button>

        <div class="toolbar-window-controls">
          <button class="toolbar-winbtn" id="btn-minimize" title="Minimize">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="5.5" width="10" height="1" fill="currentColor"/>
            </svg>
          </button>
          <button class="toolbar-winbtn" id="btn-maximize" title="Maximize">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1.5" y="1.5" width="9" height="9" rx="0.5"
                    fill="none" stroke="currentColor" stroke-width="1"/>
            </svg>
          </button>
          <button class="toolbar-winbtn toolbar-winbtn--close" id="btn-close" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor"
                    stroke-width="1.3" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Load real accounts into select
  refreshAccountSelect();

  // Preload all avatars on startup (background, no flash)
  preloadAllAvatars();

  // Validate tokens on startup and show badge if any fail
  validateAccountTokens();

  // Refresh when account data changes (add, remove, switch)
  window.glowAPI.accounts.onDataChanged(() => refreshAccountSelect());

  // Select change → set main account
  document.getElementById('account-select')?.addEventListener('change', async (e) => {
    const value = (e.target as HTMLSelectElement).value;
    if (value) {
      await window.glowAPI.accounts.setMain(value);
      updateToolbarAvatar(value);
      // Notify other components (e.g. shop vbucks)
      window.dispatchEvent(new CustomEvent('glow:account-switched', { detail: { accountId: value } }));
    }
  });

  // Logo → Home
  document.getElementById('toolbar-logo')?.addEventListener('click', () => {
    router.navigate('home');
  });

  // Discord button
  document.getElementById('btn-discord')?.addEventListener('click', () => {
    window.glowAPI.shell.openExternal('https://discord.gg/SrSMRxfUEj');
  });

  // Notifications bell button
  document.getElementById('btn-notifications')?.addEventListener('click', () => {
    togglePanel();
  });

  // Initialize notification system (badge, listeners)
  initNotifications();

  // Accounts button → Accounts page
  document.getElementById('btn-accounts')?.addEventListener('click', () => {
    router.navigate('accounts');
  });

  // Settings button → Settings page
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    router.navigate('settings');
  });

  // Discord RPC status indicator
  initRpcIndicator();

  // Track page navigation → update Discord presence
  router.onNavigate((pageId) => {
    window.glowAPI.discordRpc.setPage(pageId);
  });

  // Launch button → Launch game
  const launchBtn = document.getElementById('btn-launch');
  const launchOrigHtml = launchBtn?.innerHTML ?? '';
  launchBtn?.addEventListener('click', async () => {
    launchBtn.classList.add('toolbar-btn-launching');
    launchBtn.setAttribute('disabled', 'true');
    launchBtn.innerHTML = `
      <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
      </svg>
      <span>Launching...</span>`;

    try {
      const result = await window.glowAPI.launch.start();
      if (!result.success) {
        launchBtn.innerHTML = `<span style="color:#ff4444">✕</span> <span>Failed</span>`;
        setTimeout(() => { launchBtn.innerHTML = launchOrigHtml; launchBtn.classList.remove('toolbar-btn-launching'); launchBtn.removeAttribute('disabled'); }, 3000);
        return;
      }
      launchBtn.innerHTML = `<span style="color:#00c853">✓</span> <span>Launched!</span>`;
      setTimeout(() => { launchBtn.innerHTML = launchOrigHtml; launchBtn.classList.remove('toolbar-btn-launching'); launchBtn.removeAttribute('disabled'); }, 3000);
    } catch {
      launchBtn.innerHTML = `<span style="color:#ff4444">✕</span> <span>Error</span>`;
      setTimeout(() => { launchBtn.innerHTML = launchOrigHtml; launchBtn.classList.remove('toolbar-btn-launching'); launchBtn.removeAttribute('disabled'); }, 3000);
    }
  });

  // Kill button → Close Fortnite
  const killBtn = document.getElementById('btn-kill');
  const killOrigHtml = killBtn?.innerHTML ?? '';
  killBtn?.addEventListener('click', async () => {
    killBtn.setAttribute('disabled', 'true');
    killBtn.innerHTML = `
      <svg class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
      </svg>
      <span>Closing...</span>`;

    try {
      const result = await window.glowAPI.launch.kill();
      if (result.success) {
        killBtn.innerHTML = `<span style="color:#ff4444">■</span> <span>Closed</span>`;
      } else {
        killBtn.innerHTML = `<span style="color:var(--text-muted)">—</span> <span>Not running</span>`;
      }
    } catch {
      killBtn.innerHTML = `<span style="color:var(--text-muted)">—</span> <span>Error</span>`;
    }
    setTimeout(() => { killBtn.innerHTML = killOrigHtml; killBtn.removeAttribute('disabled'); }, 2000);
  });

  // Window controls (merged from header)
  document.getElementById('btn-minimize')?.addEventListener('click', () => {
    window.glowAPI.window.minimize();
  });
  document.getElementById('btn-maximize')?.addEventListener('click', () => {
    window.glowAPI.window.maximize();
  });
  document.getElementById('btn-close')?.addEventListener('click', () => {
    window.glowAPI.window.close();
  });

  // ── Responsive split: move window controls to header when toolbar overflows ──
  setupToolbarOverflowWatch();
}

/** Fetch accounts from storage and populate the toolbar select */
async function refreshAccountSelect(): Promise<void> {
  const select = document.getElementById('account-select') as HTMLSelectElement | null;
  if (!select) return;

  const data = await window.glowAPI.accounts.getAll();
  select.innerHTML = '';

  if (data.accounts.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '😢 No accounts';
    select.appendChild(opt);
    updateToolbarAvatar('');
    return;
  }

  let mainAccountId = '';
  data.accounts.forEach((account) => {
    const opt = document.createElement('option');
    opt.value = account.accountId;
    opt.textContent = account.displayName;
    opt.selected = account.isMain;
    if (account.isMain) mainAccountId = account.accountId;
    select.appendChild(opt);
  });

  if (!mainAccountId && data.accounts.length > 0) {
    mainAccountId = data.accounts[0].accountId;
  }

  updateToolbarAvatar(mainAccountId);
}

const DEFAULT_AVATAR = 'https://fortnite-api.com/images/cosmetics/br/cid_890_athena_commando_f_choneheadhunter/variants/material/mat2.png';

/** In-memory renderer-side avatar cache: accountId → url */
const avatarCacheLocal = new Map<string, string>();

/** Preload all avatars on startup so they're instant */
async function preloadAllAvatars(): Promise<void> {
  try {
    const res = await window.glowAPI.accounts.getAllAvatars();
    if (res.success && res.avatars) {
      for (const [id, url] of Object.entries(res.avatars)) {
        avatarCacheLocal.set(id, url);
      }
      console.log(`[ToolbarAvatar] Preloaded ${avatarCacheLocal.size} avatars`);
      // Update toolbar with the already-cached avatar (no flash)
      const select = document.getElementById('account-select') as HTMLSelectElement | null;
      if (select?.value) {
        const cachedUrl = avatarCacheLocal.get(select.value);
        if (cachedUrl) {
          const img = document.getElementById('toolbar-avatar') as HTMLImageElement | null;
          if (img) { img.src = cachedUrl; img.style.display = 'block'; }
        }
      }
    }
  } catch (err) {
    console.error('[ToolbarAvatar] Preload failed:', err);
  }
}

/** Fetch and display the avatar for the selected account */
async function updateToolbarAvatar(accountId: string): Promise<void> {
  const img = document.getElementById('toolbar-avatar') as HTMLImageElement | null;
  if (!img) return;

  if (!accountId) {
    img.src = DEFAULT_AVATAR;
    img.style.display = 'block';
    return;
  }

  // 1. Show cached avatar instantly (no default flash)
  const cached = avatarCacheLocal.get(accountId);
  if (cached) {
    img.src = cached;
    img.style.display = 'block';
  } else {
    // Only show existing image (keep whatever was there), or default if nothing
    if (!img.src || img.src === '' || img.src === 'about:blank') {
      img.src = DEFAULT_AVATAR;
    }
    img.style.display = 'block';
  }

  // 2. Fetch fresh avatar in background (check if changed)
  try {
    const res = await window.glowAPI.accounts.getAvatar(accountId);
    if (res.success && res.url) {
      const oldUrl = avatarCacheLocal.get(accountId);
      avatarCacheLocal.set(accountId, res.url);
      // Only update the img if it actually changed
      if (res.url !== oldUrl) {
        img.src = res.url;
        img.style.display = 'block';
      }
      img.onerror = () => {
        img.src = DEFAULT_AVATAR;
        img.onerror = null;
      };
    }
  } catch {
    // Keep current avatar
  }
}

// ── Token validation (startup) ────────────────────────────────

/** Account IDs whose tokens could not be refreshed */
export const invalidAccounts = new Set<string>();

async function validateAccountTokens(): Promise<void> {
  try {
    const results = await window.glowAPI.accounts.validateAll();
    invalidAccounts.clear();
    const failed = results.filter((r) => !r.valid);
    for (const f of failed) invalidAccounts.add(f.accountId);

    const badge = document.getElementById('accounts-badge');
    if (badge) {
      if (failed.length > 0) {
        badge.textContent = String(failed.length);
        badge.style.display = '';
        // Update button tooltip
        const btn = document.getElementById('btn-accounts');
        if (btn) btn.title = `${failed.length} account(s) with expired auth`;
      } else {
        badge.style.display = 'none';
      }
    }
  } catch {
    // Silent — network down, etc.
  }
}

// ── Discord RPC indicator ────────────────────────────────────

function updateRpcIndicator(data: { connected: boolean; enabled: boolean }): void {
  const wrap = document.getElementById('toolbar-rpc-status');
  if (!wrap) return;

  // Hide entirely when disabled
  if (!data.enabled) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';

  const dot = document.getElementById('toolbar-rpc-dot');
  if (dot) {
    dot.classList.toggle('toolbar-rpc-dot--on', data.connected);
    dot.classList.toggle('toolbar-rpc-dot--off', !data.connected);
  }
  wrap.title = data.connected ? 'Discord RPC Connected' : 'Discord RPC Disconnected';
}

function initRpcIndicator(): void {
  window.glowAPI.discordRpc.getStatus().then((data) => {
    updateRpcIndicator(data);
  });
  window.glowAPI.discordRpc.onStatus((data) => {
    updateRpcIndicator(data);
  });
}

// ── Responsive toolbar split ──────────────────────────────────
// When the drag region shrinks below a threshold the toolbar is
// too crowded.  Move window controls into #header (thin top bar)
// and toggle the `toolbar-split` class on #app so CSS can adjust
// heights.

function setupToolbarOverflowWatch(): void {
  // Observe #toolbar (= window width), NOT .toolbar-drag.
  // Observing the drag region causes a feedback loop: moving controls
  // out of the toolbar frees up space → drag region grows → split
  // reverses → controls come back → drag shrinks → split again → flicker.
  const toolbar = document.getElementById('toolbar');
  const app = document.getElementById('app');
  if (!toolbar || !app) return;

  // Use hysteresis to prevent edge-case flicker:
  //   enter split  when toolbar width drops below SPLIT_AT
  //   leave split  only when toolbar width rises above UNSPLIT_AT
  const SPLIT_AT = 820;   // px – activate split
  const UNSPLIT_AT = 870; // px – deactivate split (must be > SPLIT_AT)
  let isSplit = false;

  function applySplit(): void {
    if (isSplit) return;
    isSplit = true;
    app!.classList.add('toolbar-split');

    const winCtrl = document.querySelector('.toolbar-window-controls') as HTMLElement | null;
    const headerSlot = document.getElementById('header-wincontrols');
    if (winCtrl && headerSlot) {
      headerSlot.appendChild(winCtrl);
    }
  }

  function removeSplit(): void {
    if (!isSplit) return;
    isSplit = false;
    app!.classList.remove('toolbar-split');

    const winCtrl = document.querySelector('.toolbar-window-controls') as HTMLElement | null;
    const toolbarRight = document.querySelector('.toolbar-right') as HTMLElement | null;
    if (winCtrl && toolbarRight) {
      toolbarRight.appendChild(winCtrl);
    }
  }

  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = entry.contentRect.width;
      if (!isSplit && w < SPLIT_AT) applySplit();
      else if (isSplit && w > UNSPLIT_AT) removeSplit();
    }
  });

  ro.observe(toolbar);
}
