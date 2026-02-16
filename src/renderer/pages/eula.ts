import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

interface CardState {
  loading: boolean;
  result: string | null;
  error: string | null;
  accepted: boolean;
}

const cards: Record<string, CardState> = {
  eula: { loading: false, result: null, error: null, accepted: false },
  privacy: { loading: false, result: null, error: null, accepted: false },
};

function getCard(id: string): CardState {
  return cards[id];
}

// ─── Drawing ──────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="page-eula">
      <h1 class="page-title">EULA</h1>
      <p class="page-subtitle">Accept Epic Games End-User License Agreement &amp; Privacy Policy</p>

      <div class="eula-warning">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div>
          <strong>Disclaimer</strong>
          <p>By using these actions you acknowledge that you are solely responsible for any consequences. GLOW Launcher is not liable for any changes made to your account.</p>
        </div>
      </div>

      <div class="eula-grid">
        ${renderCard('eula', 'Accept EULA', 'Accept the Epic Games End-User License Agreement for your account.', `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`)}
        ${renderCard('privacy', 'Accept Privacy Policy', 'Accept the Epic Games Privacy Policy for your account.', `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`)}
      </div>
    </div>
  `;

  // Wire up disclaimer checkboxes
  for (const id of ['eula', 'privacy']) {
    const chk = el.querySelector(`#eula-chk-${id}`) as HTMLInputElement | null;
    const btn = el.querySelector(`#eula-btn-${id}`) as HTMLButtonElement | null;
    if (chk && btn) {
      chk.checked = cards[id].accepted;
      btn.disabled = !cards[id].accepted || cards[id].loading;
      chk.addEventListener('change', () => {
        cards[id].accepted = chk.checked;
        btn.disabled = !chk.checked || cards[id].loading;
      });
      btn.addEventListener('click', () => handleAction(id));
    }
  }
}

function renderCard(
  id: string,
  title: string,
  description: string,
  iconSvg: string,
): string {
  const state = getCard(id);
  const disabledAttr = (!state.accepted || state.loading) ? 'disabled' : '';
  return `
    <div class="eula-card">
      <div class="eula-card-header">
        <span class="eula-card-icon">${iconSvg}</span>
        <h3>${title}</h3>
      </div>
      <p class="eula-card-desc">${description}</p>

      <label class="eula-disclaimer">
        <input type="checkbox" id="eula-chk-${id}" ${state.accepted ? 'checked' : ''} ${state.loading ? 'disabled' : ''} />
        <span>I accept full responsibility for this action on my account.</span>
      </label>

      ${state.loading ? '<div class="eula-spinner"></div>' : ''}
      ${state.result ? `<div class="eula-result success"><span>✓</span> ${escapeHtml(state.result)}</div>` : ''}
      ${state.error ? `<div class="eula-result error"><span>✕</span> ${escapeHtml(state.error)}</div>` : ''}

      <button class="btn btn-accent eula-action-btn" id="eula-btn-${id}" ${disabledAttr}>${title}</button>
    </div>
  `;
}

// ─── Actions ──────────────────────────────────────────────

async function handleAction(id: string): Promise<void> {
  const state = getCard(id);
  state.loading = true;
  state.result = null;
  state.error = null;
  draw();

  try {
    let res: { success: boolean; message: string };
    if (id === 'eula') {
      res = await window.glowAPI.eula.acceptEula();
    } else {
      res = await window.glowAPI.eula.acceptPrivacy();
    }

    if (res.success) {
      state.result = res.message || 'Accepted successfully';
    } else {
      state.error = res.message || 'Request failed';
    }
  } catch (err: any) {
    state.error = err?.message || 'Unexpected error';
  }

  state.loading = false;
  draw();
}

// ─── Helpers ──────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Page Definition ──────────────────────────────────────

export const eulaPage: PageDefinition = {
  id: 'eula',
  label: 'EULA',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>`,
  order: 22,
  render(container) {
    el = container;
    // Reset states on page entry
    for (const k of Object.keys(cards)) {
      cards[k].loading = false;
      cards[k].result = null;
      cards[k].error = null;
      cards[k].accepted = false;
    }
    draw();
  },
  cleanup() {
    el = null;
  },
};
