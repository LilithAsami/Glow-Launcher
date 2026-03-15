import type {
  PageDefinition,
  SecurityAccountInfo,
  SecurityDeviceAuth,
  SecurityBanStatus,
} from '../../shared/types';

let el: HTMLElement | null = null;
let accountInfo: SecurityAccountInfo | null = null;
let deviceAuths: SecurityDeviceAuth[] = [];
let banStatus: SecurityBanStatus | null = null;
let loading = true;
let error: string | null = null;
let sectionLoading: Record<string, boolean> = {};

// ─── Data Fetching ───────────────────────────────────────────

async function loadAllData(): Promise<void> {
  loading = true;
  error = null;
  draw();

  try {
    const [info, auths, ban] = await Promise.all([
      window.glowAPI.security.getAccountInfo(),
      window.glowAPI.security.getDeviceAuths(),
      window.glowAPI.security.checkBan(),
    ]);
    accountInfo = info;
    deviceAuths = auths;
    banStatus = ban;
  } catch (err: any) {
    error = err?.message || 'Failed to load security data';
  }

  loading = false;
  draw();
}

// ─── Drawing ─────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading) {
    el.innerHTML = `
      <div class="page-security">
        <h1 class="page-title">Security</h1>
        <p class="page-subtitle">Account information &amp; security management</p>
        <div class="sec-loading">
          <div class="sec-spinner"></div>
          <p>Loading account data...</p>
        </div>
      </div>
    `;
    return;
  }

  if (error) {
    el.innerHTML = `
      <div class="page-security">
        <h1 class="page-title">Security</h1>
        <p class="page-subtitle">Account information &amp; security management</p>
        <div class="sec-error-state">
          <span class="sec-error-icon">✕</span>
          <p>${error}</p>
          <button class="btn btn-accent" id="sec-retry">Retry</button>
        </div>
      </div>
    `;
    el.querySelector('#sec-retry')?.addEventListener('click', loadAllData);
    return;
  }

  el.innerHTML = `
    <div class="page-security">
      <h1 class="page-title">Security</h1>
      <p class="page-subtitle">Account information &amp; security management</p>

      <div class="sec-grid">
        <!-- Account Info Card -->
        <div class="sec-card sec-card-wide">
          <div class="sec-card-header">
            <div class="sec-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h2 class="sec-card-title">Account Info</h2>
            <button class="sec-card-action" id="sec-panel-btn" title="Open Epic Games Panel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Panel
            </button>
          </div>
          <div class="sec-card-body">
            ${renderAccountInfo()}
          </div>
        </div>

        <!-- Ban Status Card -->
        <div class="sec-card">
          <div class="sec-card-header">
            <div class="sec-card-icon sec-icon-${banStatus?.banned ? 'danger' : 'success'}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h2 class="sec-card-title">Ban Status</h2>
          </div>
          <div class="sec-card-body">
            ${renderBanStatus()}
          </div>
        </div>

        <!-- Device Auths Card -->
        <div class="sec-card sec-card-full">
          <div class="sec-card-header">
            <div class="sec-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
              </svg>
            </div>
            <h2 class="sec-card-title">Device Authorizations</h2>
            <span class="sec-card-count">${deviceAuths.length}</span>
            <button class="sec-card-action sec-action-danger" id="sec-delete-all-auths" title="Delete all device auths">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Delete All
            </button>
          </div>
          <div class="sec-card-body sec-auths-body">
            ${renderDeviceAuths()}
          </div>
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

// ─── Section Renderers ───────────────────────────────────────

function renderAccountInfo(): string {
  if (!accountInfo) return '<p class="sec-empty">No data available</p>';

  const svg = (d: string) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  const icons = {
    user:     svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    key:      svg('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>'),
    mail:     svg('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
    check:    svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    shield:   svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    globe:    svg('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
    phone:    svg('<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>'),
    lang:     svg('<path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/>'),
    file:     svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
    building: svg('<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="10" y2="6"/><line x1="14" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/>'),
    clock:    svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    edit:     svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
    refresh:  svg('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
    alert:    svg('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    userCheck: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>'),
  };

  const fields = [
    { label: 'Display Name', value: accountInfo.displayName, icon: icons.user },
    { label: 'Account ID', value: accountInfo.id, mono: true, icon: icons.key },
    { label: 'Email', value: accountInfo.email, icon: icons.mail },
    { label: 'Email Verified', value: accountInfo.emailVerified, bool: true, icon: icons.check },
    { label: '2FA Enabled', value: accountInfo.tfaEnabled, bool: true, icon: icons.shield },
    { label: 'Country', value: accountInfo.country, icon: icons.globe },
    { label: 'Phone', value: accountInfo.phoneNumber, icon: icons.phone },
    { label: 'Language', value: accountInfo.preferredLanguage, icon: icons.lang },
    { label: 'Name', value: accountInfo.name, icon: icons.file },
    { label: 'Last Name', value: accountInfo.lastName, icon: icons.file },
    { label: 'Company', value: accountInfo.company, icon: icons.building },
    { label: 'Last Login', value: accountInfo.lastLogin ? formatDate(accountInfo.lastLogin) : null, icon: icons.clock },
    { label: 'Name Changes', value: accountInfo.numberOfDisplayNameChanges, icon: icons.edit },
    { label: 'Can Change Name', value: accountInfo.canUpdateDisplayName, bool: true, icon: icons.refresh },
    { label: 'Failed Logins', value: accountInfo.failedLoginAttempts, icon: icons.alert },
    { label: 'Minor Verified', value: accountInfo.minorVerified, bool: true, icon: icons.userCheck },
  ];

  return `<div class="sec-info-grid">${fields.map((f) => {
    let displayVal: string;
    if (f.bool) {
      displayVal = f.value
        ? '<span class="sec-val-yes">Yes</span>'
        : '<span class="sec-val-no">No</span>';
    } else if (f.value === null || f.value === undefined || f.value === '') {
      displayVal = '<span class="sec-val-na">N/A</span>';
    } else if (f.mono) {
      displayVal = `<span class="sec-val-mono">${f.value}</span>`;
    } else {
      displayVal = `<span class="sec-val">${f.value}</span>`;
    }
    return `
      <div class="sec-info-item">
        <span class="sec-info-icon">${f.icon}</span>
        <span class="sec-info-label">${f.label}</span>
        ${displayVal}
      </div>`;
  }).join('')}</div>`;
}

function renderBanStatus(): string {
  if (!banStatus) return '<p class="sec-empty">Unable to check</p>';

  const banIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;
  const okIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  if (banStatus.banned) {
    return `
      <div class="sec-ban sec-ban-yes">
        <span class="sec-ban-icon sec-ban-icon-danger">${banIcon}</span>
        <div class="sec-ban-info">
          <strong>Account is BANNED</strong>
          ${banStatus.allowedActions.length > 0
            ? `<p class="sec-ban-actions">Allowed: ${banStatus.allowedActions.join(', ')}</p>`
            : '<p class="sec-ban-actions">No allowed actions</p>'}
        </div>
      </div>`;
  }

  return `
    <div class="sec-ban sec-ban-no">
      <span class="sec-ban-icon sec-ban-icon-ok">${okIcon}</span>
      <div class="sec-ban-info">
        <strong>Account is NOT banned</strong>
        <p class="sec-ban-actions">All actions allowed</p>
      </div>
    </div>`;
}

function renderDeviceAuths(): string {
  if (sectionLoading['auths']) {
    return '<div class="sec-loading sec-loading-sm"><div class="sec-spinner"></div><p>Processing...</p></div>';
  }

  if (deviceAuths.length === 0) {
    return '<p class="sec-empty">No device authorizations found</p>';
  }

  return `<div class="sec-auths-list">${deviceAuths.map((auth) => `
    <div class="sec-auth-row" data-device-id="${auth.deviceId}">
      <div class="sec-auth-info">
        <span class="sec-auth-location">${auth.location}</span>
        <span class="sec-auth-meta">${auth.ipAddress} · ${auth.dateTime ? formatDate(auth.dateTime) : 'Unknown date'}</span>
        <span class="sec-auth-agent">${truncate(auth.userAgent, 80)}</span>
      </div>
      <button class="sec-auth-delete" data-device-id="${auth.deviceId}" title="Delete this device auth">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>`).join('')}</div>`;
}

// ─── Events ──────────────────────────────────────────────────

function bindEvents(): void {
  // Panel button
  el?.querySelector('#sec-panel-btn')?.addEventListener('click', async () => {
    const btn = el?.querySelector('#sec-panel-btn') as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<div class="sec-spinner sec-spinner-sm"></div> Opening...';
    try {
      const url = await window.glowAPI.security.getExchangeUrl();
      await window.glowAPI.shell.openExternal(url);
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Panel`;
    } catch {
      btn.innerHTML = '✕ Failed';
      setTimeout(() => {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Panel`;
      }, 2000);
    }
    btn.disabled = false;
  });

  // Delete individual device auth
  el?.querySelectorAll('.sec-auth-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const deviceId = (btn as HTMLElement).dataset.deviceId;
      if (!deviceId) return;

      const row = el?.querySelector(`.sec-auth-row[data-device-id="${deviceId}"]`);
      if (row) row.classList.add('sec-auth-deleting');

      try {
        await window.glowAPI.security.deleteDeviceAuth(deviceId);
        deviceAuths = deviceAuths.filter((a) => a.deviceId !== deviceId);
        draw();
      } catch {
        if (row) row.classList.remove('sec-auth-deleting');
      }
    });
  });

  // Delete all device auths
  el?.querySelector('#sec-delete-all-auths')?.addEventListener('click', async () => {
    const btn = el?.querySelector('#sec-delete-all-auths') as HTMLButtonElement | null;
    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = '<div class="sec-spinner sec-spinner-sm"></div> Deleting...';
    sectionLoading['auths'] = true;
    // Re-render just the auths body
    const authsBody = el?.querySelector('.sec-auths-body');
    if (authsBody) authsBody.innerHTML = renderDeviceAuths();

    try {
      const result = await window.glowAPI.security.deleteAllDeviceAuths();
      // Reload auths
      deviceAuths = await window.glowAPI.security.getDeviceAuths();
      sectionLoading['auths'] = false;
      draw();
    } catch {
      sectionLoading['auths'] = false;
      draw();
    }
  });

  // Refresh data on account change
  window.glowAPI.accounts.onDataChanged(() => {
    loadAllData();
  });
}

// ─── Helpers ─────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

// ─── Page Definition ─────────────────────────────────────────

export const securityPage: PageDefinition = {
  id: 'security',
  label: 'Security',
  icon: `<img src="assets/icons/fnui/EG/security-button.png" alt="Security" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 20,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    accountInfo = null;
    deviceAuths = [];
    banStatus = null;
    loading = true;
    error = null;
    sectionLoading = {};
    await loadAllData();
  },

  cleanup(): void {
    el = null;
  },
};
