/**
 * Epic Account — Combined page for Security, Account Management, and EULA.
 * Uses tab navigation to switch between the three sections.
 */

import type {
  PageDefinition,
  SecurityAccountInfo,
  SecurityDeviceAuth,
  SecurityBanStatus,
} from '../../shared/types';

let el: HTMLElement | null = null;
let activeTab: 'security' | 'account' | 'eula' = 'security';

// ══════════════════════════════════════════════════════════════
//  SECURITY STATE
// ══════════════════════════════════════════════════════════════

let secInfo: SecurityAccountInfo | null = null;
let secAuths: SecurityDeviceAuth[] = [];
let secBan: SecurityBanStatus | null = null;
let secLoading = true;
let secError: string | null = null;
let secSectionLoading: Record<string, boolean> = {};

// ══════════════════════════════════════════════════════════════
//  ACCOUNT MGMT STATE
// ══════════════════════════════════════════════════════════════

interface AccountInfoData {
  displayName: string;
  email: string;
  emailVerified: boolean;
  name: string;
  lastName: string;
  preferredLanguage: string;
  phoneNumber: string;
  company: string;
  canUpdateDisplayName: boolean;
  lastDisplayNameChange: string | null;
  displayNameAvailableAt: string | null;
}

let acctLoading = true;
let acctError: string | null = null;
let acctInfo: AccountInfoData | null = null;
let acctEditingField: string | null = null;
let acctSaving = false;

// ══════════════════════════════════════════════════════════════
//  EULA STATE
// ══════════════════════════════════════════════════════════════

interface EulaCardState {
  loading: boolean;
  result: string | null;
  error: string | null;
  accepted: boolean;
}

const eulaCards: Record<string, EulaCardState> = {
  eula: { loading: false, result: null, error: null, accepted: false },
  privacy: { loading: false, result: null, error: null, accepted: false },
};

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function secFormatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

function secTruncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

function acctFormatDate(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
}

function acctTimeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'now';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

// ══════════════════════════════════════════════════════════════
//  DATA LOADING
// ══════════════════════════════════════════════════════════════

async function loadSecurity(): Promise<void> {
  secLoading = true; secError = null; draw();
  try {
    const [info, auths, ban] = await Promise.all([
      window.glowAPI.security.getAccountInfo(),
      window.glowAPI.security.getDeviceAuths(),
      window.glowAPI.security.checkBan(),
    ]);
    secInfo = info; secAuths = auths; secBan = ban;
  } catch (err: any) { secError = err?.message || 'Failed to load security data'; }
  secLoading = false; draw();
}

async function loadAccount(): Promise<void> {
  acctLoading = true; acctError = null; draw();
  try {
    const res = await window.glowAPI.accountMgmt.getInfo();
    if (res.success && res.info) acctInfo = res.info;
    else acctError = res.error || 'Failed to load account info';
  } catch (err: any) { acctError = err?.message || 'Failed to load account info'; }
  acctLoading = false; draw();
}

async function acctSaveField(field: string, value: string): Promise<void> {
  if (acctSaving) return;
  acctSaving = true; draw();
  try {
    const res = await window.glowAPI.accountMgmt.updateField(field, value);
    if (res.success && res.info) { acctInfo = res.info; acctEditingField = null; showToast('Updated successfully', 'success'); }
    else showToast(res.error || 'Update failed', 'error');
  } catch (err: any) { showToast(err?.message || 'Update failed', 'error'); }
  acctSaving = false; draw();
}

