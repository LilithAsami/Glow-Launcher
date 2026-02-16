import type { Router } from './router';

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

        <button class="toolbar-btn-launch" id="btn-launch" title="Launch game">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          Launch
        </button>
      </div>

      <div class="toolbar-right">
        <button class="toolbar-btn-accounts" id="btn-accounts" title="Manage accounts">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  // Load real accounts into select
  refreshAccountSelect();

  // Preload all avatars on startup (background, no flash)
  preloadAllAvatars();

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

  // Accounts button → Accounts page
  document.getElementById('btn-accounts')?.addEventListener('click', () => {
    router.navigate('accounts');
  });

  // Launch button → Launch game
  const launchBtn = document.getElementById('btn-launch');
  launchBtn?.addEventListener('click', async () => {
    launchBtn.classList.add('toolbar-btn-launching');
    launchBtn.setAttribute('disabled', 'true');
    const origHtml = launchBtn.innerHTML;
    launchBtn.innerHTML = `
      <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
      </svg>
      Launching...`;

    try {
      const result = await window.glowAPI.launch.start();
      if (!result.success) {
        launchBtn.innerHTML = `<span style="color:#ff4444">✕</span> Failed`;
        setTimeout(() => { launchBtn.innerHTML = origHtml; launchBtn.classList.remove('toolbar-btn-launching'); launchBtn.removeAttribute('disabled'); }, 3000);
        return;
      }
      launchBtn.innerHTML = `<span style="color:#00c853">✓</span> Launched!`;
      setTimeout(() => { launchBtn.innerHTML = origHtml; launchBtn.classList.remove('toolbar-btn-launching'); launchBtn.removeAttribute('disabled'); }, 3000);
    } catch {
      launchBtn.innerHTML = `<span style="color:#ff4444">✕</span> Error`;
      setTimeout(() => { launchBtn.innerHTML = origHtml; launchBtn.classList.remove('toolbar-btn-launching'); launchBtn.removeAttribute('disabled'); }, 3000);
    }
  });
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
