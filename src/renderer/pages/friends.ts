/**
 * Friends page — manage Epic Games friends: list, incoming/outgoing requests.
 * Add, remove, accept, reject, block, and search friends.
 */

import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── Types ─────────────────────────────────────────────────

interface FriendEntry {
  accountId: string;
  displayName: string;
  created?: string;
  favorite?: boolean;
}

interface FriendRequest {
  accountId: string;
  displayName: string;
  created?: string;
}

// ── State ─────────────────────────────────────────────────

type TabId = 'friends' | 'incoming' | 'outgoing';

let activeTab: TabId = 'friends';
let friendsList: FriendEntry[] = [];
let incomingList: FriendRequest[] = [];
let outgoingList: FriendRequest[] = [];
let searchQuery = '';
let loading = false;
let actionInProgress: string | null = null; // accountId of item being acted on
let statusMsg: { text: string; type: 'success' | 'error' } | null = null;
let statusTimer: ReturnType<typeof setTimeout> | null = null;

// ── Helpers ───────────────────────────────────────────────

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function setStatus(text: string, type: 'success' | 'error') {
  statusMsg = { text, type };
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusMsg = null;
    renderStatusBar();
  }, 5000);
  renderStatusBar();
}

function renderStatusBar() {
  if (!el) return;
  const bar = el.querySelector('#fr-status-bar');
  if (!bar) return;
  if (statusMsg) {
    bar.innerHTML = `<div class="fr-status fr-status-${statusMsg.type}">${esc(statusMsg.text)}</div>`;
  } else {
    bar.innerHTML = '';
  }
}

// ── Data loading ──────────────────────────────────────────

async function loadFriends(): Promise<void> {
  loading = true;
  draw();

  try {
    const result = await window.glowAPI.friends.getSummary();
    if (result.success) {
      friendsList = result.friends;
      incomingList = result.incoming;
      outgoingList = result.outgoing;
    } else {
      setStatus(result.error || 'Failed to load friends', 'error');
    }
  } catch (err: any) {
    setStatus(err?.message || 'Failed to load friends', 'error');
  } finally {
    loading = false;
    draw();
  }
}

// ── Actions ───────────────────────────────────────────────

async function doAction(
  action: () => Promise<{ success: boolean; message?: string; error?: string }>,
  targetId: string,
  successCb?: () => void,
): Promise<void> {
  if (actionInProgress) return;
  actionInProgress = targetId;
  updateItemState(targetId, true);

  try {
    const result = await action();
    if (result.success) {
      setStatus(result.message || 'Done', 'success');
      if (successCb) successCb();
    } else {
      setStatus(result.error || 'Action failed', 'error');
    }
  } catch (err: any) {
    setStatus(err?.message || 'Action failed', 'error');
  } finally {
    actionInProgress = null;
    updateItemState(targetId, false);
  }
}

function updateItemState(accountId: string, busy: boolean) {
  if (!el) return;
  const row = el.querySelector(`[data-id="${accountId}"]`);
  if (!row) return;
  const btns = row.querySelectorAll<HTMLButtonElement>('button');
  btns.forEach((b) => (b.disabled = busy));
  if (busy) {
    row.classList.add('fr-item-busy');
  } else {
    row.classList.remove('fr-item-busy');
  }
}

async function handleAddFriend(): Promise<void> {
  const input = el?.querySelector('#fr-add-input') as HTMLInputElement | null;
  if (!input || !input.value.trim()) return;

  const value = input.value.trim();
  actionInProgress = '__add__';
  const btn = el?.querySelector('#fr-add-btn') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    const result = await window.glowAPI.friends.add(value);
    if (result.success) {
      setStatus(result.message || `Request sent to ${value}`, 'success');
      input.value = '';
      // Refresh in background
      loadFriends();
    } else {
      setStatus(result.error || 'Failed to send request', 'error');
    }
  } catch (err: any) {
    setStatus(err?.message || 'Failed to send request', 'error');
  } finally {
    actionInProgress = null;
    if (btn) { btn.disabled = false; btn.textContent = 'Send Request'; }
  }
}