function showToast(message: string, type: 'success' | 'error'): void {
  if (!el) return;
  const existing = el.querySelector('.acctmgmt-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `acctmgmt-toast acctmgmt-toast-${type}`;
  toast.textContent = message;
  el.querySelector('.ea-page')?.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ══════════════════════════════════════════════════════════════
//  EULA ACTIONS
// ══════════════════════════════════════════════════════════════

async function handleEulaAction(id: string): Promise<void> {
  const state = eulaCards[id];
  state.loading = true; state.result = null; state.error = null; draw();
  try {
    let res: { success: boolean; message: string };
    if (id === 'eula') res = await window.glowAPI.eula.acceptEula();
    else res = await window.glowAPI.eula.acceptPrivacy();
    if (res.success) state.result = res.message || 'Accepted successfully';
    else state.error = res.message || 'Request failed';
  } catch (err: any) { state.error = err?.message || 'Unexpected error'; }
  state.loading = false; draw();
}

// ══════════════════════════════════════════════════════════════
//  MAIN DRAW
// ══════════════════════════════════════════════════════════════

function draw(): void {
  if (!el) return;

  const tabs = [
    { id: 'security', label: 'Security', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
    { id: 'account',  label: 'Account',  icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
    { id: 'eula',     label: 'EULA',     icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
  ];

  const tabsHtml = tabs.map(t =>
    `<button class="ea-tab ${activeTab === t.id ? 'ea-tab--active' : ''}" data-tab="${t.id}">${t.icon}<span>${t.label}</span></button>`
  ).join('');

  let content = '';
  if (activeTab === 'security') content = drawSecurity();
  else if (activeTab === 'account') content = drawAccount();
  else if (activeTab === 'eula') content = drawEula();

  el.innerHTML = `
    <div class="ea-page">
      <h1 class="page-title">Epic Account</h1>
      <p class="page-subtitle">Security, account management &amp; agreements</p>
      <div class="ea-tabs">${tabsHtml}</div>
      <div class="ea-content">${content}</div>
    </div>
  `;

  // Tab switching
  el.querySelectorAll<HTMLButtonElement>('.ea-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab as typeof activeTab;
      if (tab && tab !== activeTab) {
        activeTab = tab;
        // Lazy-load tab data
        if (tab === 'security' && !secInfo && !secLoading && !secError) loadSecurity();
        else if (tab === 'account' && !acctInfo && !acctLoading && !acctError) loadAccount();
        else draw();
      }
    });
  });

  // Bind tab-specific events
  if (activeTab === 'security') bindSecurityEvents();
  else if (activeTab === 'account') bindAccountEvents();
  else if (activeTab === 'eula') bindEulaEvents();
}

// ══════════════════════════════════════════════════════════════
//  SECURITY TAB
// ══════════════════════════════════════════════════════════════

function drawSecurity(): string {
  if (secLoading) {
    return `<div class="sec-loading"><div class="sec-spinner"></div><p>Loading account data...</p></div>`;
  }
  if (secError) {
    return `
      <div class="sec-error-state">
        <span class="sec-error-icon">✕</span>
        <p>${secError}</p>
        <button class="btn btn-accent" id="sec-retry">Retry</button>
      </div>`;
  }

  return `
    <div class="sec-grid">
      <!-- Account Info Card -->
      <div class="sec-card sec-card-wide">
        <div class="sec-card-header">
          <div class="sec-card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h2 class="sec-card-title">Account Info</h2>
          <button class="sec-card-action" id="sec-panel-btn" title="Open Epic Games Panel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Panel
          </button>
        </div>
        <div class="sec-card-body">${renderAccountInfo()}</div>
      </div>

      <!-- Ban Status Card -->
      <div class="sec-card">
        <div class="sec-card-header">
          <div class="sec-card-icon sec-icon-${secBan?.banned ? 'danger' : 'success'}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h2 class="sec-card-title">Ban Status</h2>
        </div>
        <div class="sec-card-body">${renderBanStatus()}</div>
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
          <span class="sec-card-count">${secAuths.length}</span>
          <button class="sec-card-action sec-action-danger" id="sec-delete-all-auths" title="Delete all device auths">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete All
          </button>
        </div>
        <div class="sec-card-body sec-auths-body">${renderDeviceAuths()}</div>
      </div>
    </div>`;
}

function renderAccountInfo(): string {
  if (!secInfo) return '<p class="sec-empty">No data available</p>';

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
    { label: 'Display Name', value: secInfo.displayName, icon: icons.user },
    { label: 'Account ID', value: secInfo.id, mono: true, icon: icons.key },
    { label: 'Email', value: secInfo.email, icon: icons.mail },
    { label: 'Email Verified', value: secInfo.emailVerified, bool: true, icon: icons.check },
    { label: '2FA Enabled', value: secInfo.tfaEnabled, bool: true, icon: icons.shield },
    { label: 'Country', value: secInfo.country, icon: icons.globe },
    { label: 'Phone', value: secInfo.phoneNumber, icon: icons.phone },
    { label: 'Language', value: secInfo.preferredLanguage, icon: icons.lang },
    { label: 'Name', value: secInfo.name, icon: icons.file },
    { label: 'Last Name', value: secInfo.lastName, icon: icons.file },
    { label: 'Company', value: secInfo.company, icon: icons.building },
    { label: 'Last Login', value: secInfo.lastLogin ? secFormatDate(secInfo.lastLogin) : null, icon: icons.clock },
    { label: 'Name Changes', value: secInfo.numberOfDisplayNameChanges, icon: icons.edit },
    { label: 'Can Change Name', value: secInfo.canUpdateDisplayName, bool: true, icon: icons.refresh },
    { label: 'Failed Logins', value: secInfo.failedLoginAttempts, icon: icons.alert },
    { label: 'Minor Verified', value: secInfo.minorVerified, bool: true, icon: icons.userCheck },
  ];

  return `<div class="sec-info-grid">${fields.map((f) => {
    let displayVal: string;
    if (f.bool) displayVal = f.value ? '<span class="sec-val-yes">Yes</span>' : '<span class="sec-val-no">No</span>';
    else if (f.value === null || f.value === undefined || f.value === '') displayVal = '<span class="sec-val-na">N/A</span>';
    else if (f.mono) displayVal = `<span class="sec-val-mono">${f.value}</span>`;
    else displayVal = `<span class="sec-val">${f.value}</span>`;
    return `<div class="sec-info-item"><span class="sec-info-icon">${f.icon}</span><span class="sec-info-label">${f.label}</span>${displayVal}</div>`;
  }).join('')}</div>`;
}

function renderBanStatus(): string {
  if (!secBan) return '<p class="sec-empty">Unable to check</p>';
  const banIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;
  const okIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  if (secBan.banned) {
    return `<div class="sec-ban sec-ban-yes"><span class="sec-ban-icon sec-ban-icon-danger">${banIcon}</span><div class="sec-ban-info"><strong>Account is BANNED</strong>${secBan.allowedActions.length > 0 ? `<p class="sec-ban-actions">Allowed: ${secBan.allowedActions.join(', ')}</p>` : '<p class="sec-ban-actions">No allowed actions</p>'}</div></div>`;
  }
  return `<div class="sec-ban sec-ban-no"><span class="sec-ban-icon sec-ban-icon-ok">${okIcon}</span><div class="sec-ban-info"><strong>Account is NOT banned</strong><p class="sec-ban-actions">All actions allowed</p></div></div>`;
}

function renderDeviceAuths(): string {
  if (secSectionLoading['auths']) return '<div class="sec-loading sec-loading-sm"><div class="sec-spinner"></div><p>Processing...</p></div>';
  if (secAuths.length === 0) return '<p class="sec-empty">No device authorizations found</p>';
  return `<div class="sec-auths-list">${secAuths.map((auth) => `
    <div class="sec-auth-row" data-device-id="${auth.deviceId}">
      <div class="sec-auth-info">
        <span class="sec-auth-location">${auth.location}</span>
        <span class="sec-auth-meta">${auth.ipAddress} · ${auth.dateTime ? secFormatDate(auth.dateTime) : 'Unknown date'}</span>
        <span class="sec-auth-agent">${secTruncate(auth.userAgent, 80)}</span>
      </div>
      <button class="sec-auth-delete" data-device-id="${auth.deviceId}" title="Delete this device auth">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>`).join('')}</div>`;
}

function bindSecurityEvents(): void {
  if (!el) return;

  el.querySelector('#sec-retry')?.addEventListener('click', loadSecurity);

  // Panel button
  el.querySelector('#sec-panel-btn')?.addEventListener('click', async () => {
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

  // Delete individual auth
  el.querySelectorAll('.sec-auth-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const deviceId = (btn as HTMLElement).dataset.deviceId;
      if (!deviceId) return;
      const row = el?.querySelector(`.sec-auth-row[data-device-id="${deviceId}"]`);
      if (row) row.classList.add('sec-auth-deleting');
      try {
        await window.glowAPI.security.deleteDeviceAuth(deviceId);
        secAuths = secAuths.filter((a) => a.deviceId !== deviceId);
        draw();
      } catch { if (row) row.classList.remove('sec-auth-deleting'); }
    });
  });

  // Delete all auths
  el.querySelector('#sec-delete-all-auths')?.addEventListener('click', async () => {
    const btn = el?.querySelector('#sec-delete-all-auths') as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<div class="sec-spinner sec-spinner-sm"></div> Deleting...';
    secSectionLoading['auths'] = true;
    const authsBody = el?.querySelector('.sec-auths-body');
    if (authsBody) authsBody.innerHTML = renderDeviceAuths();
    try {
      await window.glowAPI.security.deleteAllDeviceAuths();
      secAuths = await window.glowAPI.security.getDeviceAuths();
      secSectionLoading['auths'] = false; draw();
    } catch { secSectionLoading['auths'] = false; draw(); }
  });
}

