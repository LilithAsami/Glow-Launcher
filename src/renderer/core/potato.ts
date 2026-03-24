import type { Router } from './router';
import type { PageDefinition } from '../../shared/types';
import { sidebarGroups } from '../pages/registry';

let _router: Router | null = null;
let _potatoEnabled = false;
let _backBar: HTMLElement | null = null;

export function isPotatoMode(): boolean {
  return _potatoEnabled;
}

export function setPotatoMode(enabled: boolean): void {
  _potatoEnabled = enabled;
  document.body.classList.toggle('potato-style', enabled);
  if (enabled) {
    document.body.classList.remove('minimalist');
  }
  updateBackBarVisibility();
}

export function initPotatoMode(router: Router): void {
  _router = router;

  // Create persistent back bar as a sibling before #content (outside page render scope)
  const main = document.getElementById('main');
  const content = document.getElementById('content');
  if (main && content && !_backBar) {
    _backBar = document.createElement('div');
    _backBar.className = 'potato-back-bar';
    _backBar.hidden = true;
    _backBar.innerHTML = `
      <button class="potato-back-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>
    `;
    _backBar.querySelector('.potato-back-btn')!.addEventListener('click', () => {
      _router?.navigate('home');
    });
    main.insertBefore(_backBar, content);
  }

  // Escape key: go back to home (potato grid)
  document.addEventListener('keydown', (e) => {
    if (!_potatoEnabled) return;
    if (e.key === 'Escape' && router.getCurrentPageId() !== 'home') {
      e.preventDefault();
      router.navigate('home');
    }
  });

  // Show/hide back bar on navigation
  router.onNavigate(() => updateBackBarVisibility());
}

function updateBackBarVisibility(): void {
  if (!_backBar) return;
  const show = _potatoEnabled && _router?.getCurrentPageId() !== 'home';
  _backBar.hidden = !show;
}

export function renderPotatoGrid(container: HTMLElement, router: Router): void {
  // Load hidden pages from settings to respect user preferences
  const settingsIcon = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

  const groupsHtml = sidebarGroups.map((group) => {
    const cards = group.pages.map((page) => `
      <button class="potato-card" data-page-id="${page.id}">
        <div class="potato-card-icon">${page.icon}</div>
        <span class="potato-card-label">${page.label}</span>
      </button>
    `).join('');

    return `
      <div class="potato-group">
        <h3 class="potato-group-label">${group.label}</h3>
        <div class="potato-grid">${cards}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="potato-container">
      ${groupsHtml}
      <div class="potato-group">
        <h3 class="potato-group-label">SETTINGS</h3>
        <div class="potato-grid">
          <button class="potato-card" data-page-id="settings">
            <div class="potato-card-icon potato-card-icon--svg">${settingsIcon}</div>
            <span class="potato-card-label">Settings</span>
          </button>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('.potato-card').forEach((card) => {
    card.addEventListener('click', () => {
      const pageId = (card as HTMLElement).dataset.pageId;
      if (pageId) router.navigate(pageId);
    });
  });
}
