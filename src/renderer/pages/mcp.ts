import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;
let executing = false;
let selectedOp = '';
let selectedProfile = '';
let resultData: any = null;
let errorMsg: string | null = null;

// Quick actions state
let claim2faLoading = false;
let claim2faStatus: 'idle' | 'success' | 'error' = 'idle';
let claim2faMsg = '';
let skipTutorialLoading = false;
let skipTutorialStatus: 'idle' | 'success' | 'error' = 'idle';
let skipTutorialMsg = '';

// ─── Operations & Profiles (same list as the bot) ────────────

const OPERATIONS = [
  'QueryPublicProfile', 'QueryProfile', 'ClaimLoginReward', 'ClientQuestLogin',
  'PopulatePrerolledOffers', 'PurchaseCatalogEntry', 'FortRerollDailyQuest',
  'SetMtxPlatform', 'RecycleItemBatch', 'RecycleItem', 'RefreshExpeditions',
  'PurchaseHomebaseNode', 'OpenCardPackBatch', 'OpenCardPack', 'UnslotAllWorkers',
  'UnassignAllSquads', 'TransmogItem', 'SkipTutorial', 'ModifyMission',
  'IssueFriendCode', 'IncrementNamedCounterStat', 'GetMcpTimeForLogin',
  'EquipCharCosmetic', 'EndPrimaryMission', 'EarnScore', 'ConvertItem',
  'ConsumeItems', 'CollectExpedition', 'ClaimMissionAlertRewards',
  'ClaimCollectionBookRewards', 'ClaimCollectedResources',
  'AssignWorkerToSquadBatch', 'AssignWorkerToSquad', 'ApplyAlteration',
  'ActivateConsumable', 'SetAffiliateName', 'ClaimMfaEnabled', 'SetLoadoutName',
  'SetActiveHeroLoadout', 'SetHomebaseName', 'PurchaseOrUpgradeHomebaseNode',
  'AbandonExpedition', 'UpdateOutpostCore', 'UpdateDeployableBaseTierProgression',
  'CreateOrUpgradeOutpostItem', 'CreateDeployableBaseItem', 'UpgradeSlottedItem',
  'ConvertSlottedItem', 'ClaimCollectionBookPageRewards', 'SetBattleRoyaleBanner',
  'EndBattleRoyaleGame', 'EquipBattleRoyaleCustomization',
  'UpdateBuildingLevelAndRating', 'UnloadWarehouse', 'DestroyWorldItems',
  'StorageTransfer', 'PurchaseResearchStatUpgrade', 'ClaimDifficultyIncreaseRewards',
  'SetItemArchivedStatusBatch', 'SetGameplayStats',
];

const PROFILES = [
  'athena', 'common_core', 'campaign', 'theater0', 'theater1', 'theater2',
  'outpost0', 'collections', 'collection_book_people0',
  'collection_book_schematics0', 'metadata', 'common_public', 'creative',
  'recycle_bin',
];

// ─── Filter helpers ───────────────────────────────────────────

let opFilter = '';
let profileFilter = '';
let opDropdownOpen = false;
let profileDropdownOpen = false;

function filteredOps(): string[] {
  if (!opFilter) return OPERATIONS;
  const q = opFilter.toLowerCase();
  return OPERATIONS.filter((o) => o.toLowerCase().includes(q));
}

function filteredProfiles(): string[] {
  if (!profileFilter) return PROFILES;
  const q = profileFilter.toLowerCase();
  return PROFILES.filter((p) => p.toLowerCase().includes(q));
}