async function handleRemoveAll(): Promise<void> {
  if (!confirm('Are you sure you want to remove ALL friends? This cannot be undone.')) return;

  actionInProgress = '__removeAll__';
  draw();

  try {
    const result = await window.glowAPI.friends.removeAll();
    if (result.success) {
      setStatus(result.message || 'All friends removed', 'success');
      loadFriends();
    } else {
      setStatus(result.error || 'Failed to remove all', 'error');
    }
  } catch (err: any) {
    setStatus(err?.message || 'Failed', 'error');
  } finally {
    actionInProgress = null;
    draw();
  }
}

async function handleAcceptAll(): Promise<void> {
  actionInProgress = '__acceptAll__';
  draw();

  try {
    const result = await window.glowAPI.friends.acceptAll();
    if (result.success) {
      setStatus(result.message || 'All requests accepted', 'success');
      loadFriends();
    } else {
      setStatus(result.error || 'Failed to accept all', 'error');
    }
  } catch (err: any) {
    setStatus(err?.message || 'Failed', 'error');
  } finally {
    actionInProgress = null;
    draw();
  }
}

// ── Filtering ─────────────────────────────────────────────

function filterList<T extends { displayName: string; accountId: string }>(items: T[]): T[] {
  if (!searchQuery) return items;
  const q = searchQuery.toLowerCase();
  return items.filter((i) =>
    i.displayName.toLowerCase().includes(q) || i.accountId.toLowerCase().includes(q),
  );
}

// ── Draw ──────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  const counts = {
    friends: friendsList.length,
    incoming: incomingList.length,
    outgoing: outgoingList.length,
  };

  const TABS: { id: TabId; label: string; count: number; icon: string }[] = [
    {
      id: 'friends',
      label: 'Friends',
      count: counts.friends,
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    },
    {
      id: 'incoming',
      label: 'Received',
      count: counts.incoming,
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    },
    {
      id: 'outgoing',
      label: 'Sent',
      count: counts.outgoing,
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    },
  ];

  const tabsHtml = TABS.map(
    (t) => `
    <button class="fr-tab ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
      ${t.icon}
      <span>${t.label}</span>
      <span class="fr-tab-count">${t.count}</span>
    </button>`,
  ).join('');

  // List content
  let listHtml = '';
  if (loading) {
    listHtml = `<div class="fr-loading"><div class="shop-spinner"></div><p>Loading friends…</p></div>`;
  } else {
    listHtml = renderList();
  }

  // Bulk action buttons
  let bulkHtml = '';
  if (activeTab === 'friends' && friendsList.length > 0) {
    bulkHtml = `<button class="fr-bulk-btn fr-bulk-danger" id="fr-remove-all" ${actionInProgress ? 'disabled' : ''}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      Remove All</button>`;
  }
  if (activeTab === 'incoming' && incomingList.length > 0) {
    bulkHtml = `<button class="fr-bulk-btn fr-bulk-accept" id="fr-accept-all" ${actionInProgress ? 'disabled' : ''}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      Accept All</button>`;
  }

  el.innerHTML = `
    <div class="page-friends">
      <div class="fr-header">
        <h1 class="fr-title">Friends</h1>
        <span class="fr-subtitle">Manage your Epic Games friends</span>
        <button class="fr-refresh-btn" id="fr-refresh" title="Refresh" ${loading ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ${loading ? 'class="fr-spin"' : ''}>
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>

      <div class="fr-tabs">${tabsHtml}</div>

      <div class="fr-search-wrap">
        <svg class="fr-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" class="fr-search" id="fr-search"
               placeholder="Search by name or ID…"
               value="${esc(searchQuery)}" />
        ${searchQuery ? '<button class="fr-search-clear" id="fr-search-clear">✕</button>' : ''}
      </div>

      <div class="fr-list-header">
        <span class="fr-list-count">${getFilteredCount()} ${activeTab === 'friends' ? 'friend' : activeTab === 'incoming' ? 'request' : 'sent'}${getFilteredCount() !== 1 ? 's' : ''}</span>
        ${bulkHtml}
      </div>

      <div class="fr-list" id="fr-list">${listHtml}</div>

      <div class="fr-add-bar">
        <div id="fr-status-bar">${statusMsg ? `<div class="fr-status fr-status-${statusMsg.type}">${esc(statusMsg.text)}</div>` : ''}</div>
        <div class="fr-add-form">
          <input type="text" class="fr-add-input" id="fr-add-input" placeholder="Display Name or Account ID…" />
          <button class="btn btn-accent fr-add-btn" id="fr-add-btn">Send Request</button>
        </div>
      </div>
    </div>`;

  bindEvents();
}

