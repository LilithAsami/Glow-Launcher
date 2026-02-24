/**
 * Onboarding tutorial — professionally guides new users through the UI.
 *
 * Shows only once (persisted in storage). Can be skipped with Escape,
 * Space, or the on-screen "Skip" button.
 *
 * Each step highlights a target element with a pulsing ring and
 * shows explanatory text at the bottom of the screen.
 */

import type { Router } from './router';

// ── Types ────────────────────────────────────────────────────

interface TutorialStep {
  /** CSS selector to highlight (null = full-screen message) */
  target: string | null;
  /** Main text */
  title: string;
  /** Description shown below the title */
  desc: string;
  /** Optional action before showing the step */
  before?: () => void | Promise<void>;
}

// ── State ────────────────────────────────────────────────────

let overlay: HTMLDivElement | null = null;
let currentStep = 0;
let steps: TutorialStep[] = [];
let cleanupFn: (() => void) | null = null;

// ── Public API ───────────────────────────────────────────────

export async function tryShowTutorial(router: Router): Promise<void> {
  const done = await window.glowAPI.storage.get<boolean>('tutorial-done');
  if (done) return;
  startTutorial(router);
}

export function startTutorial(router: Router): void {
  steps = buildSteps(router);
  currentStep = 0;
  createOverlay();
  showStep();
}

// ── Step definitions ─────────────────────────────────────────

function buildSteps(router: Router): TutorialStep[] {
  return [
    // 0 — Welcome
    {
      target: null,
      title: 'Welcome to GLOW Launcher',
      desc: 'This quick tour will show you the most important parts of the interface. Press Space or click Next to continue — Esc to skip at any time.',
    },
    // 1 — Logo / Home
    {
      target: '#toolbar-logo',
      title: 'Home Button',
      desc: 'Click the GLOW logo at any time to return to the Home screen with your world-info dashboard.',
    },
    // 2 — Account selector
    {
      target: '.toolbar-account-wrap',
      title: 'Account Selector',
      desc: 'Use this dropdown to switch between your registered Epic Games accounts. The selected account is used by every feature.',
    },
    // 3 — Launch button
    {
      target: '#btn-launch',
      title: 'Launch Game',
      desc: 'Press this button to start Fortnite directly. Make sure the installation path is configured in Settings.',
    },
    // 4 — Accounts button
    {
      target: '#btn-accounts',
      title: 'Accounts Manager',
      desc: 'Open the Accounts page to add, remove, or reorder your Epic Games accounts. You can drag accounts to change their order.',
      before: () => { /* just highlight, don't navigate */ },
    },
    // 5 — Navigate to Accounts
    {
      target: '.accounts-list',
      title: 'Drag to Reorder',
      desc: 'Grab the ⠿ handle on the left of each account card and drag it up or down to change the order. Changes are saved automatically.',
      before: async () => {
        router.navigate('accounts');
        // Wait for render
        await sleep(300);
        // Inject fake tutorial accounts if the list is empty
        injectTutorialAccounts();
      },
    },
    // 6 — Sidebar
    {
      target: '#sidebar',
      title: 'Sidebar Navigation',
      desc: 'The sidebar lists all available pages grouped by category: BR-STW, Automated Systems, and Epic Games. Click any button to switch pages.',
      before: () => {
        removeTutorialAccounts();
        router.navigate('home');
      },
    },
    // 7 — A sidebar group
    {
      target: '.sidebar-group-header',
      title: 'Page Groups',
      desc: 'Pages are organized into groups. Each group header tells you the category. Scroll down to see more pages.',
    },
    // 8 — Sidebar buttons
    {
      target: '.sidebar-btn',
      title: 'Sidebar Buttons',
      desc: 'Each icon represents a feature page. Hover for a tooltip, click to navigate. You can show/hide pages from Settings.',
    },
    // 9 — Navigate to Settings
    {
      target: '.sidebar-btn[data-page-id="settings"]',
      title: 'Settings',
      desc: 'Here you can configure your Fortnite path, toggle sidebar pages on/off, enable minimize-to-tray, and configure startup options.',
      before: () => { router.navigate('settings'); },
    },
    // 10 — Window controls
    {
      target: '.header-controls',
      title: 'Window Controls',
      desc: 'Minimize, maximize, or close the window. If "Minimize to Tray" is enabled in Settings, closing will hide the app to the system tray instead.',
    },
    // 11 — Done
    {
      target: null,
      title: 'You\'re all set!',
      desc: 'That covers the essentials. Start by adding an account and exploring the sidebar pages. Have fun!',
      before: () => { router.navigate('home'); },
    },
  ];
}

// ── Overlay & rendering ──────────────────────────────────────