// ─── Draw ─────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  const jsonStr = resultData ? JSON.stringify(resultData, null, 2) : null;
  const sizeMB = jsonStr ? new Blob([jsonStr]).size / (1024 * 1024) : 0;

  el.innerHTML = `
    <div class="mcp-page">
      <div class="mcp-header">
        <h1 class="page-title">MCP</h1>
        <p class="page-subtitle">Execute MCP operations on your main account</p>
      </div>

      <!-- Quick Actions -->
      <div class="mcp-quick-actions">
        <div class="mcp-quick-card">
          <div class="mcp-quick-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          </div>
          <div class="mcp-quick-info">
            <h3 class="mcp-quick-title">Claim 2FA Reward</h3>
            <p class="mcp-quick-desc">Claim the reward for activating Two-Factor Authentication</p>
          </div>
          <div class="mcp-quick-action">
            ${claim2faStatus === 'success' ? `<span class="mcp-quick-status mcp-quick-status--success"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Claimed</span>` : ''}
            ${claim2faStatus === 'error' ? `<span class="mcp-quick-status mcp-quick-status--error" title="${escapeAttr(claim2faMsg)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Error
            </span>` : ''}
            <button class="mcp-quick-btn" id="mcp-claim2fa" ${claim2faLoading ? 'disabled' : ''}>
              ${claim2faLoading ? '<div class="mcp-spinner mcp-spinner--sm"></div>' : 'Claim'}
            </button>
          </div>
        </div>
        <div class="mcp-quick-card">
          <div class="mcp-quick-icon mcp-quick-icon--yellow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div class="mcp-quick-info">
            <h3 class="mcp-quick-title">Skip STW Tutorial</h3>
            <p class="mcp-quick-desc">Skip the Save the World introductory tutorial</p>
          </div>
          <div class="mcp-quick-action">
            ${skipTutorialStatus === 'success' ? `<span class="mcp-quick-status mcp-quick-status--success"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Skipped</span>` : ''}
            ${skipTutorialStatus === 'error' ? `<span class="mcp-quick-status mcp-quick-status--error" title="${escapeAttr(skipTutorialMsg)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Error
            </span>` : ''}
            <button class="mcp-quick-btn mcp-quick-btn--yellow" id="mcp-skip-tutorial" ${skipTutorialLoading ? 'disabled' : ''}>
              ${skipTutorialLoading ? '<div class="mcp-spinner mcp-spinner--sm"></div>' : 'Skip'}
            </button>
          </div>
        </div>
      </div>

      <div class="mcp-divider"></div>

      <div class="mcp-form">
        <!-- Operation Select -->
        <div class="mcp-field">
          <label class="mcp-label">Operation</label>
          <div class="mcp-select" id="mcp-op-select">
            <div class="mcp-select-trigger" id="mcp-op-trigger">
              <span class="mcp-select-value ${selectedOp ? '' : 'mcp-select-placeholder'}">
                ${selectedOp || 'Select operation...'}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="mcp-select-dropdown ${opDropdownOpen ? 'mcp-select-dropdown--open' : ''}" id="mcp-op-dropdown">
              <div class="mcp-select-search">
                <input type="text" id="mcp-op-search" placeholder="Search operations..." value="${escapeAttr(opFilter)}" autocomplete="off" spellcheck="false"/>
              </div>
              <div class="mcp-select-options" id="mcp-op-options">
                ${filteredOps().map((op) => `
                  <div class="mcp-select-option ${op === selectedOp ? 'mcp-select-option--active' : ''}" data-value="${op}">${op}</div>
                `).join('')}
                ${filteredOps().length === 0 ? '<div class="mcp-select-empty">No operations found</div>' : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Profile Select -->
        <div class="mcp-field">
          <label class="mcp-label">Profile ID</label>
          <div class="mcp-select" id="mcp-profile-select">
            <div class="mcp-select-trigger" id="mcp-profile-trigger">
              <span class="mcp-select-value ${selectedProfile ? '' : 'mcp-select-placeholder'}">
                ${selectedProfile || 'Select profile...'}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="mcp-select-dropdown ${profileDropdownOpen ? 'mcp-select-dropdown--open' : ''}" id="mcp-profile-dropdown">
              <div class="mcp-select-search">
                <input type="text" id="mcp-profile-search" placeholder="Search profiles..." value="${escapeAttr(profileFilter)}" autocomplete="off" spellcheck="false"/>
              </div>
              <div class="mcp-select-options" id="mcp-profile-options">
                ${filteredProfiles().map((p) => `
                  <div class="mcp-select-option ${p === selectedProfile ? 'mcp-select-option--active' : ''}" data-value="${p}">${p}</div>
                `).join('')}
                ${filteredProfiles().length === 0 ? '<div class="mcp-select-empty">No profiles found</div>' : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Execute Button -->
        <button class="mcp-execute-btn ${executing ? 'mcp-execute-btn--loading' : ''}" id="mcp-execute" ${executing || !selectedOp || !selectedProfile ? 'disabled' : ''}>
          ${executing ? `
            <div class="mcp-spinner"></div>
            Executing...
          ` : `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Execute
          `}
        </button>
      </div>

      <!-- Error -->
      ${errorMsg ? `
        <div class="mcp-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>${escapeHtml(errorMsg)}</span>
        </div>
      ` : ''}

      <!-- Result -->
      ${resultData ? `
        <div class="mcp-result">
          <div class="mcp-result-header">
            <div class="mcp-result-info">
              <span class="mcp-result-badge mcp-result-badge--success">Success</span>
              <span class="mcp-result-meta">${selectedOp} · ${selectedProfile} · ${sizeMB.toFixed(2)}MB</span>
            </div>
            <div class="mcp-result-actions">
              <button class="files-btn files-btn--primary" id="mcp-download">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </button>
              <button class="files-btn files-btn--secondary" id="mcp-preview">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview
              </button>
              <button class="files-btn files-btn--ghost" id="mcp-copy" title="Copy to clipboard">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    </div>

    <!-- JSON Preview Modal (reuses files-modal styles) -->
    <div class="files-modal-overlay" id="mcp-modal-overlay" style="display:none">
      <div class="files-modal">
        <div class="files-modal-header">
          <h2 class="files-modal-title">MCP Response</h2>
          <div class="files-modal-header-actions">
            <button class="files-btn files-btn--ghost" id="mcp-modal-copy" title="Copy to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="files-btn files-btn--ghost" id="mcp-modal-close" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="files-modal-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="mcp-modal-search" placeholder="Search in JSON..." autocomplete="off" spellcheck="false"/>
        </div>
        <pre class="files-modal-json" id="mcp-modal-json"></pre>
      </div>
    </div>
  `;

  bindEvents();
}

// ─── Events ───────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // ─ Operation dropdown
  const opTrigger = el.querySelector('#mcp-op-trigger') as HTMLElement;
  const opDropdown = el.querySelector('#mcp-op-dropdown') as HTMLElement;
  const opSearch = el.querySelector('#mcp-op-search') as HTMLInputElement;
  const opOptions = el.querySelector('#mcp-op-options') as HTMLElement;

  opTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdownOpen = false;
    opDropdownOpen = !opDropdownOpen;
    draw();
    if (opDropdownOpen) {
      setTimeout(() => {
        (el?.querySelector('#mcp-op-search') as HTMLInputElement)?.focus();
      }, 0);
    }
  });

  opSearch?.addEventListener('input', () => {
    opFilter = opSearch.value;
    const opts = el?.querySelector('#mcp-op-options') as HTMLElement;
    if (opts) {
      opts.innerHTML = filteredOps().map((op) => `
        <div class="mcp-select-option ${op === selectedOp ? 'mcp-select-option--active' : ''}" data-value="${op}">${op}</div>
      `).join('') || '<div class="mcp-select-empty">No operations found</div>';
      bindOptionClicks(opts, 'op');
    }
  });

  opSearch?.addEventListener('click', (e) => e.stopPropagation());
  if (opOptions) bindOptionClicks(opOptions, 'op');

  // ─ Profile dropdown
  const profileTrigger = el.querySelector('#mcp-profile-trigger') as HTMLElement;
  const profileSearch = el.querySelector('#mcp-profile-search') as HTMLInputElement;
  const profileOptions = el.querySelector('#mcp-profile-options') as HTMLElement;

  profileTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    opDropdownOpen = false;
    profileDropdownOpen = !profileDropdownOpen;
    draw();
    if (profileDropdownOpen) {
      setTimeout(() => {
        (el?.querySelector('#mcp-profile-search') as HTMLInputElement)?.focus();
      }, 0);
    }
  });

  profileSearch?.addEventListener('input', () => {
    profileFilter = profileSearch.value;
    const opts = el?.querySelector('#mcp-profile-options') as HTMLElement;
    if (opts) {
      opts.innerHTML = filteredProfiles().map((p) => `
        <div class="mcp-select-option ${p === selectedProfile ? 'mcp-select-option--active' : ''}" data-value="${p}">${p}</div>
      `).join('') || '<div class="mcp-select-empty">No profiles found</div>';
      bindOptionClicks(opts, 'profile');
    }
  });

  profileSearch?.addEventListener('click', (e) => e.stopPropagation());
  if (profileOptions) bindOptionClicks(profileOptions, 'profile');

  // ─ Close dropdowns on outside click
  document.addEventListener('click', handleOutsideClick);

  // ─ Quick actions
  el.querySelector('#mcp-claim2fa')?.addEventListener('click', executeQuickAction2FA);
  el.querySelector('#mcp-skip-tutorial')?.addEventListener('click', executeQuickActionSkip);

  // ─ Execute
  el.querySelector('#mcp-execute')?.addEventListener('click', executeMcp);

  // ─ Result actions
  el.querySelector('#mcp-download')?.addEventListener('click', downloadResult);
  el.querySelector('#mcp-preview')?.addEventListener('click', openPreview);
  el.querySelector('#mcp-copy')?.addEventListener('click', () => copyToClipboard());

  // ─ Modal
  const overlay = el.querySelector('#mcp-modal-overlay') as HTMLElement;
  overlay?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'mcp-modal-overlay') closeModal();
  });
  el.querySelector('#mcp-modal-close')?.addEventListener('click', closeModal);
  el.querySelector('#mcp-modal-copy')?.addEventListener('click', () => copyToClipboard(el?.querySelector('#mcp-modal-copy') as HTMLButtonElement));

  const modalSearch = el.querySelector('#mcp-modal-search') as HTMLInputElement;
  modalSearch?.addEventListener('input', () => highlightJson(modalSearch.value.trim().toLowerCase()));

  document.addEventListener('keydown', handleEsc);
}

function bindOptionClicks(container: HTMLElement, type: 'op' | 'profile'): void {
  container.querySelectorAll('.mcp-select-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = (opt as HTMLElement).dataset.value || '';
      if (type === 'op') {
        selectedOp = value;
        opFilter = '';
        opDropdownOpen = false;
      } else {
        selectedProfile = value;
        profileFilter = '';
        profileDropdownOpen = false;
      }
      draw();
    });
  });
}

function handleOutsideClick(): void {
  if (opDropdownOpen || profileDropdownOpen) {
    opDropdownOpen = false;
    profileDropdownOpen = false;
    draw();
  }
}

function handleEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (el?.querySelector('#mcp-modal-overlay')?.style.display === 'flex') {
      closeModal();
    } else if (opDropdownOpen || profileDropdownOpen) {
      opDropdownOpen = false;
      profileDropdownOpen = false;
      draw();
    }
  }
}

// ─── Actions ──────────────────────────────────────────────────

async function executeQuickAction2FA(): Promise<void> {
  if (claim2faLoading) return;
  claim2faLoading = true;
  claim2faStatus = 'idle';
  claim2faMsg = '';
  draw();
  try {
    const result = await window.glowAPI.mcp.execute('ClaimMfaEnabled', 'common_core');
    if (result.success) {
      claim2faStatus = 'success';
    } else {
      claim2faStatus = 'error';
      claim2faMsg = result.error || 'Failed to claim 2FA reward';
    }
  } catch (err: any) {
    claim2faStatus = 'error';
    claim2faMsg = err.message || 'Unexpected error';
  } finally {
    claim2faLoading = false;
    draw();
  }
}

async function executeQuickActionSkip(): Promise<void> {
  if (skipTutorialLoading) return;
  skipTutorialLoading = true;
  skipTutorialStatus = 'idle';
  skipTutorialMsg = '';
  draw();
  try {
    const result = await window.glowAPI.mcp.execute('SkipTutorial', 'campaign');
    if (result.success) {
      skipTutorialStatus = 'success';
    } else {
      skipTutorialStatus = 'error';
      skipTutorialMsg = result.error || 'Failed to skip tutorial';
    }
  } catch (err: any) {
    skipTutorialStatus = 'error';
    skipTutorialMsg = err.message || 'Unexpected error';
  } finally {
    skipTutorialLoading = false;
    draw();
  }
}

async function executeMcp(): Promise<void> {
  if (executing || !selectedOp || !selectedProfile) return;
  executing = true;
  errorMsg = null;
  resultData = null;
  draw();

  try {
    const result = await window.glowAPI.mcp.execute(selectedOp, selectedProfile);
    if (result.success) {
      resultData = result.data;
      errorMsg = null;
    } else {
      errorMsg = result.error || 'MCP operation failed';
    }
  } catch (err: any) {
    errorMsg = err.message || 'Unexpected error';
  } finally {
    executing = false;
    draw();
  }
}

async function downloadResult(): Promise<void> {
  if (!resultData) return;
  const jsonStr = JSON.stringify(resultData, null, 2);
  const name = `mcp_${selectedProfile}_${selectedOp}`;
  try {
    await window.glowAPI.files.save(jsonStr, name);
  } catch {
    // user cancelled
  }
}

function copyToClipboard(btn?: HTMLButtonElement | null): void {
  if (!resultData) return;
  const jsonStr = JSON.stringify(resultData, null, 2);
  navigator.clipboard.writeText(jsonStr).then(() => {
    if (btn) {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      }, 2000);
    }
  });
}

function openPreview(): void {
  if (!resultData || !el) return;
  const overlay = el.querySelector('#mcp-modal-overlay') as HTMLElement;
  const jsonPre = el.querySelector('#mcp-modal-json') as HTMLPreElement;
  const searchInput = el.querySelector('#mcp-modal-search') as HTMLInputElement;
  if (!overlay || !jsonPre) return;

  const jsonStr = JSON.stringify(resultData, null, 2);
  jsonPre.innerHTML = syntaxHighlight(jsonStr);
  overlay.style.display = 'flex';
  if (searchInput) searchInput.value = '';
}

function closeModal(): void {
  if (!el) return;
  const overlay = el.querySelector('#mcp-modal-overlay') as HTMLElement;
  if (overlay) overlay.style.display = 'none';
}

// ─── JSON Syntax Highlighting ─────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          const inner = escapeHtml(match.slice(1, -2));
          return `<span class="${cls}">"${inner}"</span>:`;
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${escapeHtml(match)}</span>`;
    },
  );
}

function highlightJson(query: string): void {
  if (!el || !resultData) return;
  const jsonPre = el.querySelector('#mcp-modal-json') as HTMLPreElement;
  if (!jsonPre) return;

  const jsonStr = JSON.stringify(resultData, null, 2);
  if (!query) { jsonPre.innerHTML = syntaxHighlight(jsonStr); return; }

  let highlighted = syntaxHighlight(jsonStr);
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    highlighted = highlighted.replace(/>[^<]*</g, (seg) => seg.replace(regex, '<mark class="json-match">$1</mark>'));
  } catch { /* ignore */ }
  jsonPre.innerHTML = highlighted;

  const first = jsonPre.querySelector('.json-match');
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ─── Page Definition ──────────────────────────────────────────

export const mcpPage: PageDefinition = {
  id: 'mcp',
  label: 'MCP',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  order: 18,
  render(container) {
    el = container;
    draw();
  },
  cleanup() {
    document.removeEventListener('keydown', handleEsc);
    document.removeEventListener('click', handleOutsideClick);
    el = null;
  },
};
