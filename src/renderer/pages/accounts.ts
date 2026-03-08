import type { PageDefinition, AccountsData, AuthUpdate } from '../../shared/types';
import { invalidAccounts } from '../core/toolbar';

const TOS_URL = 'https://drive.google.com/file/d/1jGCV_duxccWJo9n9dCt_eGf0iJ-CtFgz/view?usp=sharing';
const EXCHANGE_CODE_URL = 'https://www.epicgames.com/id/api/redirect?clientId=3f69e56c7649492c8cc29f1af08a8a12&responseType=code';
const AUTH_CODE_URL = 'https://www.epicgames.com/id/api/redirect?clientId=3f69e56c7649492c8cc29f1af08a8a12&responseType=code';
const MAX_ACCOUNTS = 25;

type View = 'loading' | 'tos' | 'list' | 'choose-method' | 'device-auth' | 'device-code' | 'exchange-input' | 'auth-code-input' | 'processing' | 'success' | 'error' | 'import-launchers' | 'import-results';

let view: View = 'loading';
let el: HTMLElement | null = null;
let data: AccountsData = { tosAccepted: false, accounts: [] };
let result: { displayName?: string; isUpdate?: boolean; message?: string } = {};
let importResults: Array<{ accountId: string; displayName: string; source: string; status: 'added' | 'existing' | 'error'; message?: string }> = [];
let deviceCodeData: { url: string; userCode: string } = { url: '', userCode: '' };

// ─── State Machine ───────────────────────────────────────────

function go(newView: View, extra?: Partial<typeof result>): void {
  view = newView;
  if (extra) result = { ...result, ...extra };
  if (el) draw();
}

function draw(): void {
  if (!el) return;
  const r: Record<View, () => void> = {
    'loading':          drawLoading,
    'tos':              drawTos,
    'list':             drawList,
    'choose-method':    drawChooseMethod,
    'device-auth':      drawDeviceAuth,
    'device-code':      drawDeviceCode,
    'exchange-input':   drawExchangeInput,
    'auth-code-input':  drawAuthCodeInput,
    'processing':       drawProcessing,
    'success':          drawSuccess,
    'error':            drawError,
    'import-launchers': drawImportLaunchers,
    'import-results':   drawImportResults,
  };
  r[view]();
}

// ─── Auth Update Handler ─────────────────────────────────────

function handleAuthUpdate(update: AuthUpdate): void {
  switch (update.status) {
    case 'starting':
      break;
    case 'waiting':
      if (update.userCode) {
        deviceCodeData = { url: update.verificationUrl ?? '', userCode: update.userCode };
        go('device-code');
      } else {
        go('device-auth');
      }
      break;
    case 'processing':
      go('processing');
      break;
    case 'success':
      result = { displayName: update.account?.displayName, isUpdate: update.isUpdate };
      go('success');
      break;
    case 'error':
      result = { message: update.message };
      go('error');
      break;
  }
}

// ─── View Renderers ──────────────────────────────────────────

function drawLoading(): void {
  el!.innerHTML = `
    <div class="auth-state">
      <div class="auth-spinner"></div>
      <p class="auth-state-text">Loading accounts...</p>
    </div>
  `;
}

function drawTos(): void {
  el!.innerHTML = `
    <div class="page-accounts">
      <h1 class="page-title">Terms of Service</h1>
      <p class="page-subtitle">Please read and accept before continuing</p>

      <div class="tos-panel">
        <div class="tos-icon">⚠️</div>
        <div class="tos-content">
          <p>Before registering your first account, you must accept our Terms of Service.</p>
          <p>Your credentials are stored <strong>locally on this device only</strong>. We do not collect or send your data anywhere.</p>
          <button class="tos-link-btn" id="btn-read-tos">Read Terms of Service ↗</button>
        </div>
      </div>

      <div class="tos-actions">
        <button class="btn btn-accent" id="btn-accept-tos">Accept & Continue</button>
        <button class="btn btn-ghost" id="btn-decline-tos">Cancel</button>
      </div>
    </div>
  `;

  el!.querySelector('#btn-read-tos')?.addEventListener('click', () => {
    window.glowAPI.shell.openExternal(TOS_URL);
  });
  el!.querySelector('#btn-accept-tos')?.addEventListener('click', async () => {
    await window.glowAPI.accounts.acceptTos();
    data.tosAccepted = true;
    go('choose-method');
  });
  el!.querySelector('#btn-decline-tos')?.addEventListener('click', () => {
    go('list');
  });
}

