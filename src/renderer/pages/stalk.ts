import type { PageDefinition, StalkMatchmakingResult } from '../../shared/types';

let el: HTMLElement | null = null;
let searchQuery = '';
let searching = false;
let searchResults: { accountId: string; displayName: string; platform?: string }[] = [];
let searchError: string | null = null;

let stalking = false;
let stalkResult: StalkMatchmakingResult | null = null;
let stalkError: string | null = null;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

// ─── Draw ─────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  // First render: build the full skeleton once
  if (!initialized) {
    el.innerHTML = `
      <div class="stalk-page">
        <div class="stalk-header">
          <h1 class="page-title">Stalk</h1>
          <p class="page-subtitle">Look up a player's matchmaking session in real time (only STW)</p>
        </div>
        <div class="stalk-search-wrapper">
          <div class="stalk-search-bar">
            <svg class="stalk-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              id="stalk-input"
              class="stalk-search-input"
              placeholder="Search player by display name..."
              value="${escapeAttr(searchQuery)}"
              autocomplete="off"
              spellcheck="false"
            />
            <div id="stalk-spinner-slot"></div>
          </div>
          <div id="stalk-dropdown-slot"></div>
        </div>
        <div id="stalk-messages-slot"></div>
        <div id="stalk-content-slot"></div>
      </div>
    `;
    const input = el.querySelector('#stalk-input') as HTMLInputElement;
    input?.addEventListener('input', onSearchInput);
    input?.addEventListener('keydown', onSearchKeydown);
    document.addEventListener('click', handleOutsideClick);
    setTimeout(() => input?.focus(), 0);
    initialized = true;
  }

  // Update only dynamic zones (never touch the input)
  const spinnerSlot = el.querySelector('#stalk-spinner-slot');
  if (spinnerSlot) {
    spinnerSlot.innerHTML = searching ? '<div class="stalk-search-spinner"></div>' : '';
  }

  const dropdownSlot = el.querySelector('#stalk-dropdown-slot');
  if (dropdownSlot) {
    dropdownSlot.innerHTML = searchResults.length > 0 && searchQuery.length >= 2 && !stalking ? `
      <div class="stalk-dropdown" id="stalk-dropdown">
        ${searchResults.map((r) => `
          <div class="stalk-dropdown-item" data-id="${r.accountId}" data-name="${escapeAttr(r.displayName)}">
            <span class="stalk-dropdown-name">${escapeHtml(r.displayName)}</span>
            ${r.platform ? `<span class="stalk-dropdown-platform">${escapeHtml(r.platform)}</span>` : ''}
          </div>
        `).join('')}
      </div>
    ` : '';

    // Bind dropdown click events
    dropdownSlot.querySelectorAll('.stalk-dropdown-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = (item as HTMLElement).dataset.id || '';
        const name = (item as HTMLElement).dataset.name || '';
        selectPlayer(id, name);
      });
    });
  }

  const messagesSlot = el.querySelector('#stalk-messages-slot');
  if (messagesSlot) {
    let msgs = '';
    if (searchError && !stalking) {
      msgs += `<div class="stalk-msg stalk-msg--error">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        ${escapeHtml(searchError)}
      </div>`;
    }
    if (stalkError) {
      msgs += `<div class="stalk-msg stalk-msg--error">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        ${escapeHtml(stalkError)}
      </div>`;
    }
    messagesSlot.innerHTML = msgs;
  }

  const contentSlot = el.querySelector('#stalk-content-slot');
  if (contentSlot) {
    if (stalking) {
      contentSlot.innerHTML = `<div class="stalk-loading"><div class="stalk-loading-spinner"></div><span>Looking up player...</span></div>`;
    } else if (stalkResult) {
      contentSlot.innerHTML = renderResult(stalkResult);
    } else {
      contentSlot.innerHTML = '';
    }
  }
}

// ─── Result Renderer ──────────────────────────────────────

