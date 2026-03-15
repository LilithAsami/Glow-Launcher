import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ─── State ────────────────────────────────────────────────

interface CardState {
  loading: boolean;
  data: Record<string, string | null> | null;
  error: string | null;
}

const cards: Record<string, CardState> = {};

function getCard(id: string): CardState {
  if (!cards[id]) cards[id] = { loading: false, data: null, error: null };
  return cards[id];
}

// ─── Draw ─────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="auth-page">
      <h1 class="page-title">Auth</h1>
      <p class="page-subtitle">Account authentication tokens &amp; credentials</p>

      <div class="auth-grid">

        <!-- Device Auth Info -->
        ${renderCard('device-auth', 'Device Auth',
          'View the stored device auth credentials for the current account.',
          `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
          'View Device Auth'
        )}

        <!-- Access Token -->
        ${renderCard('access-token', 'Access Token',
          'Generate a fresh 8-hour access token via device_auth grant.',
          `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
          'Generate Access Token'
        )}

        <!-- Exchange Code -->
        ${renderCard('exchange-code', 'Exchange Code',
          'Generate a 5-minute exchange code for account transfers.',
          `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
          'Generate Exchange Code'
        )}

        <!-- Continuation Token -->
        ${renderCard('continuation', 'Continuation Token',
          'Extract the corrective-action continuation token (EULA, privacy, etc.).',
          `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
          'Extract Continuation'
        )}

        <!-- Verify Token -->
        ${renderCard('verify-token', 'Verify Token',
          'Verify the current account token and view its metadata.',
          `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
          'Verify Token'
        )}

      </div>
    </div>
  `;

  bindEvents();
}

function renderCard(
  id: string,
  title: string,
  description: string,
  iconSvg: string,
  buttonLabel: string,
): string {
  const state = getCard(id);
  return `
    <div class="auth-card" data-card="${id}">
      <div class="auth-card-header">
        <span class="auth-card-icon">${iconSvg}</span>
        <div>
          <h3 class="auth-card-title">${title}</h3>
          <p class="auth-card-desc">${description}</p>
        </div>
      </div>

      ${state.loading ? '<div class="auth-spinner"></div>' : ''}

      ${state.data ? renderDataBlock(state.data) : ''}
      ${state.error ? `<div class="auth-result error"><span>✕</span> ${escapeHtml(state.error)}</div>` : ''}

      <button class="btn btn-accent auth-action-btn" data-action="${id}" ${state.loading ? 'disabled' : ''}>
        ${state.loading ? 'Loading...' : buttonLabel}
      </button>
    </div>
  `;
}

function renderDataBlock(data: Record<string, string | null>): string {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return '';

  return `
    <div class="auth-data-block">
      ${entries.map(([key, value]) => `
        <div class="auth-data-row">
          <span class="auth-data-key">${escapeHtml(formatKey(key))}</span>
          <div class="auth-data-value-wrap">
            <span class="auth-data-value" title="${escapeAttr(value!)}">${escapeHtml(truncate(value!, 64))}</span>
            <button class="auth-copy-btn" data-copy="${escapeAttr(value!)}" title="Copy">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Events ───────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // Action buttons
  el.querySelectorAll('.auth-action-btn[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handleAction((btn as HTMLElement).dataset.action!);
    });
  });

  // Copy buttons
  el.querySelectorAll('.auth-copy-btn[data-copy]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = (btn as HTMLElement).dataset.copy || '';
      navigator.clipboard.writeText(text);
      const svg = btn.querySelector('svg');
      if (svg) {
        const original = svg.outerHTML;
        svg.outerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => {
          const current = btn.querySelector('svg');
          if (current) current.outerHTML = original;
        }, 1500);
      }
    });
  });
}

// ─── Actions ──────────────────────────────────────────────

async function handleAction(action: string): Promise<void> {
  const state = getCard(action);
  state.loading = true;
  state.data = null;
  state.error = null;
  draw();

  try {
    switch (action) {
      case 'device-auth': {
        const res = await window.glowAPI.authPage.getDeviceAuthInfo();
        if (!res.success) throw new Error(res.error || 'Failed');
        state.data = {
          'Account ID': res.accountId!,
          'Display Name': res.displayName!,
          'Device ID': res.deviceId!,
          'Secret': res.secret!,
        };
        break;
      }
      case 'access-token': {
        const res = await window.glowAPI.authPage.generateAccessToken();
        if (!res.success) throw new Error(res.error || 'Failed');
        state.data = {
          'Access Token': res.accessToken!,
          'Account ID': res.accountId!,
          'Display Name': res.displayName || null,
          'Client ID': res.clientId!,
          'Token Type': res.tokenType!,
          'Expires At': res.expiresAt!,
          'Refresh Token': res.refreshToken || null,
        };
        break;
      }
      case 'exchange-code': {
        const res = await window.glowAPI.authPage.generateExchangeCode();
        if (!res.success) throw new Error(res.error || 'Failed');
        state.data = {
          'Exchange Code': res.code!,
          'Expires In': `${res.expiresInSeconds} seconds`,
        };
        break;
      }
      case 'continuation': {
        const res = await window.glowAPI.authPage.getContinuationToken();
        if (!res.success) throw new Error(res.error || 'Failed');
        if (res.hasContinuation) {
          state.data = {
            'Continuation Token': res.continuation!,
            'Corrective Action': res.correctiveAction || 'Unknown',
          };
        } else {
          state.data = {
            'Status': res.message || 'No corrective action pending',
          };
        }
        break;
      }
      case 'verify-token': {
        const res = await window.glowAPI.authPage.verifyToken('');
        if (!res.success) throw new Error(res.error || 'Failed');
        const expiresAt = res.expiresAt ? new Date(res.expiresAt) : null;
        const isValid = expiresAt ? expiresAt > new Date() : false;
        state.data = {
          'Token': truncate(res.token!, 48),
          'Account ID': res.accountId!,
          'Client ID': res.clientId!,
          'Display Name': res.displayName || null,
          'Token Type': res.tokenType!,
          'Expires At': res.expiresAt!,
          'Valid': isValid ? 'Yes' : 'No',
          'App': res.app || null,
        };
        break;
      }
      default:
        throw new Error('Unknown action');
    }
  } catch (err: any) {
    state.error = err?.message || 'Unexpected error';
  }

  state.loading = false;
  draw();
}

// ─── Helpers ──────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatKey(key: string): string {
  return key;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

// ─── Page Definition ──────────────────────────────────────

export const authPageDef: PageDefinition = {
  id: 'auth',
  label: 'Auth',
  icon: `<img src="assets/icons/fnui/EG/Auth.png" alt="Auth" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 23,
  render(container) {
    el = container;
    // Reset states
    for (const k of Object.keys(cards)) {
      cards[k] = { loading: false, data: null, error: null };
    }
    draw();
    // Auto-refresh on account change
    window.glowAPI.accounts.onDataChanged(() => {
      if (el) {
        for (const k of Object.keys(cards)) {
          cards[k] = { loading: false, data: null, error: null };
        }
        draw();
      }
    });
  },
  cleanup() {
    el = null;
  },
};
