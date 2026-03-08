import type { PageDefinition } from '../../shared/types';

// ── State ─────────────────────────────────────────────────

let el: HTMLElement | null = null;
let loading = true;
let error: string | null = null;
let info: AccountInfoData | null = null;
let editingField: string | null = null;
let saving = false;

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

// ── Helpers ───────────────────────────────────────────────

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function timeUntil(iso: string): string {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return 'now';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

// ── Data ──────────────────────────────────────────────────

async function loadInfo(): Promise<void> {
  loading = true;
  error = null;
  draw();

  try {
    const res = await window.glowAPI.accountMgmt.getInfo();
    if (res.success && res.info) {
      info = res.info;
    } else {
      error = res.error || 'Failed to load account info';
    }
  } catch (err: any) {
    error = err?.message || 'Failed to load account info';
  }

  loading = false;
  draw();
}

async function saveField(field: string, value: string): Promise<void> {
  if (saving) return;
  saving = true;
  draw();

  try {
    const res = await window.glowAPI.accountMgmt.updateField(field, value);
    if (res.success && res.info) {
      info = res.info;
      editingField = null;
      showToast('Updated successfully', 'success');
    } else {
      showToast(res.error || 'Update failed', 'error');
    }
  } catch (err: any) {
    showToast(err?.message || 'Update failed', 'error');
  }

  saving = false;
  draw();
}

function showToast(message: string, type: 'success' | 'error'): void {
  if (!el) return;
  const existing = el.querySelector('.acctmgmt-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `acctmgmt-toast acctmgmt-toast-${type}`;
  toast.textContent = message;
  el.querySelector('.page-acctmgmt')?.appendChild(toast);

  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Drawing ──────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading) {
    el.innerHTML = `
      <div class="page-acctmgmt">
        <div class="acctmgmt-header">
          <h1 class="acctmgmt-title">Account Management</h1>
        </div>
        <div class="acctmgmt-loading">
          <div class="acctmgmt-spinner"></div>
          <p>Loading account info...</p>
        </div>
      </div>`;
    return;
  }

  if (error) {
    el.innerHTML = `
      <div class="page-acctmgmt">
        <div class="acctmgmt-header">
          <h1 class="acctmgmt-title">Account Management</h1>
          <button class="btn btn-accent acctmgmt-refresh-btn" id="acctmgmt-refresh">↻ Retry</button>
        </div>
        <div class="acctmgmt-error">
          <p>⚠ ${esc(error)}</p>
        </div>
      </div>`;
    el.querySelector('#acctmgmt-refresh')?.addEventListener('click', () => loadInfo());
    return;
  }

  if (!info) return;

  const fields = buildFields(info);

  el.innerHTML = `
    <div class="page-acctmgmt">
      <div class="acctmgmt-header">
        <h1 class="acctmgmt-title">Account Management</h1>
        <button class="btn btn-accent acctmgmt-refresh-btn" id="acctmgmt-refresh">↻ Refresh</button>
      </div>
      <div class="acctmgmt-grid">
        ${fields.map((f) => renderField(f)).join('')}
      </div>
    </div>`;

  // Bind refresh
  el.querySelector('#acctmgmt-refresh')?.addEventListener('click', () => loadInfo());

  // Bind edit buttons
  el.querySelectorAll<HTMLElement>('[data-edit-field]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingField = btn.dataset.editField!;
      draw();
    });
  });

  // Bind save/cancel for editing field
  if (editingField) {
    const saveBtn = el.querySelector('#acctmgmt-save') as HTMLButtonElement | null;
    const cancelBtn = el.querySelector('#acctmgmt-cancel') as HTMLButtonElement | null;
    const input = el.querySelector('#acctmgmt-edit-input') as HTMLInputElement | null;

    saveBtn?.addEventListener('click', () => {
      if (input && editingField) {
        saveField(editingField, input.value.trim());
      }
    });

    cancelBtn?.addEventListener('click', () => {
      editingField = null;
      draw();
    });

    // Enter key to save
    input?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && editingField) {
        saveField(editingField, input.value.trim());
      }
      if (e.key === 'Escape') {
        editingField = null;
        draw();
      }
    });

    // Focus the input
    input?.focus();
  }
}

