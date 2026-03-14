/**
 * Llamas Page — Open STW CardPack llamas per account.
 *
 * Shows each llama type the account owns as a game-accurate card
 * with quantity, image, and Claim / Claim All buttons.
 * Horizontally scrollable when cards overflow.
 * Activity log shows real-time progress from the main process.
 */

import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── Types ─────────────────────────────────────────────────────

interface LlamaEntry {
  templateId: string;
  name: string;
  quantity: number;
  itemIds: string[];
  type: 'voucher' | 'cardpack';
}

interface LlamaLogEntry {
  level: string;
  account: string;
  message: string;
  timestamp: number;
}

// ── State ─────────────────────────────────────────────────────

let llamas: LlamaEntry[] = [];
let loading = false;
let error: string | null = null;
let claimingSet = new Set<string>();   // templateIds currently being claimed
let logs: LlamaLogEntry[] = [];
let showBg = false;
let customBgPath = '';

// ── Image mapping ─────────────────────────────────────────────
// Maps voucher/cardpack template keys to persistentLlamas images

const PERSISTENT_LLAMAS_PATH = 'assets/icons/stw/llamas/persistentLlamas/';
const LEGACY_LLAMAS_PATH     = 'assets/icons/stw/llamas/';

/** Direct mapping for voucher templateIds → persistentLlamas images */
const VOUCHER_IMAGE_MAP: Record<string, string> = {
  'voucher_basicpack':                     'Voucher_BasicPack.png',
  'voucher_cardpack_bronze':               'Voucher_CardPack_Bronze.png',
  'voucher_cardpack_jackpot':              'Voucher_CardPack_Jackpot.png',
  'voucher_cardpack_event_founders':       'Voucher_CardPack_Event_Founders.png',
  'voucher_cardpack_2021anniversary':      'Voucher_CardPack_2021Anniversary.png',
  'voucher_cardpack_persistent_anniversary': 'Voucher_CardPack_Persistent_Anniversary.png',
};

/** Broader regex fallbacks for persistent llama images */
const PERSISTENT_IMAGE_RULES: [RegExp, string][] = [
  [/^voucher_basicpack/,                        'Voucher_BasicPack.png'],
  [/^voucher_cardpack_bronze/,                  'Voucher_CardPack_Bronze.png'],
  [/^voucher_cardpack_jackpot/,                 'Voucher_CardPack_Jackpot.png'],
  [/^voucher_cardpack_event_founders/,          'Voucher_CardPack_Event_Founders.png'],
  [/^voucher_cardpack_.*anniversary/,           'Voucher_CardPack_2021Anniversary.png'],
  [/^voucher_cardpack_persistent/,              'Voucher_CardPack_Persistent_Anniversary.png'],
];

/** Legacy CardPack image rules (fallback for actual CardPack:* items) */
const LEGACY_IMAGE_RULES: [RegExp, string][] = [
  [/cardpack_basic_tutorial/, 'PinataMiniRewardPack.png'],
  [/cardpack_basic/, 'PinataMiniRewardPack.png'],
  [/cardpack_bronze/, 'PinataStandardPack.png'],
  [/cardpack_silver/, 'PinataSilver.png'],
  [/cardpack_gold/, 'PinataGold.png'],
  [/cardpack_jackpot/, 'PinataGold.png'],
  [/cardpack_event_founders/, 'PinataFoundersPack.png'],
  [/cardpack_event.*halloween/, 'PinataHalloweenPack.png'],
  [/cardpack_event.*winter/, 'PinataWinterEventPack.png'],
  [/cardpack_event.*anniversary/, 'PinataAnniversaryPack-L.png'],
  [/cardpack_event.*spring/, 'PinataSpringEventPack.png'],
  [/cardpack_event.*pirate/, 'PinataYarrEventPack.png'],
];