function drawList(): void {
  const accountsHtml = data.accounts.length === 0
    ? `<div class="empty-state">
         <span class="empty-icon">😢</span>
         <p class="empty-text">No accounts registered yet</p>
         <p class="empty-subtext">Add your first Epic Games account to get started</p>
       </div>`
    : data.accounts.map((acc) => {
        const authExpired = invalidAccounts.has(acc.accountId);
        return `
        <div class="account-card ${acc.isMain ? 'account-card-active' : ''} ${authExpired ? 'account-card-expired' : ''}" draggable="true" data-account-id="${acc.accountId}">
          <div class="account-drag-handle" title="Drag to reorder">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
            </svg>
          </div>
          <div class="account-avatar">
            <span class="account-avatar-letter">${acc.displayName.charAt(0).toUpperCase()}</span>
          </div>
          <div class="account-info">
            <span class="account-name">${acc.displayName}</span>
            <span class="account-status ${acc.isMain ? '' : 'account-status-inactive'} ${authExpired ? 'account-status-expired' : ''}">
              ${authExpired ? '⚠ Auth expired' : (acc.isMain ? 'Active' : 'Inactive')}
            </span>
          </div>
          <div class="account-actions">
            ${acc.isMain ? `
              <button class="account-action-btn" disabled title="Current main account">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
            ` : `
              <button class="account-action-btn account-switch-btn" data-id="${acc.accountId}" title="Set as main">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
              </button>
              <button class="account-action-btn account-action-danger account-remove-btn" data-id="${acc.accountId}" title="Remove account">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4
                           a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            `}
          </div>
        </div>
      `;
      }).join('');

  const canAdd = data.accounts.length < MAX_ACCOUNTS;

  el!.innerHTML = `
    <div class="page-accounts">
      <h1 class="page-title">Accounts</h1>
      <p class="page-subtitle">Manage your Epic Games accounts</p>

      <div class="accounts-list">${accountsHtml}</div>

      ${canAdd ? `
        <button class="account-add-btn" id="btn-add-account">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Account
        </button>
      ` : `<p class="account-limit-text">Maximum of ${MAX_ACCOUNTS} accounts reached</p>`}
    </div>
  `;

  // Events
  el!.querySelector('#btn-add-account')?.addEventListener('click', () => {
    if (!data.tosAccepted) {
      go('tos');
    } else {
      go('choose-method');
    }
  });

  el!.querySelectorAll('.account-switch-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id!;
      data = await window.glowAPI.accounts.setMain(id);
      go('list');
    });
  });

  el!.querySelectorAll('.account-remove-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id!;
      data = await window.glowAPI.accounts.remove(id);
      go('list');
    });
  });

  // ── Drag & drop reorder ──────────────────────────────────
  let dragSrcId: string | null = null;

  el!.querySelectorAll<HTMLElement>('.account-card[draggable]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragSrcId = card.dataset.accountId ?? null;
      card.classList.add('account-card-dragging');
      e.dataTransfer!.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('account-card-dragging');
      el!.querySelectorAll('.account-card-dragover').forEach((c) => c.classList.remove('account-card-dragover'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      card.classList.add('account-card-dragover');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('account-card-dragover');
    });

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('account-card-dragover');
      const targetId = card.dataset.accountId;
      if (!dragSrcId || !targetId || dragSrcId === targetId) return;

      // Compute new order
      const ids = data.accounts.map((a) => a.accountId);
      const fromIdx = ids.indexOf(dragSrcId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, dragSrcId);

      data = await window.glowAPI.accounts.reorder(ids);
      dragSrcId = null;
      go('list');
    });
  });
}