function getFilteredCount(): number {
  if (activeTab === 'friends') return filterList(friendsList).length;
  if (activeTab === 'incoming') return filterList(incomingList).length;
  return filterList(outgoingList).length;
}

function renderList(): string {
  if (activeTab === 'friends') return renderFriendsList();
  if (activeTab === 'incoming') return renderIncomingList();
  return renderOutgoingList();
}

function renderFriendsList(): string {
  const filtered = filterList(friendsList);
  if (filtered.length === 0) {
    return `<div class="fr-empty">${searchQuery ? 'No friends match your search' : 'No friends yet'}</div>`;
  }
  return filtered
    .map(
      (f) => `
    <div class="fr-item" data-id="${esc(f.accountId)}">
      <div class="fr-item-avatar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <div class="fr-item-info">
        <span class="fr-item-name">${esc(f.displayName)}</span>
        <span class="fr-item-id">${esc(f.accountId)}</span>
      </div>
      <div class="fr-item-actions">
        <button class="fr-action-btn fr-action-remove" data-action="remove" data-id="${esc(f.accountId)}" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <button class="fr-action-btn fr-action-block" data-action="block" data-id="${esc(f.accountId)}" title="Block">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        </button>
      </div>
    </div>`,
    )
    .join('');
}

function renderIncomingList(): string {
  const filtered = filterList(incomingList);
  if (filtered.length === 0) {
    return `<div class="fr-empty">${searchQuery ? 'No requests match your search' : 'No incoming requests'}</div>`;
  }
  return filtered
    .map(
      (f) => `
    <div class="fr-item" data-id="${esc(f.accountId)}">
      <div class="fr-item-avatar fr-avatar-incoming">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
        </svg>
      </div>
      <div class="fr-item-info">
        <span class="fr-item-name">${esc(f.displayName)}</span>
        <span class="fr-item-id">${esc(f.accountId)}</span>
      </div>
      <div class="fr-item-actions">
        <button class="fr-action-btn fr-action-accept" data-action="accept" data-id="${esc(f.accountId)}" title="Accept">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <button class="fr-action-btn fr-action-reject" data-action="reject" data-id="${esc(f.accountId)}" title="Reject">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`,
    )
    .join('');
}

function renderOutgoingList(): string {
  const filtered = filterList(outgoingList);
  if (filtered.length === 0) {
    return `<div class="fr-empty">${searchQuery ? 'No requests match your search' : 'No outgoing requests'}</div>`;
  }
  return filtered
    .map(
      (f) => `
    <div class="fr-item" data-id="${esc(f.accountId)}">
      <div class="fr-item-avatar fr-avatar-outgoing">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </div>
      <div class="fr-item-info">
        <span class="fr-item-name">${esc(f.displayName)}</span>
        <span class="fr-item-id">${esc(f.accountId)}</span>
      </div>
      <div class="fr-item-actions">
        <button class="fr-action-btn fr-action-cancel" data-action="cancel" data-id="${esc(f.accountId)}" title="Cancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`,
    )
    .join('');
}