function getLlamaImage(templateId: string): string {
  // Extract the key after the type prefix
  const key = templateId.replace(/^AccountResource:/, '').replace(/^CardPack:/, '');

  // 1) Exact match in voucher map
  if (VOUCHER_IMAGE_MAP[key]) return PERSISTENT_LLAMAS_PATH + VOUCHER_IMAGE_MAP[key];

  // 2) Regex match against persistent rules (for voucher variants)
  for (const [re, file] of PERSISTENT_IMAGE_RULES) {
    if (re.test(key)) return PERSISTENT_LLAMAS_PATH + file;
  }

  // 3) For actual CardPack:* items, try legacy images
  if (templateId.startsWith('CardPack:')) {
    for (const [re, file] of LEGACY_IMAGE_RULES) {
      if (re.test(key)) return LEGACY_LLAMAS_PATH + file;
    }
  }

  // 4) Fallback: use BasicPack for vouchers, StandardPack for cardpacks
  if (key.startsWith('voucher_')) return PERSISTENT_LLAMAS_PATH + 'Voucher_BasicPack.png';
  return LEGACY_LLAMAS_PATH + 'PinataStandardPack.png';
}

// ── Helpers ───────────────────────────────────────────────────

function getSelectedAccountId(): string {
  return (document.getElementById('account-select') as HTMLSelectElement)?.value || '';
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Log handling ──────────────────────────────────────────────

function onLog(entry: LlamaLogEntry): void {
  logs.push(entry);
  if (logs.length > 200) logs.splice(0, logs.length - 200);
  drawLogSection();
}

function drawLogSection(): void {
  if (!el) return;
  const listEl = el.querySelector('.llama-log-list');
  if (!listEl) return;

  if (logs.length === 0) {
    listEl.innerHTML = '<p class="llama-log-empty">No activity yet</p>';
    return;
  }

  listEl.innerHTML = logs
    .slice()
    .reverse()
    .map((l) => `
      <div class="llama-log-entry llama-log-${l.level}">
        <span class="llama-log-dot"></span>
        <span class="llama-log-name">${esc(l.account)}</span>
        <span class="llama-log-msg">${esc(l.message)}</span>
        <span class="llama-log-time">${fmtTime(l.timestamp)}</span>
      </div>`)
    .join('');
}

// ── Data loading ──────────────────────────────────────────────────────

async function loadLlamas(): Promise<void> {
  const accountId = getSelectedAccountId();
  if (!accountId) {
    error = 'No account selected';
    loading = false;
    draw();
    return;
  }

  loading = true;
  error = null;
  llamas = [];
  draw();

  try {
    const res = await window.glowAPI.llamas.get(accountId);
    if (res.success && res.llamas) {
      llamas = res.llamas;
    } else {
      error = res.error || 'Failed to load llamas';
    }
  } catch (err: any) {
    error = err.message || 'Unexpected error';
  }

  loading = false;
  draw();
}

/** Silent refresh used after a claim — keeps existing cards visible, no loading flash. */
async function refreshLlamasSilent(): Promise<void> {
  const accountId = getSelectedAccountId();
  if (!accountId) return;

  // Save scroll position before redraw
  const scrollArea = el?.querySelector('.llamas-scroll-area') as HTMLElement | null;
  const savedScroll = scrollArea?.scrollLeft ?? 0;

  try {
    const res = await window.glowAPI.llamas.get(accountId);
    if (res.success && res.llamas) {
      llamas = res.llamas;
    } else {
      error = res.error || 'Failed to load llamas';
    }
  } catch (err: any) {
    error = err.message || 'Unexpected error';
  }

  claimingSet.clear();
  draw();

  // Restore scroll position after DOM rebuild
  const newScrollArea = el?.querySelector('.llamas-scroll-area') as HTMLElement | null;
  if (newScrollArea) newScrollArea.scrollLeft = savedScroll;
}

// ── Claim actions ─────────────────────────────────────────────

/** Directly update a single card's claiming state without a full re-render. */
function updateCardClaiming(templateId: string): void {
  if (!el) return;
  const card = el.querySelector(`.llama-card[data-tpl="${templateId.replace(/"/g, '\\"')}"]`) as HTMLElement | null;
  if (!card) return;
  card.classList.add('llama-card--claiming');
  card.querySelectorAll<HTMLButtonElement>('.llama-btn').forEach((btn) => {
    btn.disabled = true;
    btn.innerHTML = '<span class="llama-btn-spinner"></span>';
  });
}

async function claimLlama(templateId: string, count: number): Promise<void> {
  const accountId = getSelectedAccountId();
  if (!accountId) return;

  const entry = llamas.find((l) => l.templateId === templateId);
  if (!entry) return;

  claimingSet.add(templateId);
  updateCardClaiming(templateId);

  try {
    const claimCount = Math.min(count, entry.quantity);
    const ids = entry.itemIds.slice(0, claimCount);
    const res = await window.glowAPI.llamas.open(accountId, entry.templateId, entry.type, claimCount, ids);
    if (!res.success) {
      error = res.error || 'Failed to open llamas';
    }
  } catch (err: any) {
    error = err.message || 'Unexpected error';
  }

  claimingSet.delete(templateId);
  await refreshLlamasSilent();
}

async function claimAllLlama(templateId: string): Promise<void> {
  const accountId = getSelectedAccountId();
  if (!accountId) return;

  const entry = llamas.find((l) => l.templateId === templateId);
  if (!entry) return;

  claimingSet.add(templateId);
  updateCardClaiming(templateId);

  try {
    const res = await window.glowAPI.llamas.open(accountId, entry.templateId, entry.type, entry.quantity, entry.itemIds);
    if (!res.success) {
      error = res.error || 'Failed to open llamas';
    }
  } catch (err: any) {
    error = err.message || 'Unexpected error';
  }

  claimingSet.delete(templateId);
  await refreshLlamasSilent();
}

// ── Render ────────────────────────────────────────────────────

const bgDiv = () => {
  if (!showBg) return '';
  if (customBgPath) return `<div class="llamas-bg" style="background: url('glow-bg://load/${customBgPath.replace(/\\/g, '/')}') center / cover no-repeat, linear-gradient(135deg, #0d0d1a 0%, #1a1030 40%, #0d0d1a 100%)"></div>`;
  return '<div class="llamas-bg"></div>';
};

function draw(): void {
  if (!el) return;

  if (loading) {
    el.innerHTML = `
      <div class="llamas-page">
        ${bgDiv()}
        <div class="llamas-loading">
          <div class="llamas-spinner"></div>
          <div class="llamas-loading-text">Loading llamas...</div>
        </div>
      </div>`;
    return;
  }

  if (error && llamas.length === 0) {
    el.innerHTML = `
      <div class="llamas-page">
        ${bgDiv()}
        <div class="llamas-empty">
          <div class="llamas-empty-icon">🦙</div>
          <div class="llamas-empty-text">${esc(error)}</div>
          <button class="llamas-retry-btn" data-action="retry">Retry</button>
        </div>
        ${renderLogSection()}
      </div>`;
    return;
  }

  if (llamas.length === 0) {
    el.innerHTML = `
      <div class="llamas-page">
        ${bgDiv()}
        <div class="llamas-empty">
          <div class="llamas-empty-icon">🦙</div>
          <div class="llamas-empty-text">No llamas available</div>
          <button class="llamas-retry-btn" data-action="retry">Refresh</button>
        </div>
        ${renderLogSection()}
      </div>`;
    return;
  }

  const cards = llamas.map((l) => {
    const isClaiming = claimingSet.has(l.templateId);
    const img = getLlamaImage(l.templateId);
    const claimCount = Math.min(l.quantity, 10);

    return `
      <div class="llama-card ${isClaiming ? 'llama-card--claiming' : ''}" data-tpl="${esc(l.templateId)}">
        <div class="llama-card-inner">
          <div class="llama-card-bg-glow"></div>
          <div class="llama-card-image-wrap">
            <img class="llama-card-image" src="${img}" alt="${esc(l.name)}" draggable="false" />
          </div>
          <div class="llama-card-qty-badge">${l.quantity} left</div>
          <div class="llama-card-name">${esc(l.name)}</div>
          <div class="llama-card-actions">
            <button class="llama-btn llama-btn-claim"
              data-action="claim" data-tpl="${esc(l.templateId)}" data-count="${claimCount}"
              ${isClaiming ? 'disabled' : ''}>
              ${isClaiming ? '<span class="llama-btn-spinner"></span>' : `CLAIM${claimCount > 1 ? ` (x${claimCount})` : ''}`}
            </button>
            ${l.quantity > 1 ? `
              <button class="llama-btn llama-btn-claimall"
                data-action="claim-all" data-tpl="${esc(l.templateId)}"
                ${isClaiming ? 'disabled' : ''}>
                ${isClaiming ? '<span class="llama-btn-spinner"></span>' : 'CLAIM ALL'}
              </button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="llamas-page">
      ${bgDiv()}
      <div class="llamas-header">
        <div class="llamas-title">Llamas</div>
        <div class="llamas-count">${llamas.reduce((s, l) => s + l.quantity, 0)} total</div>
      </div>
      ${error ? `<div class="llamas-error-bar">${esc(error)}</div>` : ''}
      <div class="llamas-scroll-area">
        <div class="llamas-cards">${cards}</div>
      </div>
      ${renderLogSection()}
    </div>`;
}

function renderLogSection(): string {
  const logsHtml = logs.length === 0
    ? '<p class="llama-log-empty">No activity yet</p>'
    : logs.slice().reverse().map((l) => `
        <div class="llama-log-entry llama-log-${l.level}">
          <span class="llama-log-dot"></span>
          <span class="llama-log-name">${esc(l.account)}</span>
          <span class="llama-log-msg">${esc(l.message)}</span>
          <span class="llama-log-time">${fmtTime(l.timestamp)}</span>
        </div>`).join('');

  return `
    <div class="llama-log-section">
      <h3 class="llama-log-title">Activity Log</h3>
      <div class="llama-log-list">${logsHtml}</div>
    </div>`;
}

// ── Click delegation ──────────────────────────────────────────

function handleClick(e: Event): void {
  const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!target) return;

  const action = target.dataset.action;
  if (action === 'retry') {
    loadLlamas();
  } else if (action === 'claim') {
    const tpl = target.dataset.tpl!;
    const count = parseInt(target.dataset.count || '1', 10);
    claimLlama(tpl, count);
  } else if (action === 'claim-all') {
    const tpl = target.dataset.tpl!;
    claimAllLlama(tpl);
  }
}

// ── Account switch ────────────────────────────────────────────

function onAccountChanged(): void {
  llamas = [];
  error = null;
  claimingSet.clear();
  loadLlamas();
}

// ── Page Definition ───────────────────────────────────────────

export const llamasPage: PageDefinition = {
  id: 'llamas',
  label: 'Llamas',
  icon: `<img src="assets/icons/stw/llamas/T_Icon_StoreLlamaBG.png" alt="Llamas" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 8,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    el.addEventListener('click', handleClick);
    window.addEventListener('glow:account-switched', onAccountChanged);
    window.glowAPI.llamas.onLog(onLog);
    const s = await window.glowAPI.storage.get<{ pageBackgrounds?: boolean; customBackgrounds?: Record<string, string> }>('settings');
    showBg = s?.pageBackgrounds ?? false;
    customBgPath = s?.customBackgrounds?.llamas || '';
    await loadLlamas();
  },

  cleanup(): void {
    window.removeEventListener('glow:account-switched', onAccountChanged);
    window.glowAPI.llamas.offLog();
    if (el) el.removeEventListener('click', handleClick);
    claimingSet.clear();
    el = null;
  },
};