function drawChooseMethod(): void {
  el!.innerHTML = `
    <div class="page-accounts">
      <h1 class="page-title">Add Account</h1>
      <p class="page-subtitle">Choose how to register your Epic Games account</p>

      <div class="method-cards">
        <button class="method-card" id="method-easy">
          <div class="method-icon">🌐</div>
          <div class="method-info">
            <h3 class="method-title">Easy Login</h3>
            <p class="method-desc">Opens your browser — log in with Epic Games and we'll handle the rest automatically.</p>
          </div>
        </button>

        <button class="method-card" id="method-device-code">
          <div class="method-icon">📱</div>
          <div class="method-info">
            <h3 class="method-title">Device Code</h3>
            <p class="method-desc">Shows a code and URL you can enter from any device or browser without auto-opening.</p>
          </div>
        </button>

        <button class="method-card" id="method-authcode">
          <div class="method-icon">🔑</div>
          <div class="method-info">
            <h3 class="method-title">Authorization Code</h3>
            <p class="method-desc">Log in via Epic Games and paste the authorization code shown on the page.</p>
          </div>
        </button>

        <button class="method-card" id="method-exchange">
          <div class="method-icon">🔐</div>
          <div class="method-info">
            <h3 class="method-title">Exchange Code</h3>
            <p class="method-desc">Paste an exchange code manually. For advanced users.</p>
          </div>
        </button>

        <button class="method-card" id="method-import">
          <div class="method-icon">📦</div>
          <div class="method-info">
            <h3 class="method-title">Import from Launchers</h3>
            <p class="method-desc">Auto-detect accounts from Aerial and Spitfire launchers installed on this PC.</p>
          </div>
        </button>
      </div>

      <button class="btn btn-ghost btn-back" id="btn-back">← Back</button>
    </div>
  `;

  el!.querySelector('#method-easy')?.addEventListener('click', async () => {
    go('device-auth');
    await window.glowAPI.accounts.startDeviceAuth();
  });
  el!.querySelector('#method-device-code')?.addEventListener('click', async () => {
    go('processing');
    await window.glowAPI.accounts.startDeviceCode();
  });
  el!.querySelector('#method-authcode')?.addEventListener('click', () => {
    go('auth-code-input');
  });
  el!.querySelector('#method-exchange')?.addEventListener('click', () => {
    go('exchange-input');
  });
  el!.querySelector('#method-import')?.addEventListener('click', () => {
    go('import-launchers');
  });
  el!.querySelector('#btn-back')?.addEventListener('click', () => {
    go('list');
  });
}

function drawDeviceAuth(): void {
  el!.innerHTML = `
    <div class="auth-state">
      <div class="auth-pulse">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
             stroke="var(--accent)" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <h2 class="auth-state-title">Waiting for login...</h2>
      <p class="auth-state-text">A browser window has been opened.<br>Log in with your Epic Games account.</p>
      <p class="auth-state-hint">This will time out after 5 minutes.</p>
      <button class="btn btn-ghost" id="btn-cancel-auth">Cancel</button>
    </div>
  `;

  el!.querySelector('#btn-cancel-auth')?.addEventListener('click', async () => {
    await window.glowAPI.accounts.cancelAuth();
    go('choose-method');
  });
}

function drawDeviceCode(): void {
  el!.innerHTML = `
    <div class="auth-state">
      <div class="auth-pulse">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
             stroke="var(--accent)" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <h2 class="auth-state-title">Activate your device</h2>
      <p class="auth-state-text">Visit the URL below and enter the code when prompted.</p>
      <div class="device-code-box">
        <div class="device-code-url">${deviceCodeData.url}</div>
        <div class="device-code-user-code">${deviceCodeData.userCode}</div>
        <button class="btn btn-ghost device-code-copy" id="btn-copy-code">Copy code</button>
      </div>
      <button class="btn btn-accent" id="btn-open-browser" style="margin-top:8px">Open in Browser ↗</button>
      <p class="auth-state-hint" style="margin-top:12px">This will time out after 5 minutes.</p>
      <button class="btn btn-ghost" id="btn-cancel-auth">Cancel</button>
    </div>
  `;

  el!.querySelector('#btn-copy-code')?.addEventListener('click', () => {
    navigator.clipboard.writeText(deviceCodeData.userCode).then(() => {
      const btn = el!.querySelector('#btn-copy-code') as HTMLButtonElement;
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy code'; }, 1500); }
    });
  });
  el!.querySelector('#btn-open-browser')?.addEventListener('click', () => {
    window.glowAPI.shell.openExternal(deviceCodeData.url);
  });
  el!.querySelector('#btn-cancel-auth')?.addEventListener('click', async () => {
    await window.glowAPI.accounts.cancelAuth();
    go('choose-method');
  });
}