// ── Field definitions ─────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  value: string;
  editable: boolean;
  statusHtml?: string;
}

function buildFields(data: AccountInfoData): FieldDef[] {
  const fields: FieldDef[] = [];

  // Display Name
  let dnStatus = '';
  if (data.canUpdateDisplayName) {
    dnStatus = '<span class="acctmgmt-status acctmgmt-status-ok">✓ Change available</span>';
  } else if (data.displayNameAvailableAt) {
    const dt = formatDate(data.displayNameAvailableAt);
    const remaining = timeUntil(data.displayNameAvailableAt);
    dnStatus = `<span class="acctmgmt-status acctmgmt-status-cooldown">✕ Cooldown — available in ${esc(remaining)} (${esc(dt)})</span>`;
  } else {
    dnStatus = '<span class="acctmgmt-status acctmgmt-status-cooldown">✕ Change not available</span>';
  }
  fields.push({
    key: 'displayName',
    label: 'Display Name',
    value: data.displayName,
    editable: data.canUpdateDisplayName,
    statusHtml: dnStatus,
  });

  // Email (read-only)
  let emailStatus = '';
  if (data.emailVerified) {
    emailStatus = '<span class="acctmgmt-status acctmgmt-status-ok">✓ Email verified</span>';
  } else {
    emailStatus = '<span class="acctmgmt-status acctmgmt-status-cooldown">✕ Email not verified</span>';
  }
  fields.push({
    key: 'email',
    label: 'Email',
    value: data.email,
    editable: false,
    statusHtml: emailStatus,
  });

  // Name
  fields.push({
    key: 'name',
    label: 'First Name',
    value: data.name,
    editable: true,
  });

  // Last Name
  fields.push({
    key: 'lastName',
    label: 'Last Name',
    value: data.lastName,
    editable: true,
  });

  // Language
  fields.push({
    key: 'preferredLanguage',
    label: 'Language',
    value: data.preferredLanguage,
    editable: true,
  });

  // Phone
  fields.push({
    key: 'phoneNumber',
    label: 'Phone Number',
    value: data.phoneNumber,
    editable: true,
  });

  // Company
  fields.push({
    key: 'company',
    label: 'Company',
    value: data.company,
    editable: true,
  });

  return fields;
}

function renderField(f: FieldDef): string {
  const isEditing = editingField === f.key;
  const currentValue = f.value || '—';

  if (isEditing) {
    return `
      <div class="acctmgmt-field acctmgmt-field-editing">
        <div class="acctmgmt-field-label">${esc(f.label)}</div>
        <div class="acctmgmt-field-edit-row">
          <input type="text" id="acctmgmt-edit-input" class="acctmgmt-input"
                 value="${esc(f.value)}" placeholder="${esc(f.label)}" ${saving ? 'disabled' : ''} />
          <button class="btn btn-accent btn-small" id="acctmgmt-save" ${saving ? 'disabled' : ''}>
            ${saving ? 'Saving...' : 'Save'}
          </button>
          <button class="btn btn-secondary btn-small" id="acctmgmt-cancel" ${saving ? 'disabled' : ''}>Cancel</button>
        </div>
        ${f.statusHtml ? `<div class="acctmgmt-field-status">${f.statusHtml}</div>` : ''}
      </div>`;
  }

  const editBtn = f.editable
    ? `<button class="btn btn-small btn-secondary acctmgmt-edit-btn" data-edit-field="${esc(f.key)}">
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
         Edit
       </button>`
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

// ── Account changed listener ────────────────────────────────

function onAccountChanged(): void {
  console.log('[AccountMgmt] Account changed — refreshing...');
  info = null;
  editingField = null;
  loadInfo();
}

// ── Page Definition ──────────────────────────────────────

export const accountMgmtPage: PageDefinition = {
  id: 'accountmgmt',
  label: 'Account Management',
  icon: `<img src="assets/icons/fnui/EG/account.png" alt="Account Management" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 22,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    loading = true;
    error = null;
    info = null;
    editingField = null;
    saving = false;

    window.addEventListener('glow:account-switched', onAccountChanged);

    await loadInfo();
  },

  cleanup(): void {
    window.removeEventListener('glow:account-switched', onAccountChanged);
    el = null;
  },
};