function renderResult(r: StalkMatchmakingResult): string {
  if (!r.success) {
    return `<div class="stalk-msg stalk-msg--error">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      ${escapeHtml(r.error || 'Unknown error')}
    </div>`;
  }

  const statusLabel = !r.online
    ? 'Not in game'
    : r.isHomebase
      ? 'Playing Save the World'
      : 'Online';

  const badgeClass = !r.online
    ? 'stalk-badge--offline'
    : r.isHomebase
      ? 'stalk-badge--online'
      : 'stalk-badge--type';

  return `
    <div class="stalk-result ${r.online ? 'stalk-result--online' : 'stalk-result--offline'}">
      <div class="stalk-result-status">
        <span class="stalk-badge ${badgeClass}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
          ${escapeHtml(statusLabel)}
        </span>
      </div>
      <div class="stalk-result-card">
        <div class="stalk-info-row">
          <span class="stalk-info-label">Player</span>
          <span class="stalk-info-value">${escapeHtml(r.displayName || '')}</span>
        </div>
        <div class="stalk-info-row">
          <span class="stalk-info-label">Account ID</span>
          <span class="stalk-info-value stalk-mono">${r.accountId || ''}</span>
        </div>
      </div>
    </div>
  `;
}

// ─── Events ───────────────────────────────────────────────

function onSearchInput(): void {
  const input = el?.querySelector('#stalk-input') as HTMLInputElement;
  if (!input) return;
  searchQuery = input.value;

  if (searchQuery.length < 2) {
    searchResults = [];
    searchError = null;
    draw();
    return;
  }

  // Debounce
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => doSearch(), 350);
}

function onSearchKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
    e.preventDefault();
    // Direct stalk by name
    if (debounceTimer) clearTimeout(debounceTimer);
    searchResults = [];
    searchError = null;
    doStalk(searchQuery.trim());
  }
  if (e.key === 'Escape') {
    searchResults = [];
    draw();
  }
}

function handleOutsideClick(e: MouseEvent): void {
  if (!el) return;
  const dropdown = el.querySelector('#stalk-dropdown');
  const input = el.querySelector('#stalk-input');
  if (dropdown && !dropdown.contains(e.target as Node) && e.target !== input) {
    searchResults = [];
    draw();
  }
}

async function doSearch(): Promise<void> {
  if (searchQuery.length < 2) return;
  searching = true;
  searchError = null;
  draw();

  try {
    const res = await window.glowAPI.stalk.search(searchQuery);
    if (res.success) {
      searchResults = res.results;
      if (res.results.length === 0) {
        searchError = `No results for "${searchQuery}"`;
      }
    } else {
      searchError = res.error || 'Search failed';
      searchResults = [];
    }
  } catch (err: any) {
    searchError = err.message || 'Unexpected error';
    searchResults = [];
  } finally {
    searching = false;
    draw();
  }
}

function selectPlayer(accountId: string, displayName: string): void {
  searchQuery = displayName;
  searchResults = [];
  searchError = null;
  // Update input value since we no longer rebuild it
  const input = el?.querySelector('#stalk-input') as HTMLInputElement;
  if (input) input.value = displayName;
  doStalk(accountId);
}

async function doStalk(target: string): Promise<void> {
  stalking = true;
  stalkResult = null;
  stalkError = null;
  draw();

  try {
    const res = await window.glowAPI.stalk.matchmaking(target);
    if (res.success) {
      stalkResult = res;
    } else {
      stalkError = res.error || 'Failed to get matchmaking info';
    }
  } catch (err: any) {
    stalkError = err.message || 'Unexpected error';
  } finally {
    stalking = false;
    draw();
  }
}

// ─── Helpers ──────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Page Definition ──────────────────────────────────────

export const stalkPage: PageDefinition = {
  id: 'stalk',
  label: 'Stalk',
  icon: `<img src="assets/icons/fnui/BR-STW/stalk.png" alt="Stalk" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 19,
  render(container) {
    el = container;
    draw();
  },
  cleanup() {
    document.removeEventListener('click', handleOutsideClick);
    if (debounceTimer) clearTimeout(debounceTimer);
    initialized = false;
    el = null;
  },
};
