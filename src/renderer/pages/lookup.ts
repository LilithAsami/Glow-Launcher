/**
 * Lookup Page — batch account lookup by account IDs.
 *
 * Tag-input style: type text, press Space/Enter to add a tag.
 * Each tag is a 32-hex account ID (or autocompleted from search).
 * Lookup button queries the Account Service batch endpoint.
 * Results show displayName, externalAuths, with view/download JSON.
 */

import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;
let initialized = false;

// ── State ─────────────────────────────────────────────────────
let tags: string[] = [];
let loading = false;
let error: string | null = null;

interface LookupAccountResult {
  id: string;
  displayName: string;
  externalAuths: Record<string, unknown>;
  raw: Record<string, unknown>;
}
let results: LookupAccountResult[] = [];
let jsonViewId: string | null = null; // which account's JSON is expanded

// autocomplete
let acResults: { accountId: string; displayName: string; platform?: string }[] = [];
let acTimer: ReturnType<typeof setTimeout> | null = null;
let acSearching = false;

// ── Helpers ───────────────────────────────────────────────────

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isAccountId(s: string): boolean {
  return /^[a-f0-9]{32}$/i.test(s);
}

function getInput(): HTMLInputElement | null {
  return el?.querySelector<HTMLInputElement>('#lookup-input') ?? null;
}

// ── Slot updaters (never touch the <input>) ───────────────────

function updateTags(): void {
  const slot = el?.querySelector('#lookup-tags-slot');
  if (!slot) return;
  slot.innerHTML = tags.map((t, i) => `
    <span class="lookup-tag">
      <span class="lookup-tag-text">${esc(t)}</span>
      <span class="lookup-tag-x" data-tag-idx="${i}">&times;</span>
    </span>
  `).join('');
  slot.querySelectorAll<HTMLElement>('[data-tag-idx]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      tags.splice(parseInt(btn.dataset.tagIdx!, 10), 1);
      updateTags();
      updateButton();
      updateInputPlaceholder();
    });
  });
}

function updateDropdown(): void {
  const slot = el?.querySelector('#lookup-ac-slot');
  if (!slot) return;

  // Spinner while searching
  if (acSearching) {
    slot.innerHTML = '<div class="lookup-ac-searching"><div class="stalk-search-spinner"></div></div>';
    return;
  }

  if (acResults.length === 0) { slot.innerHTML = ''; return; }

  slot.innerHTML = `
    <div class="lookup-ac-dropdown" id="lookup-ac-dropdown">
      ${acResults.map((r) => `
        <div class="lookup-ac-item" data-ac-id="${r.accountId}" data-ac-name="${esc(r.displayName)}">
          <span class="lookup-ac-name">${esc(r.displayName)}</span>
          ${r.platform ? `<span class="lookup-ac-plat">${esc(r.platform)}</span>` : ''}
          <span class="lookup-ac-id">${r.accountId}</span>
        </div>
      `).join('')}
    </div>
  `;
  slot.querySelectorAll<HTMLElement>('.lookup-ac-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.dataset.acId || '';
      const name = item.dataset.acName || '';
      if (id && !tags.includes(id)) tags.push(id);
      acResults = [];
      acSearching = false;
      updateDropdown();
      updateTags();
      updateButton();
      updateInputPlaceholder();
      const inp = getInput();
      if (inp) { inp.value = ''; inp.focus(); }
    });
  });
}

function updateButton(): void {
  const btn = el?.querySelector<HTMLButtonElement>('#lookup-go');
  if (!btn) return;
  btn.disabled = tags.length === 0 || loading;
  btn.innerHTML = loading
    ? '<span class="lookup-spinner"></span> Looking up...'
    : 'Lookup';
}

function updateInputPlaceholder(): void {
  const inp = getInput();
  if (inp) inp.placeholder = tags.length === 0 ? 'Type account ID or search name...' : '';
}

function updateError(): void {
  const slot = el?.querySelector('#lookup-error-slot');
  if (!slot) return;
  slot.innerHTML = error ? `<div class="lookup-error">${esc(error)}</div>` : '';
}

function updateResults(): void {
  const slot = el?.querySelector('#lookup-results-slot');
  if (!slot) return;
  if (loading) {
    slot.innerHTML = `<div class="lookup-loading"><span class="lookup-spinner"></span> Looking up accounts...</div>`;
    return;
  }
  if (results.length === 0) { slot.innerHTML = ''; return; }
  slot.innerHTML = `
    <div class="lookup-results">
      <div class="lookup-results-bar">
        <span>${results.length} account${results.length > 1 ? 's' : ''} found</span>
        <button class="lookup-dl-all-btn" id="lookup-dl-all">Download All JSON</button>
      </div>
      ${results.map((a) => renderAccount(a)).join('')}
    </div>
  `;
}

