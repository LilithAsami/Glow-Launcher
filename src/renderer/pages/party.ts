import type { PageDefinition, PartyMemberInfo, PartyInfoResult, PartyActionResult } from '../../shared/types';

let el: HTMLElement | null = null;

// ─── State ────────────────────────────────────────────────

let partyMembers: PartyMemberInfo[] = [];
let partyId: string | null = null;
let partySize = 0;
let partyPrivate = false;
let loadingParty = false;
let partyError: string | null = null;

// Card action states
interface CardState {
  loading: boolean;
  result: string | null;
  error: string | null;
}

const cardStates: Record<string, CardState> = {};

// Invite / Join search
let inviteQuery = '';
let inviteResults: { accountId: string; displayName: string; platform?: string }[] = [];
let inviteSearching = false;
let inviteDebounce: ReturnType<typeof setTimeout> | null = null;

let joinQuery = '';
let joinResults: { accountId: string; displayName: string; platform?: string }[] = [];
let joinSearching = false;
let joinDebounce: ReturnType<typeof setTimeout> | null = null;

function getCard(id: string): CardState {
  if (!cardStates[id]) cardStates[id] = { loading: false, result: null, error: null };
  return cardStates[id];
}

// ─── Draw ─────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="party-page">
      <div class="party-header">
        <h1 class="page-title">Party</h1>
        <p class="page-subtitle">Manage your Fortnite party — invite, kick, collect rewards and more</p>
      </div>

      <!-- Party Info Banner -->
      <div class="party-info-banner">
        <div class="party-info-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span class="party-info-text">
            ${loadingParty ? 'Loading party...' : partyError ? escapeHtml(partyError) : `Party — ${partySize} member(s) — ${partyPrivate ? 'Private' : 'Public'}`}
          </span>
        </div>
        <button class="party-refresh-btn" id="party-refresh-btn" ${loadingParty ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </div>

      <!-- Cards Grid -->
      <div class="party-cards-grid">

        <!-- Fix Party Invite -->
        ${renderActionCard('fix-invite', 'Fix Party Invite', 'Toggles party privacy to fix cloud gaming invite bugs. Auto-reverts after 5 seconds.',
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
          `<button class="party-action-btn" data-action="fix-invite" ${getCard('fix-invite').loading ? 'disabled' : ''}>
            ${getCard('fix-invite').loading ? '<div class="party-btn-spinner"></div>' : 'Fix Invite'}
          </button>`
        )}

        <!-- Toggle Privacy -->
        ${renderActionCard('toggle-privacy', 'Toggle Privacy', 'Switches between Public and Private party mode.',
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
          `<button class="party-action-btn" data-action="toggle-privacy" ${getCard('toggle-privacy').loading ? 'disabled' : ''}>
            ${getCard('toggle-privacy').loading ? '<div class="party-btn-spinner"></div>' : 'Toggle Privacy'}
          </button>`
        )}

        <!-- Invite (temporarily disabled) -->
        ${renderActionCard('invite', 'Invite Player', 'Send a party invite to a player by display name. (Temporarily disabled)',
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
          `<div class="party-search-wrapper">
            <span class="party-hint" style="opacity:0.5;">This feature is temporarily disabled</span>
          </div>`
        )}

        <!-- Join -->
        ${renderActionCard('join', 'Join Player', 'Request to join another player\'s party.',
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`,
          `<div class="party-search-wrapper">
            <div class="party-search-bar">
              <input type="text" class="party-search-input" id="join-input" placeholder="Player name..." value="${escapeAttr(joinQuery)}" autocomplete="off" spellcheck="false" />
              <button class="party-action-btn party-action-btn--sm" data-action="join" ${getCard('join').loading ? 'disabled' : ''}>
                ${getCard('join').loading ? '<div class="party-btn-spinner"></div>' : 'Join'}
              </button>
            </div>
            ${renderDropdown('join', joinResults, joinQuery, joinSearching)}
          </div>`
        )}

        <!-- Kick (member from party) -->
        ${renderActionCard('kick', 'Kick Member', 'Kick a member from your party. Select from current party members.',
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>`,
          `<div class="party-member-select">
            ${partyMembers.length > 0 ? `
              <select class="party-select" id="kick-select">
                <option value="">Select member...</option>
                ${partyMembers.filter(m => !m.isLeader).map(m => `<option value="${m.accountId}">${escapeHtml(m.displayName)}</option>`).join('')}
              </select>
              <button class="party-action-btn party-action-btn--sm party-action-btn--danger" data-action="kick" ${getCard('kick').loading ? 'disabled' : ''}>
                ${getCard('kick').loading ? '<div class="party-btn-spinner"></div>' : 'Kick'}
              </button>
            ` : '<span class="party-hint">Refresh party to see members</span>'}
          </div>`
        )}

        <!-- Promote -->
        ${renderActionCard('promote', 'Promote Member', 'Promote a party member to party leader.',
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
          `<div class="party-member-select">
            ${partyMembers.length > 0 ? `
              <select class="party-select" id="promote-select">
                <option value="">Select member...</option>
                ${partyMembers.filter(m => !m.isLeader).map(m => `<option value="${m.accountId}">${escapeHtml(m.displayName)}</option>`).join('')}
              </select>
              <button class="party-action-btn party-action-btn--sm" data-action="promote" ${getCard('promote').loading ? 'disabled' : ''}>
                ${getCard('promote').loading ? '<div class="party-btn-spinner"></div>' : 'Promote'}
              </button>
            ` : '<span class="party-hint">Refresh party to see members</span>'}
          </div>`
        )}

        <!-- KickCollect -->
        ${renderActionCard('kick-collect', 'Kick & Collect', 'Collect STW rewards and leave the party.',
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
          `<button class="party-action-btn party-action-btn--warn" data-action="kick-collect" ${getCard('kick-collect').loading ? 'disabled' : ''}>
            ${getCard('kick-collect').loading ? '<div class="party-btn-spinner"></div>' : 'Kick & Collect'}
          </button>`
        )}

        <!-- KickCollect-Expulse -->
        ${renderActionCard('kick-collect-expulse', 'Kick All & Collect', 'Kick all party members, collect STW rewards, then leave.',
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
          `<button class="party-action-btn party-action-btn--danger" data-action="kick-collect-expulse" ${getCard('kick-collect-expulse').loading ? 'disabled' : ''}>
            ${getCard('kick-collect-expulse').loading ? '<div class="party-btn-spinner"></div>' : 'Kick All & Collect'}
          </button>`
        )}

        <!-- Leave Party -->
        ${renderActionCard('leave', 'Leave Party', 'Leave the current party immediately.',
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
          `<button class="party-action-btn party-action-btn--danger" data-action="leave" ${getCard('leave').loading ? 'disabled' : ''}>
            ${getCard('leave').loading ? '<div class="party-btn-spinner"></div>' : 'Leave Party'}
          </button>`
        )}

      </div>
    </div>
  `;

  bindEvents();
}

// ─── Card template ────────────────────────────────────────

function renderActionCard(id: string, title: string, description: string, icon: string, content: string): string {
  const state = getCard(id);
  return `
    <div class="party-card" data-card="${id}">
      <div class="party-card-header">
        <div class="party-card-icon">${icon}</div>
        <div>
          <h3 class="party-card-title">${title}</h3>
          <p class="party-card-desc">${description}</p>
        </div>
      </div>
      <div class="party-card-body">
        ${content}
      </div>
      ${state.result ? `<div class="party-card-msg party-card-msg--success">${escapeHtml(state.result)}</div>` : ''}
      ${state.error ? `<div class="party-card-msg party-card-msg--error">${escapeHtml(state.error)}</div>` : ''}
    </div>
  `;
}

function renderDropdown(type: string, results: { accountId: string; displayName: string; platform?: string }[], query: string, searching: boolean): string {
  if (query.length < 2 && !searching) return '';
  if (searching) {
    return `<div class="party-dropdown"><div class="party-dropdown-loading">Searching...</div></div>`;
  }
  if (results.length === 0 && query.length >= 2) return '';
  if (results.length === 0) return '';

  return `
    <div class="party-dropdown" id="${type}-dropdown">
      ${results.map((r) => `
        <div class="party-dropdown-item" data-type="${type}" data-id="${r.accountId}" data-name="${escapeAttr(r.displayName)}">
          <span class="party-dropdown-name">${escapeHtml(r.displayName)}</span>
          ${r.platform ? `<span class="party-dropdown-platform">${escapeHtml(r.platform)}</span>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Events ───────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // Refresh button
  el.querySelector('#party-refresh-btn')?.addEventListener('click', fetchPartyInfo);

  // Action buttons
  el.querySelectorAll('.party-action-btn[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action!;
      handleAction(action);
    });
  });

  // Invite input
  const inviteInput = el.querySelector('#invite-input') as HTMLInputElement;
  inviteInput?.addEventListener('input', () => {
    inviteQuery = inviteInput.value;
    if (inviteQuery.length < 2) { inviteResults = []; draw(); return; }
    if (inviteDebounce) clearTimeout(inviteDebounce);
    inviteDebounce = setTimeout(() => doSearch('invite'), 350);
  });

  // Join input
  const joinInput = el.querySelector('#join-input') as HTMLInputElement;
  joinInput?.addEventListener('input', () => {
    joinQuery = joinInput.value;
    if (joinQuery.length < 2) { joinResults = []; draw(); return; }
    if (joinDebounce) clearTimeout(joinDebounce);
    joinDebounce = setTimeout(() => doSearch('join'), 350);
  });

  // Dropdown items
  el.querySelectorAll('.party-dropdown-item').forEach((item) => {
    item.addEventListener('click', () => {
      const type = (item as HTMLElement).dataset.type!;
      const name = (item as HTMLElement).dataset.name || '';
      if (type === 'invite') {
        inviteQuery = name;
        inviteResults = [];
      } else if (type === 'join') {
        joinQuery = name;
        joinResults = [];
      }
      draw();
    });
  });
}