// ══════════════════════════════════════════════════════════════
//  ACCOUNT MGMT TAB
// ══════════════════════════════════════════════════════════════

interface FieldDef {
  key: string;
  label: string;
  value: string;
  editable: boolean;
  statusHtml?: string;
}

function drawAccount(): string {
  if (acctLoading) {
    return `<div class="acctmgmt-loading"><div class="acctmgmt-spinner"></div><p>Loading account info...</p></div>`;
  }
  if (acctError) {
    return `<div class="acctmgmt-error"><p>⚠ ${esc(acctError)}</p><button class="btn btn-accent" id="acct-retry">Retry</button></div>`;
  }
  if (!acctInfo) return '';

  const fields = buildAcctFields(acctInfo);
  return `
    <div class="acctmgmt-grid">
      ${fields.map(f => renderAcctField(f)).join('')}
    </div>`;
}

function buildAcctFields(data: AccountInfoData): FieldDef[] {
  const fields: FieldDef[] = [];

  let dnStatus = '';
  if (data.canUpdateDisplayName) {
    dnStatus = '<span class="acctmgmt-status acctmgmt-status-ok">✓ Change available</span>';
  } else if (data.displayNameAvailableAt) {
    const dt = acctFormatDate(data.displayNameAvailableAt);
    const remaining = acctTimeUntil(data.displayNameAvailableAt);
    dnStatus = `<span class="acctmgmt-status acctmgmt-status-cooldown">✕ Cooldown — available in ${esc(remaining)} (${esc(dt)})</span>`;
  } else {
    dnStatus = '<span class="acctmgmt-status acctmgmt-status-cooldown">✕ Change not available</span>';
  }
  fields.push({ key: 'displayName', label: 'Display Name', value: data.displayName, editable: data.canUpdateDisplayName, statusHtml: dnStatus });

  let emailStatus = data.emailVerified
    ? '<span class="acctmgmt-status acctmgmt-status-ok">✓ Email verified</span>'
    : '<span class="acctmgmt-status acctmgmt-status-cooldown">✕ Email not verified</span>';
  fields.push({ key: 'email', label: 'Email', value: data.email, editable: false, statusHtml: emailStatus });

  fields.push({ key: 'name', label: 'First Name', value: data.name, editable: true });
  fields.push({ key: 'lastName', label: 'Last Name', value: data.lastName, editable: true });
  fields.push({ key: 'preferredLanguage', label: 'Language', value: data.preferredLanguage, editable: true });
  fields.push({ key: 'phoneNumber', label: 'Phone Number', value: data.phoneNumber, editable: true });
  fields.push({ key: 'company', label: 'Company', value: data.company, editable: true });

  return fields;
}