// ── Draw (skeleton built once) ────────────────────────────────

function draw(): void {
  if (!el) return;

  if (!initialized) {
    el.innerHTML = `
      <div class="lookup-page">
        <div class="lookup-header">
          <h1 class="page-title">Lookup</h1>
          <p class="page-subtitle">Batch account lookup by Account IDs — separate with Space or Enter</p>
        </div>
        <div class="lookup-input-area">
          <div class="lookup-tag-box" id="lookup-tag-box">
            <span id="lookup-tags-slot"></span>
            <input
              type="text"
              id="lookup-input"
              class="lookup-tag-input"
              placeholder="Type account ID or search name..."
              autocomplete="off"
              spellcheck="false"
            />
          </div>
          <div id="lookup-ac-slot"></div>
          <button class="lookup-btn" id="lookup-go" disabled>Lookup</button>
        </div>
        <div id="lookup-error-slot"></div>
        <div id="lookup-results-slot"></div>
      </div>
    `;

    const input = getInput()!;
    const tagBox = el.querySelector('#lookup-tag-box')!;

    tagBox.addEventListener('click', () => input.focus());
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
    el.querySelector('#lookup-go')!.addEventListener('click', () => doLookup());

    // Delegated handler for results slot (registered once — survives innerHTML updates)
    el.querySelector('#lookup-results-slot')!.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;

      // Copy button
      const copyBtn = t.closest<HTMLElement>('[data-copy]');
      if (copyBtn) {
        navigator.clipboard.writeText(copyBtn.dataset.copy ?? '').catch(() => {});
        copyBtn.classList.add('lookup-copy-btn--ok');
        setTimeout(() => copyBtn.classList.remove('lookup-copy-btn--ok'), 1200);
        return;
      }

      // View JSON toggle
      const viewBtn = t.closest<HTMLElement>('[data-view-json]');
      if (viewBtn) {
        jsonViewId = jsonViewId === viewBtn.dataset.viewJson ? null : (viewBtn.dataset.viewJson ?? null);
        updateResults();
        return;
      }

      // Download per-account JSON
      const dlBtn = t.closest<HTMLElement>('[data-dl-json]');
      if (dlBtn) {
        const acct = results.find((a) => a.id === dlBtn.dataset.dlJson);
        if (acct) downloadJson(acct.raw, `lookup_${acct.id}.json`);
        return;
      }

      // Download all JSON
      if (t.id === 'lookup-dl-all') {
        downloadJson(results.map((a) => a.raw), 'lookup_all.json');
      }
    });

    document.addEventListener('click', onOutsideClick);

    initialized = true;
    setTimeout(() => input.focus(), 0);
  }

  updateTags();
  updateDropdown();
  updateButton();
  updateInputPlaceholder();
  updateError();
  updateResults();
}

