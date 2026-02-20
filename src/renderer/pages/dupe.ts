import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────────
let dupeLoading = false;
let dupeResult: { success: boolean; message: string; storageStatus?: string | null } | null = null;
let dupeWaiting = false;
let dupeTimeRemaining = 0;
let dupeTotalWait = 0;
let dupeCountdownInterval: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ──────────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Draw ─────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="dupe-page">
      <div class="dupe-header">
        <h1 class="page-title">Dupe</h1>
        <p class="page-subtitle">STW lobby dupe — You must be in your Homebase (FORTOUTPOST) and bugged</p>
      </div>

      <div class="dupe-content">
        <div class="dupe-card">
          <div class="dupe-info">
            <h3>How it works</h3>
            <ol class="dupe-steps">
              <li>Enter a Save the World homebase mission (FORTOUTPOST = storm shield)</li>
              <li>Get the bugged state (storm shield glitch)</li>
              <li>Click <strong>Execute Dupe</strong> below</li>
              <li>If the profile is locked, the app will wait and retry automatically</li>
            </ol>
          </div>

          ${dupeLoading && !dupeWaiting ? `
            <div class="dupe-loading">
              <div class="dupe-spinner"></div>
              <span id="dupe-status-text">Checking game session...</span>
            </div>
          ` : dupeWaiting ? `
            <div class="dupe-waiting">
              <div class="dupe-timer">
                <div class="dupe-timer-bar">
                  <div class="dupe-timer-fill" id="dupe-timer-fill" style="width: ${dupeTotalWait > 0 ? ((1 - dupeTimeRemaining / dupeTotalWait) * 100) : 0}%"></div>
                </div>
                <span class="dupe-timer-text" id="dupe-timer-text">${formatTime(dupeTimeRemaining)}</span>
              </div>
              <span class="dupe-waiting-label">Waiting for profile lock to expire...</span>
            </div>
          ` : dupeResult ? `
            <div class="dupe-result ${dupeResult.success ? 'dupe-result--success' : 'dupe-result--error'}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${dupeResult.success
                  ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                  : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'}
              </svg>
              <span>${esc(dupeResult.message)}</span>
            </div>
            ${dupeResult.storageStatus ? `
              <div class="dupe-storage">
                ${dupeResult.storageStatus === 'bugged-with-storage' ? 'Storage: Accessible' : 'Storage: Not accessible'}
              </div>
            ` : ''}
            <button class="dupe-btn dupe-btn--primary" id="dupe-execute">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              Try Again
            </button>
          ` : `
            <button class="dupe-btn dupe-btn--primary dupe-btn--large" id="dupe-execute">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Execute Dupe
            </button>
          `}
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

// ─── Events ───────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  const dupeExecBtn = el.querySelector('#dupe-execute') as HTMLButtonElement | null;
  dupeExecBtn?.addEventListener('click', () => executeDupe());

  // Listen for dupe status updates
  window.glowAPI.dupe.onStatus((data: any) => {
    if (data.status === 'waiting' && data.timeRemaining !== undefined) {
      dupeWaiting = true;
      dupeTimeRemaining = data.timeRemaining;
      dupeTotalWait = data.totalWait || data.timeRemaining;

      if (dupeCountdownInterval) clearInterval(dupeCountdownInterval);
      dupeCountdownInterval = setInterval(() => {
        dupeTimeRemaining -= 1000;
        if (dupeTimeRemaining <= 0) {
          dupeTimeRemaining = 0;
          if (dupeCountdownInterval) { clearInterval(dupeCountdownInterval); dupeCountdownInterval = null; }
        }
        updateTimerUI();
      }, 1000);

      draw();
    }
  });
}

function updateTimerUI(): void {
  if (!el) return;
  const fillEl = el.querySelector('#dupe-timer-fill') as HTMLElement | null;
  const textEl = el.querySelector('#dupe-timer-text') as HTMLElement | null;
  if (fillEl && dupeTotalWait > 0) {
    fillEl.style.width = `${((1 - dupeTimeRemaining / dupeTotalWait) * 100)}%`;
  }
  if (textEl) {
    textEl.textContent = formatTime(dupeTimeRemaining);
  }
}

// ─── Actions ──────────────────────────────────────────────────

async function executeDupe(): Promise<void> {
  if (dupeLoading) return;
  dupeLoading = true;
  dupeWaiting = false;
  dupeResult = null;
  dupeTimeRemaining = 0;
  dupeTotalWait = 0;
  if (dupeCountdownInterval) { clearInterval(dupeCountdownInterval); dupeCountdownInterval = null; }
  draw();

  try {
    const result = await window.glowAPI.dupe.execute();
    dupeResult = result;
  } catch (err: any) {
    dupeResult = { success: false, message: err.message || 'Unexpected error' };
  } finally {
    dupeLoading = false;
    dupeWaiting = false;
    if (dupeCountdownInterval) { clearInterval(dupeCountdownInterval); dupeCountdownInterval = null; }
    draw();
  }
}

// ─── Page Definition ──────────────────────────────────────────

export const dupePage: PageDefinition = {
  id: 'dupe',
  label: 'Dupe',
  icon: `<img src="assets/icons/fnui/BR-STW/dupe.png" alt="Dupe" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 19,
  render(container) {
    el = container;
    draw();
  },
  cleanup() {
    window.glowAPI.dupe.offStatus();
    if (dupeCountdownInterval) { clearInterval(dupeCountdownInterval); dupeCountdownInterval = null; }
    el = null;
  },
};