function drawExchangeInput(): void {
  el!.innerHTML = `
    <div class="page-accounts">
      <h1 class="page-title">Exchange Code</h1>
      <p class="page-subtitle">Enter your Epic Games exchange code</p>

      <div class="exchange-form">
        <p class="exchange-hint">Paste an exchange code obtained from another source (API tools, scripts, other launchers). Exchange codes cannot be generated directly from a browser link — use <strong>Authorization Code</strong> for browser login instead.</p>
        <div class="exchange-input-wrap">
          <input type="text" class="exchange-input" id="exchange-code-input"
                 placeholder="Paste your exchange code here" autocomplete="off" spellcheck="false">
          <button class="btn btn-accent" id="btn-submit-exchange">Submit</button>
        </div>
      </div>

      <button class="btn btn-ghost btn-back" id="btn-back">← Back</button>
    </div>
  `;

  el!.querySelector('#btn-submit-exchange')?.addEventListener('click', async () => {
    const input = el!.querySelector('#exchange-code-input') as HTMLInputElement;
    const code = input.value.trim();
    if (!code) return;
    go('processing');
    await window.glowAPI.accounts.submitExchangeCode(code);
  });
  el!.querySelector('#btn-back')?.addEventListener('click', () => {
    go('choose-method');
  });
  el!.querySelector('#exchange-code-input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      el!.querySelector<HTMLButtonElement>('#btn-submit-exchange')?.click();
    }
  });
}

function drawAuthCodeInput(): void {
  el!.innerHTML = `
    <div class="page-accounts">
      <h1 class="page-title">Authorization Code</h1>
      <p class="page-subtitle">Enter your Epic Games authorization code</p>

      <div class="exchange-form">
        <p class="exchange-hint">Click the link below, log in with your Epic Games account, and copy the <code>authorizationCode</code> value shown on the page.</p>
        <button class="tos-link-btn" id="btn-get-authcode">Get Authorization Code ↗</button>
        <div class="exchange-input-wrap">
          <input type="text" class="exchange-input" id="auth-code-input"
                 placeholder="Paste your authorization code here" autocomplete="off" spellcheck="false">
          <button class="btn btn-accent" id="btn-submit-authcode">Submit</button>
        </div>
      </div>

      <button class="btn btn-ghost btn-back" id="btn-back">← Back</button>
    </div>
  `;

  el!.querySelector('#btn-get-authcode')?.addEventListener('click', () => {
    window.glowAPI.shell.openExternal(AUTH_CODE_URL);
  });
  el!.querySelector('#btn-submit-authcode')?.addEventListener('click', async () => {
    const input = el!.querySelector('#auth-code-input') as HTMLInputElement;
    const code = input.value.trim();
    if (!code) return;
    go('processing');
    await window.glowAPI.accounts.submitAuthorizationCode(code);
  });
  el!.querySelector('#btn-back')?.addEventListener('click', () => {
    go('choose-method');
  });
  el!.querySelector('#auth-code-input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      el!.querySelector<HTMLButtonElement>('#btn-submit-authcode')?.click();
    }
  });
}

function drawProcessing(): void {
  el!.innerHTML = `
    <div class="auth-state">
      <div class="auth-spinner"></div>
      <h2 class="auth-state-title">Processing...</h2>
      <p class="auth-state-text">Setting up your account. This won't take long.</p>
    </div>
  `;
}

function drawImportLaunchers(): void {
  el!.innerHTML = `
    <div class="auth-state">
      <div class="auth-spinner"></div>
      <h2 class="auth-state-title">Scanning launchers...</h2>
      <p class="auth-state-text">Looking for accounts in Aerial &amp; Spitfire on this PC.</p>
    </div>
  `;

  // Start the import immediately
  window.glowAPI.accounts.importFromLaunchers().then(async (res) => {
    importResults = res.results;
    if (importResults.length === 0) {
      result = { message: 'No accounts found. Make sure Aerial or Spitfire Launcher has been used on this PC.' };
      go('error');
    } else {
      // Refresh data so the list is up to date
      data = await window.glowAPI.accounts.getAll();
      go('import-results');
    }
  }).catch((err: any) => {
    result = { message: err?.message || 'Import failed unexpectedly' };
    go('error');
  });
}