// ── Event binding ─────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // Tabs
  el.querySelectorAll<HTMLElement>('.fr-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab as TabId;
      if (id === activeTab) return;
      activeTab = id;
      searchQuery = '';
      draw();
    });
  });

  // Refresh
  el.querySelector('#fr-refresh')?.addEventListener('click', () => {
    loadFriends();
  });

  // Search
  const searchInput = el.querySelector('#fr-search') as HTMLInputElement | null;
  let debounce: ReturnType<typeof setTimeout>;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      searchQuery = searchInput.value;
      const listEl = el?.querySelector('#fr-list');
      if (listEl) listEl.innerHTML = loading ? listEl.innerHTML : renderList();
      // Update count
      const countEl = el?.querySelector('.fr-list-count');
      if (countEl) {
        const c = getFilteredCount();
        const label = activeTab === 'friends' ? 'friend' : activeTab === 'incoming' ? 'request' : 'sent';
        countEl.textContent = `${c} ${label}${c !== 1 ? 's' : ''}`;
      }
      bindListActions();
    }, 150);
  });

  el.querySelector('#fr-search-clear')?.addEventListener('click', () => {
    searchQuery = '';
    if (searchInput) searchInput.value = '';
    const listEl = el?.querySelector('#fr-list');
    if (listEl) listEl.innerHTML = renderList();
    const countEl = el?.querySelector('.fr-list-count');
    if (countEl) {
      const c = getFilteredCount();
      const label = activeTab === 'friends' ? 'friend' : activeTab === 'incoming' ? 'request' : 'sent';
      countEl.textContent = `${c} ${label}${c !== 1 ? 's' : ''}`;
    }
    bindListActions();
  });

  // Add friend
  el.querySelector('#fr-add-btn')?.addEventListener('click', handleAddFriend);
  const addInput = el.querySelector('#fr-add-input') as HTMLInputElement | null;
  addInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddFriend();
  });

  // Bulk actions
  el.querySelector('#fr-remove-all')?.addEventListener('click', handleRemoveAll);
  el.querySelector('#fr-accept-all')?.addEventListener('click', handleAcceptAll);

  // Individual actions
  bindListActions();

  // Account switch listener
  window.addEventListener('glow:account-switched', onAccountSwitch);
}

function bindListActions(): void {
  if (!el) return;
  el.querySelectorAll<HTMLElement>('.fr-action-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!action || !id) return;

      switch (action) {
        case 'accept':
          await doAction(() => window.glowAPI.friends.accept(id), id, () => {
            incomingList = incomingList.filter((f) => f.accountId !== id);
            draw();
          });
          break;
        case 'reject':
          await doAction(() => window.glowAPI.friends.reject(id), id, () => {
            incomingList = incomingList.filter((f) => f.accountId !== id);
            draw();
          });
          break;
        case 'remove':
          await doAction(() => window.glowAPI.friends.remove(id), id, () => {
            friendsList = friendsList.filter((f) => f.accountId !== id);
            draw();
          });
          break;
        case 'cancel':
          await doAction(() => window.glowAPI.friends.cancel(id), id, () => {
            outgoingList = outgoingList.filter((f) => f.accountId !== id);
            draw();
          });
          break;
        case 'block':
          if (!confirm('Are you sure you want to block this user?')) return;
          await doAction(() => window.glowAPI.friends.block(id), id, () => {
            friendsList = friendsList.filter((f) => f.accountId !== id);
            draw();
          });
          break;
      }
    });
  });
}

function onAccountSwitch() {
  // Reload friends when the active account changes
  friendsList = [];
  incomingList = [];
  outgoingList = [];
  statusMsg = null;
  loadFriends();
}

// ── Page Definition ──────────────────────────────────────

export const friendsPage: PageDefinition = {
  id: 'friends',
  label: 'Friends',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>`,
  order: 16,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    activeTab = 'friends';
    searchQuery = '';
    friendsList = [];
    incomingList = [];
    outgoingList = [];
    loading = false;
    actionInProgress = null;
    statusMsg = null;
    draw();
    loadFriends();
  },

  cleanup(): void {
    window.removeEventListener('glow:account-switched', onAccountSwitch);
    if (statusTimer) clearTimeout(statusTimer);
    el = null;
  },
};