function renderAcctField(f: FieldDef): string {
  const isEditing = acctEditingField === f.key;
  const currentValue = f.value || '—';

  if (isEditing) {
    return `
      <div class="acctmgmt-field acctmgmt-field-editing">
        <div class="acctmgmt-field-label">${esc(f.label)}</div>
        <div class="acctmgmt-field-edit-row">
          <input type="text" id="acctmgmt-edit-input" class="acctmgmt-input" value="${esc(f.value)}" placeholder="${esc(f.label)}" ${acctSaving ? 'disabled' : ''} />
          <button class="btn btn-accent btn-small" id="acctmgmt-save" ${acctSaving ? 'disabled' : ''}>${acctSaving ? 'Saving...' : 'Save'}</button>
          <button class="btn btn-secondary btn-small" id="acctmgmt-cancel" ${acctSaving ? 'disabled' : ''}>Cancel</button>
        </div>
        ${f.statusHtml ? `<div class="acctmgmt-field-status">${f.statusHtml}</div>` : ''}
      </div>`;
  }

  const editBtn = f.editable
    ? `<button class="btn btn-small btn-secondary acctmgmt-edit-btn" data-edit-field="${esc(f.key)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Edit</button>`
    : '';

  return `
    <div class="acctmgmt-field">
      <div class="acctmgmt-field-label">${esc(f.label)}</div>
      <div class="acctmgmt-field-value-row">
        <span class="acctmgmt-field-value">${esc(currentValue)}</span>
        ${editBtn}
      </div>
      ${f.statusHtml ? `<div class="acctmgmt-field-status">${f.statusHtml}</div>` : ''}
    </div>`;
}

function bindAccountEvents(): void {
  if (!el) return;

  el.querySelector('#acct-retry')?.addEventListener('click', () => loadAccount());

  el.querySelectorAll<HTMLElement>('[data-edit-field]').forEach((btn) => {
    btn.addEventListener('click', () => { acctEditingField = btn.dataset.editField!; draw(); });
  });

  if (acctEditingField) {
    const saveBtn = el.querySelector('#acctmgmt-save') as HTMLButtonElement | null;
    const cancelBtn = el.querySelector('#acctmgmt-cancel') as HTMLButtonElement | null;
    const input = el.querySelector('#acctmgmt-edit-input') as HTMLInputElement | null;

    saveBtn?.addEventListener('click', () => { if (input && acctEditingField) acctSaveField(acctEditingField, input.value.trim()); });
    cancelBtn?.addEventListener('click', () => { acctEditingField = null; draw(); });
    input?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && acctEditingField) acctSaveField(acctEditingField, input!.value.trim());
      if (e.key === 'Escape') { acctEditingField = null; draw(); }
    });
    input?.focus();
  }
}