// ─── Actions ──────────────────────────────────────────────

async function fetchPartyInfo(): Promise<void> {
  loadingParty = true;
  partyError = null;
  draw();

  try {
    const res: PartyInfoResult = await window.glowAPI.party.info();
    if (res.success) {
      partyMembers = res.members || [];
      partyId = res.partyId || null;
      partySize = res.size || 0;
      partyPrivate = res.isPrivate || false;
    } else {
      partyError = res.error || 'Failed to load';
      partyMembers = [];
    }
  } catch (err: any) {
    partyError = err.message || 'Unexpected error';
    partyMembers = [];
  } finally {
    loadingParty = false;
    draw();
  }
}

async function handleAction(action: string): Promise<void> {
  const state = getCard(action);

  // ── Capture DOM values BEFORE draw() destroys them ──
  let savedMemberId = '';

  if (action === 'kick') {
    savedMemberId = (el?.querySelector('#kick-select') as HTMLSelectElement)?.value || '';
  } else if (action === 'promote') {
    savedMemberId = (el?.querySelector('#promote-select') as HTMLSelectElement)?.value || '';
  }

  state.loading = true;
  state.result = null;
  state.error = null;
  draw();

  try {
    let res: PartyActionResult;

    switch (action) {
      case 'fix-invite':
        res = await window.glowAPI.party.fixInvite();
        break;
      case 'toggle-privacy':
        res = await window.glowAPI.party.togglePrivacy();
        break;
      case 'leave':
        res = await window.glowAPI.party.leave();
        break;
      case 'invite': {
        if (!inviteQuery.trim()) { state.error = 'Enter a player name'; state.loading = false; draw(); return; }
        res = await window.glowAPI.party.invite(inviteQuery.trim());
        break;
      }
      case 'join': {
        if (!joinQuery.trim()) { state.error = 'Enter a player name'; state.loading = false; draw(); return; }
        res = await window.glowAPI.party.join(joinQuery.trim());
        break;
      }
      case 'kick': {
        if (!savedMemberId) { state.error = 'Select a member'; state.loading = false; draw(); return; }
        res = await window.glowAPI.party.kick(savedMemberId);
        break;
      }
      case 'promote': {
        if (!savedMemberId) { state.error = 'Select a member'; state.loading = false; draw(); return; }
        res = await window.glowAPI.party.promote(savedMemberId);
        break;
      }
      case 'kick-collect': {
        res = await window.glowAPI.party.kickCollect(true);
        break;
      }
      case 'kick-collect-expulse': {
        res = await window.glowAPI.party.kickCollectExpulse(true);
        break;
      }
      default:
        state.error = 'Unknown action';
        state.loading = false;
        draw();
        return;
    }

    if (res.success) {
      state.result = res.message || 'Done';
    } else {
      state.error = res.error || 'Action failed';
    }
  } catch (err: any) {
    state.error = err.message || 'Unexpected error';
  } finally {
    state.loading = false;
    draw();
    // Clear result after 6 seconds
    setTimeout(() => {
      state.result = null;
      state.error = null;
      if (el) draw();
    }, 6000);
  }
}

async function doSearch(type: 'invite' | 'join'): Promise<void> {
  const query = type === 'invite' ? inviteQuery : joinQuery;
  if (query.length < 2) return;

  if (type === 'invite') inviteSearching = true;
  else joinSearching = true;
  draw();

  try {
    const res = await window.glowAPI.party.search(query);
    if (res.success) {
      if (type === 'invite') inviteResults = res.results;
      else joinResults = res.results;
    }
  } catch { /* ignore */ }
  finally {
    if (type === 'invite') inviteSearching = false;
    else joinSearching = false;
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

export const partyPage: PageDefinition = {
  id: 'party',
  label: 'Party',
  icon: `<img src="assets/icons/fnui/BR-STW/party.png" alt="Party" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 21,
  render(container) {
    el = container;
    draw();
    // Auto-fetch party info on page load
    fetchPartyInfo();
    // Refresh party info when account changes
    window.glowAPI.accounts.onDataChanged(() => {
      if (el) fetchPartyInfo();
    });
  },
  cleanup() {
    if (inviteDebounce) clearTimeout(inviteDebounce);
    if (joinDebounce) clearTimeout(joinDebounce);
    el = null;
  },
};