function drawImportResults(): void {
  const added = importResults.filter(r => r.status === 'added');
  const existing = importResults.filter(r => r.status === 'existing');
  const failed = importResults.filter(r => r.status === 'error');

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const rowsHtml = importResults.map(r => {
    let icon = '', cls = '', label = '';
    if (r.status === 'added') {
      icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
      cls = 'import-row--added';
      label = 'Added';
    } else if (r.status === 'existing') {
      icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      cls = 'import-row--existing';
      label = 'Already exists';
    } else {
      icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      cls = 'import-row--error';
      label = r.message || 'Failed';
    }
    return `<div class="import-row ${cls}">
      <span class="import-row-icon">${icon}</span>
      <div class="import-row-info">
        <span class="import-row-name">${esc(r.displayName)}</span>
        <span class="import-row-source">${esc(r.source)}</span>
      </div>
      <span class="import-row-status">${esc(label)}</span>
    </div>`;
  }).join('');

  el!.innerHTML = `
    <div class="page-accounts">
      <h1 class="page-title">Import Summary</h1>
      <p class="page-subtitle">${importResults.length} account${importResults.length !== 1 ? 's' : ''} found${added.length ? ` · ${added.length} added` : ''}${existing.length ? ` · ${existing.length} already in GLOW` : ''}${failed.length ? ` · ${failed.length} failed` : ''}</p>

      <div class="import-results-list">${rowsHtml}</div>

      <button class="btn btn-accent" id="btn-import-done">Done</button>
    </div>
  `;

  el!.querySelector('#btn-import-done')?.addEventListener('click', async () => {
    data = await window.glowAPI.accounts.getAll();
    go('list');
  });
}

function drawSuccess(): void {
  el!.innerHTML = `
    <div class="auth-state">
      <div class="auth-result-icon auth-result-success">✓</div>
      <h2 class="auth-state-title">${result.isUpdate ? 'Account Updated!' : 'Account Added!'}</h2>
      <p class="auth-state-text"><strong>${result.displayName || 'Unknown'}</strong> has been ${result.isUpdate ? 'updated' : 'registered'} successfully.</p>
      <button class="btn btn-accent" id="btn-done">Done</button>
    </div>
  `;

  el!.querySelector('#btn-done')?.addEventListener('click', async () => {
    data = await window.glowAPI.accounts.getAll();
    go('list');
  });
}

function drawError(): void {
  el!.innerHTML = `
    <div class="auth-state">
      <div class="auth-result-icon auth-result-error">✕</div>
      <h2 class="auth-state-title">Something went wrong</h2>
      <p class="auth-state-text">${result.message || 'An unknown error occurred.'}</p>
      <div class="auth-error-actions">
        <button class="btn btn-accent" id="btn-retry">Try Again</button>
        <button class="btn btn-ghost" id="btn-back-to-list">Back to Accounts</button>
      </div>
    </div>
  `;

  el!.querySelector('#btn-retry')?.addEventListener('click', () => {
    go('choose-method');
  });
  el!.querySelector('#btn-back-to-list')?.addEventListener('click', async () => {
    data = await window.glowAPI.accounts.getAll();
    go('list');
  });
}

// ─── Page Definition ─────────────────────────────────────────

export const accountsPage: PageDefinition = {
  id: 'accounts',
  label: 'Accounts',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>`,
  order: 50,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    view = 'loading';
    result = {};
    draw();

    // Listen for auth updates from main process
    window.glowAPI.accounts.onAuthUpdate(handleAuthUpdate);

    // Load data and show list
    data = await window.glowAPI.accounts.getAll();
    go('list');
  },

  cleanup(): void {
    window.glowAPI.accounts.offAuthUpdate();
    window.glowAPI.accounts.cancelAuth();
    el = null;
  },
};