function renderAccount(a: LookupAccountResult): string {
  const auths = Object.entries(a.externalAuths);
  const expanded = jsonViewId === a.id;
  const clipSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;

  return `
    <div class="lookup-card">
      <div class="lookup-card-head">
        <div class="lookup-card-info">
          <div class="lookup-copy-row">
            <span class="lookup-card-name">${esc(a.displayName)}</span>
            <button class="lookup-copy-btn" data-copy="${escAttr(a.displayName)}" title="Copy display name">${clipSvg}</button>
          </div>
          <div class="lookup-copy-row">
            <span class="lookup-card-id">${a.id}</span>
            <button class="lookup-copy-btn" data-copy="${a.id}" title="Copy account ID">${clipSvg}</button>
          </div>
        </div>
        <div class="lookup-card-actions">
          <button class="lookup-small-btn" data-view-json="${a.id}">${expanded ? 'Hide JSON' : 'View JSON'}</button>
          <button class="lookup-small-btn" data-dl-json="${a.id}">Download JSON</button>
        </div>
      </div>
      ${auths.length > 0 ? `
        <div class="lookup-auths">
          ${auths.map(([platform, info]) => {
            const p = info as any;
            const copyVal = [p.externalDisplayName, p.externalAuthId].filter(Boolean).join('\n');
            return `
              <div class="lookup-auth-row">
                <span class="lookup-auth-plat">${esc(platform)}</span>
                ${p.externalDisplayName ? `<span class="lookup-auth-name">${esc(p.externalDisplayName)}</span>` : ''}
                ${p.externalAuthId ? `<span class="lookup-auth-id">${esc(p.externalAuthId)}</span>` : ''}
                ${copyVal ? `<button class="lookup-copy-btn lookup-copy-btn--auth" data-copy="${escAttr(copyVal)}" title="Copy">${clipSvg}</button>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      ` : '<div class="lookup-no-auths">No external auths</div>'}
      ${expanded ? `
        <pre class="lookup-json-view">${esc(JSON.stringify(a.raw, null, 2))}</pre>
      ` : ''}
    </div>
  `;
}

// ── Events ────────────────────────────────────────────────────

function onInput(): void {
  const input = getInput();
  if (!input) return;
  const val = input.value;

  // Space → commit tag(s) — accept any non-empty text (display name or account ID)
  if (val.includes(' ')) {
    const parts = val.split(/\s+/).filter(Boolean);
    for (const p of parts) {
      if (p && !tags.includes(p)) tags.push(p);
    }
    input.value = '';
    acResults = [];
    updateDropdown();
    updateTags();
    updateButton();
    updateInputPlaceholder();
    return;
  }

  // Autocomplete for any non-hex text (display name search)
  if (val.length >= 2 && !/^[a-f0-9]+$/i.test(val)) {
    if (acTimer) clearTimeout(acTimer);
    acTimer = setTimeout(() => doAutocomplete(val), 350);
  } else if (val.length < 2) {
    acResults = [];
    acSearching = false;
    updateDropdown();
  }
}

function onKeydown(e: KeyboardEvent): void {
  const input = getInput();
  if (!input) return;
  const val = input.value.trim();

  if (e.key === 'Enter') {
    e.preventDefault();
    if (val && !tags.includes(val)) {
      // Add whatever is typed (display name or account ID)
      tags.push(val);
      input.value = '';
      acResults = [];
      updateDropdown();
      updateTags();
      updateButton();
      updateInputPlaceholder();
    } else if (!val && tags.length > 0 && !loading) {
      doLookup();
    }
    return;
  }

  if (e.key === 'Backspace' && input.value === '' && tags.length > 0) {
    tags.pop();
    updateTags();
    updateButton();
    updateInputPlaceholder();
    return;
  }

  if (e.key === 'Escape') {
    acResults = [];
    acSearching = false;
    updateDropdown();
  }
}

function onOutsideClick(e: MouseEvent): void {
  if (!el) return;
  const acSlot = el.querySelector('#lookup-ac-slot');
  const input = getInput();
  if (acSlot && !acSlot.contains(e.target as Node) && e.target !== input) {
    acResults = [];
    acSearching = false;
    updateDropdown();
  }
}

// ── Actions ───────────────────────────────────────────────────

async function doAutocomplete(term: string): Promise<void> {
  if (term.length < 2) return;
  acSearching = true;
  acResults = [];
  updateDropdown();

  try {
    const res = await window.glowAPI.lookup.search(term);
    if (res.success && res.results && res.results.length > 0) {
      acResults = res.results.slice(0, 10);
    } else {
      acResults = [];
    }
  } catch {
    acResults = [];
  }

  acSearching = false;
  updateDropdown();
}

async function doLookup(): Promise<void> {
  if (loading || tags.length === 0) return;
  loading = true;
  error = null;
  results = [];
  jsonViewId = null;
  updateButton();
  updateError();
  updateResults();

  try {
    // Resolve display name tags to account IDs; hex-ID tags pass through directly
    const resolvedIds: string[] = [];
    for (const tag of tags) {
      if (isAccountId(tag)) {
        if (!resolvedIds.includes(tag)) resolvedIds.push(tag);
      } else {
        const sr = await window.glowAPI.lookup.search(tag);
        if (sr.success && sr.results && sr.results.length > 0) {
          const id = sr.results[0].accountId;
          if (!resolvedIds.includes(id)) resolvedIds.push(id);
        }
      }
    }

    if (resolvedIds.length === 0) {
      error = 'Could not resolve any account IDs from the given names.';
    } else {
      const res = await window.glowAPI.lookup.batch(resolvedIds);
      if (res.success && res.accounts) {
        results = res.accounts;
        if (results.length === 0) error = 'No accounts found for the given IDs.';
      } else {
        error = res.error || 'Lookup failed';
      }
    }
  } catch (err: any) {
    error = err.message || 'Unexpected error';
  }

  loading = false;
  updateButton();
  updateError();
  updateResults();
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page Definition ───────────────────────────────────────────

export const lookupPage: PageDefinition = {
  id: 'lookup',
  label: 'Lookup',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  order: 19,
  render(container) {
    el = container;
    initialized = false;
    tags = [];
    loading = false;
    error = null;
    results = [];
    jsonViewId = null;
    acResults = [];
    acSearching = false;
    draw();
  },
  cleanup() {
    document.removeEventListener('click', onOutsideClick);
    if (acTimer) { clearTimeout(acTimer); acTimer = null; }
    initialized = false;
    el = null;
  },
};