function createOverlay(): void {
  removeOverlay();

  overlay = document.createElement('div');
  overlay.id = 'tutorial-overlay';
  overlay.innerHTML = `
    <div class="tutorial-backdrop"></div>
    <div class="tutorial-highlight-ring"></div>
    <div class="tutorial-panel">
      <div class="tutorial-progress"></div>
      <div class="tutorial-step-counter"></div>
      <h2 class="tutorial-title"></h2>
      <p class="tutorial-desc"></p>
      <div class="tutorial-actions">
        <button class="tutorial-btn tutorial-btn-skip" id="tutorial-skip">Skip Tutorial</button>
        <div class="tutorial-actions-right">
          <button class="tutorial-btn tutorial-btn-prev" id="tutorial-prev">Back</button>
          <button class="tutorial-btn tutorial-btn-next" id="tutorial-next">Next</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Bind buttons
  overlay.querySelector('#tutorial-skip')!.addEventListener('click', finish);
  overlay.querySelector('#tutorial-prev')!.addEventListener('click', prevStep);
  overlay.querySelector('#tutorial-next')!.addEventListener('click', nextStep);

  // Keyboard
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { finish(); return; }
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); nextStep(); return; }
    if (e.key === 'ArrowLeft') { prevStep(); return; }
  };
  document.addEventListener('keydown', onKey);
  cleanupFn = () => document.removeEventListener('keydown', onKey);
}

function showStep(): void {
  if (!overlay) return;
  const step = steps[currentStep];
  if (!step) { finish(); return; }

  // Run before hook
  const res = step.before?.();
  if (res instanceof Promise) {
    res.then(() => renderStep(step));
  } else {
    // Small delay to let DOM settle after navigation
    setTimeout(() => renderStep(step), step.before ? 150 : 0);
  }
}

function renderStep(step: TutorialStep): void {
  if (!overlay) return;

  const ring = overlay.querySelector('.tutorial-highlight-ring') as HTMLElement;
  const panel = overlay.querySelector('.tutorial-panel') as HTMLElement;
  const title = overlay.querySelector('.tutorial-title') as HTMLElement;
  const desc = overlay.querySelector('.tutorial-desc') as HTMLElement;
  const progress = overlay.querySelector('.tutorial-progress') as HTMLElement;
  const counter = overlay.querySelector('.tutorial-step-counter') as HTMLElement;
  const prevBtn = overlay.querySelector('#tutorial-prev') as HTMLButtonElement;
  const nextBtn = overlay.querySelector('#tutorial-next') as HTMLButtonElement;

  // Content
  title.textContent = step.title;
  desc.textContent = step.desc;
  counter.textContent = `${currentStep + 1} / ${steps.length}`;

  // Progress bar
  const pct = ((currentStep + 1) / steps.length) * 100;
  progress.style.background = `linear-gradient(90deg, var(--accent) ${pct}%, var(--bg-elevated) ${pct}%)`;

  // Button states
  prevBtn.style.display = currentStep === 0 ? 'none' : '';
  nextBtn.textContent = currentStep === steps.length - 1 ? 'Finish' : 'Next';

  // Highlight target
  if (step.target) {
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      const pad = 8;
      ring.style.display = 'block';
      ring.style.left = `${rect.left - pad}px`;
      ring.style.top = `${rect.top - pad}px`;
      ring.style.width = `${rect.width + pad * 2}px`;
      ring.style.height = `${rect.height + pad * 2}px`;
      ring.style.borderRadius = getComputedStyle(el).borderRadius || '8px';

      // Position panel below or above the ring
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow > 180) {
        panel.style.top = '';
        panel.style.bottom = '32px';
      } else {
        panel.style.bottom = '32px';
        panel.style.top = '';
      }
    } else {
      ring.style.display = 'none';
    }
  } else {
    ring.style.display = 'none';
  }

  // Animate panel entrance
  panel.classList.remove('tutorial-panel-enter');
  void panel.offsetWidth;
  panel.classList.add('tutorial-panel-enter');
}

function nextStep(): void {
  if (currentStep < steps.length - 1) {
    currentStep++;
    showStep();
  } else {
    finish();
  }
}

function prevStep(): void {
  if (currentStep > 0) {
    currentStep--;
    showStep();
  }
}

async function finish(): Promise<void> {
  removeTutorialAccounts();
  removeOverlay();
  await window.glowAPI.storage.set('tutorial-done', true);
}

function removeOverlay(): void {
  cleanupFn?.();
  cleanupFn = null;
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

// ── Tutorial accounts injection ──────────────────────────────

function injectTutorialAccounts(): void {
  const list = document.querySelector('.accounts-list');
  if (!list) return;
  // If already have real accounts, skip injection
  if (list.querySelectorAll('.account-card').length > 0) return;

  const fakeAccounts = [
    { name: 'ExamplePlayer01', active: true },
    { name: 'MySecondAccount', active: false },
    { name: 'AltAccountSTW', active: false },
  ];

  list.innerHTML = fakeAccounts.map((acc, i) => `
    <div class="account-card tutorial-fake-card ${acc.active ? 'account-card-active' : ''}" draggable="true">
      <div class="account-drag-handle" title="Drag to reorder">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
        </svg>
      </div>
      <div class="account-avatar">
        <span class="account-avatar-letter">${acc.name.charAt(0)}</span>
      </div>
      <div class="account-info">
        <span class="account-name">${acc.name}</span>
        <span class="account-status ${acc.active ? '' : 'account-status-inactive'}">${acc.active ? 'Active' : 'Inactive'}</span>
      </div>
      <div class="account-actions">
        <button class="account-action-btn" disabled style="opacity:0.3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

function removeTutorialAccounts(): void {
  document.querySelectorAll('.tutorial-fake-card')?.forEach((c) => c.remove());
}

// ── Utilities ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
