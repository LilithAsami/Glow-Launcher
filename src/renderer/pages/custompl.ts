/**
 * Custom Power Level page — set a custom STW power level on your main account's party.
 * Uses the same calibrated curve as the taxi system.
 */

import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────

let powerLevel = 130;
let applying = false;
let statusMessage: { text: string; type: 'success' | 'error' } | null = null;

const PL_CALIBRATED_MAX = 258;
const PL_MAX = 5965230847;

// ── Helpers ───────────────────────────────────────────────

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function isCalibrated(pl: number): boolean {
  return pl >= 1 && pl <= PL_CALIBRATED_MAX;
}

// ── Draw ──────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  const calibrated = isCalibrated(powerLevel);

  el.innerHTML = `
    <div class="cpl-page">
      <div class="cpl-header">
        <h1 class="page-title">Custom Power Level</h1>
        <p class="page-subtitle">Set a custom STW power level on your main account's party member data</p>
      </div>

      <div class="cpl-alert">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>Only visible to your team members. You will not see it on yourself.</span>
      </div>

      <div class="cpl-card">
        <div class="cpl-card-inner">

          <!-- Power display -->
          <div class="cpl-power-display">
            <span class="cpl-power-value">${powerLevel}</span>
            ${!calibrated ? '<span class="cpl-warn">uncalibrated</span>' : ''}
          </div>

          <!-- Number input -->
          <input type="number" class="cpl-input" id="cpl-input"
            value="${powerLevel}" min="0" max="${PL_MAX}" />

          <!-- Apply button -->
          <button class="cpl-apply-btn" id="cpl-apply" ${applying ? 'disabled' : ''}>
            ${applying ? '<span class="cpl-spinner"></span> Applying...' : 'Apply Power Level'}
          </button>

          ${statusMessage ? `
            <div class="cpl-status cpl-status-${statusMessage.type}">${esc(statusMessage.text)}</div>
          ` : ''}

          <p class="cpl-note">Requires Fortnite open in the lobby. Calibrated range: 1-${PL_CALIBRATED_MAX}.</p>
        </div>
      </div>
    </div>

    <style>
      .cpl-page {
        padding: 32px;
        max-width: 480px;
        margin: 0 auto;
      }
      .cpl-header { margin-bottom: 16px; }

      .cpl-alert {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 8px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        color: var(--text-muted, rgba(255,255,255,0.5));
        font-size: 12px;
        margin-bottom: 16px;
      }
      .cpl-alert svg { flex-shrink: 0; opacity: 0.6; }

      .cpl-card {
        background: var(--card-bg, rgba(255,255,255,0.04));
        border: 1px solid var(--border, rgba(255,255,255,0.08));
        border-radius: 12px;
      }
      .cpl-card-inner {
        padding: 28px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .cpl-power-display {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      .cpl-power-value {
        font-size: 52px;
        font-weight: 700;
        color: var(--text-primary, #e5e5e5);
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }
      .cpl-warn {
        font-size: 11px;
        color: #f0a030;
        background: rgba(240,160,48,0.12);
        border: 1px solid rgba(240,160,48,0.25);
        padding: 2px 8px;
        border-radius: 6px;
        align-self: flex-end;
        margin-bottom: 6px;
      }

      .cpl-input {
        width: 100%;
        background: var(--input-bg, rgba(255,255,255,0.06));
        border: 1px solid var(--border, rgba(255,255,255,0.1));
        border-radius: 8px;
        color: var(--text, #fff);
        padding: 10px 14px;
        font-size: 15px;
        font-family: inherit;
        text-align: center;
        outline: none;
        transition: border-color 0.15s;
        box-sizing: border-box;
      }
      .cpl-input:focus { border-color: var(--accent, #6c5ce7); }
      .cpl-input::-webkit-inner-spin-button,
      .cpl-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      .cpl-input[type=number] { -moz-appearance: textfield; }

      .cpl-apply-btn {
        width: 100%;
        padding: 11px;
        font-size: 14px;
        font-weight: 600;
        font-family: inherit;
        border: none;
        border-radius: 8px;
        background: var(--accent, #6c5ce7);
        color: #fff;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.1s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .cpl-apply-btn:hover:not(:disabled) { opacity: 0.88; }
      .cpl-apply-btn:active:not(:disabled) { transform: scale(0.98); }
      .cpl-apply-btn:disabled { opacity: 0.45; cursor: not-allowed; }

      .cpl-spinner {
        display: inline-block;
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: cpl-spin 0.6s linear infinite;
      }
      @keyframes cpl-spin { to { transform: rotate(360deg); } }

      .cpl-status {
        width: 100%;
        padding: 9px 14px;
        border-radius: 8px;
        font-size: 13px;
        text-align: center;
        box-sizing: border-box;
      }
      .cpl-status-success {
        background: rgba(46,213,115,0.1);
        color: #2ed573;
        border: 1px solid rgba(46,213,115,0.2);
      }
      .cpl-status-error {
        background: rgba(255,71,87,0.1);
        color: #ff4757;
        border: 1px solid rgba(255,71,87,0.2);
      }

      .cpl-note {
        font-size: 11px;
        color: var(--text-muted, rgba(255,255,255,0.3));
        text-align: center;
        margin: 0;
      }
    </style>
  `;

  bindEvents();
}

// ── Events ────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  const input = el.querySelector<HTMLInputElement>('#cpl-input');
  if (input) {
    input.addEventListener('input', () => {
      const val = parseInt(input.value, 10);
      if (!isNaN(val)) {
        powerLevel = Math.min(val, PL_MAX);
        updateDisplay();
      }
    });
  }

  el.querySelector<HTMLButtonElement>('#cpl-apply')?.addEventListener('click', () => applyPowerLevel());
}

function updateDisplay(): void {
  const display = el?.querySelector('.cpl-power-value');
  if (display) display.textContent = String(powerLevel);

  const container = el?.querySelector('.cpl-power-display');
  const existingWarn = el?.querySelector('.cpl-warn');
  if (!isCalibrated(powerLevel) && !existingWarn && container) {
    const span = document.createElement('span');
    span.className = 'cpl-warn';
    span.textContent = 'uncalibrated';
    container.appendChild(span);
  } else if (isCalibrated(powerLevel) && existingWarn) {
    existingWarn.remove();
  }
}

async function applyPowerLevel(): Promise<void> {
  if (applying) return;
  applying = true;
  statusMessage = null;
  draw();

  try {
    const result = await window.glowAPI.ghostequip.setPowerLevel(powerLevel);
    statusMessage = result.success
      ? { text: result.message || `Power Level set to ${powerLevel}`, type: 'success' }
      : { text: result.error || 'Failed to apply power level', type: 'error' };
  } catch (err: any) {
    statusMessage = { text: err?.message || 'Unknown error', type: 'error' };
  }

  applying = false;
  draw();
}

// ── Page Definition ───────────────────────────────────────

export const customplPage: PageDefinition = {
  id: 'custompl',
  label: 'Custom PL',
  icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  order: 22,
  render(container) {
    el = container;
    draw();
  },
  cleanup() {
    el = null;
  },
};