// ══════════════════════════════════════════════════════════════
//  EULA TAB
// ══════════════════════════════════════════════════════════════

function drawEula(): string {
  return `
    <div class="eula-warning">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <div>
        <strong>Disclaimer</strong>
        <p>By using these actions you acknowledge that you are solely responsible for any consequences. GLOW Launcher is not liable for any changes made to your account.</p>
      </div>
    </div>
    <div class="eula-grid">
      ${renderEulaCard('eula', 'Accept EULA', 'Accept the Epic Games End-User License Agreement for your account.', `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`)}
      ${renderEulaCard('privacy', 'Accept Privacy Policy', 'Accept the Epic Games Privacy Policy for your account.', `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`)}
    </div>`;
}

function renderEulaCard(id: string, title: string, description: string, iconSvg: string): string {
  const state = eulaCards[id];
  const disabledAttr = (!state.accepted || state.loading) ? 'disabled' : '';
  return `
    <div class="eula-card">
      <div class="eula-card-header">
        <span class="eula-card-icon">${iconSvg}</span>
        <h3>${title}</h3>
      </div>
      <p class="eula-card-desc">${description}</p>
      <label class="eula-disclaimer">
        <input type="checkbox" class="eula-chk" data-eula-id="${id}" ${state.accepted ? 'checked' : ''} ${state.loading ? 'disabled' : ''} />
        <span>I accept full responsibility for this action on my account.</span>
      </label>
      ${state.loading ? '<div class="eula-spinner"></div>' : ''}
      ${state.result ? `<div class="eula-result success"><span>✓</span> ${esc(state.result)}</div>` : ''}
      ${state.error ? `<div class="eula-result error"><span>✕</span> ${esc(state.error)}</div>` : ''}
      <button class="btn btn-accent eula-action-btn" data-eula-btn="${id}" ${disabledAttr}>${title}</button>
    </div>`;
}

function bindEulaEvents(): void {
  if (!el) return;

  for (const id of ['eula', 'privacy']) {
    const chk = el.querySelector(`.eula-chk[data-eula-id="${id}"]`) as HTMLInputElement | null;
    const btn = el.querySelector(`[data-eula-btn="${id}"]`) as HTMLButtonElement | null;
    if (chk && btn) {
      chk.addEventListener('change', () => {
        eulaCards[id].accepted = chk.checked;
        btn.disabled = !chk.checked || eulaCards[id].loading;
      });
      btn.addEventListener('click', () => handleEulaAction(id));
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  ACCOUNT CHANGE LISTENER
// ══════════════════════════════════════════════════════════════

function onAccountChanged(): void {
  // Reset all tabs
  secInfo = null; secAuths = []; secBan = null; secError = null;
  acctInfo = null; acctError = null; acctEditingField = null;
  for (const k of Object.keys(eulaCards)) {
    eulaCards[k].loading = false; eulaCards[k].result = null; eulaCards[k].error = null; eulaCards[k].accepted = false;
  }

  // Reload current tab
  if (activeTab === 'security') loadSecurity();
  else if (activeTab === 'account') loadAccount();
  else draw();
}

// ══════════════════════════════════════════════════════════════
//  PAGE DEFINITION
// ══════════════════════════════════════════════════════════════

export const epicAccountPage: PageDefinition = {
  id: 'epicaccount',
  label: 'Epic Account',
  icon: `<img src="assets/icons/fnui/EG/security-button.png" alt="Epic Account" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 20,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    activeTab = 'security';

    // Reset all state
    secInfo = null; secAuths = []; secBan = null; secLoading = true; secError = null; secSectionLoading = {};
    acctLoading = false; acctError = null; acctInfo = null; acctEditingField = null; acctSaving = false;
    for (const k of Object.keys(eulaCards)) {
      eulaCards[k].loading = false; eulaCards[k].result = null; eulaCards[k].error = null; eulaCards[k].accepted = false;
    }

    window.addEventListener('glow:account-switched', onAccountChanged);
    window.glowAPI.accounts.onDataChanged(() => { if (el) onAccountChanged(); });

    await loadSecurity();
  },

  cleanup(): void {
    window.removeEventListener('glow:account-switched', onAccountChanged);
    el = null;
  },
};
