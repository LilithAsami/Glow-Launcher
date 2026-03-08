import type { PageDefinition } from '../../shared/types';
import type { SidebarGroup } from '../pages/registry';
import type { Router } from './router';

/** IDs that can never be hidden from the sidebar */
const ALWAYS_VISIBLE = new Set(['home']);

/** IDs that should never appear in the sidebar (accessed via toolbar only) */
const TOOLBAR_ONLY = new Set(['settings']);

let _groups: SidebarGroup[] = [];
let _allPages: PageDefinition[] = [];
let _router: Router | null = null;

/** Collapsed group labels (persisted) */
let collapsedGroups = new Set<string>();

/** Currently visible context menu element */
let activeCtxMenu: HTMLElement | null = null;

/**
 * Builds the sidebar from grouped page registry.
 */
export async function initSidebar(groups: SidebarGroup[], allPages: PageDefinition[], router: Router): Promise<void> {
  _groups = groups;
  _allPages = allPages;
  _router = router;

  // Load collapsed state
  const stored = await window.glowAPI.storage.get<{ collapsedSidebarGroups?: string[] }>('settings');
  collapsedGroups = new Set(stored?.collapsedSidebarGroups ?? []);

  await buildSidebar();
  router.onNavigate(setActive);

  // Dismiss context menu on click anywhere
  document.addEventListener('click', dismissCtxMenu);
  document.addEventListener('contextmenu', (e) => {
    // Only dismiss if not clicking on a sidebar button
    if (!(e.target as HTMLElement)?.closest('.sidebar-btn')) dismissCtxMenu();
  });
}

/** Rebuild the sidebar (call from settings when toggles change) */
export async function rebuildSidebar(): Promise<void> {
  await buildSidebar();
}

async function buildSidebar(): Promise<void> {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Load hidden pages from settings
  const settings = await window.glowAPI.storage.get<{ hiddenPages?: string[] }>('settings');
  const hiddenSet = new Set((settings?.hiddenPages ?? []).filter((id: string) => !ALWAYS_VISIBLE.has(id)));

  // Remove old nav
  const oldNav = sidebar.querySelector('.sidebar-nav');
  if (oldNav) oldNav.remove();

  const nav = document.createElement('nav');
  nav.className = 'sidebar-nav';

  const groupPageIds = new Set(_groups.flatMap((g) => g.pages.map((p) => p.id)));
  const bottomPages = _allPages.filter((p) => !TOOLBAR_ONLY.has(p.id) && (p.position === 'bottom' || !groupPageIds.has(p.id)));

  // Render groups
  _groups.forEach((group) => {
    const allGroupPages = group.pages;
    const visiblePages = allGroupPages.filter((p) => !hiddenSet.has(p.id));
    if (visiblePages.length === 0) return;

    const isCollapsed = collapsedGroups.has(group.label);

    // Group container
    const groupEl = document.createElement('div');
    groupEl.className = 'sidebar-group';

    // Header (clickable to collapse/expand)
    const header = document.createElement('button');
    header.className = 'sidebar-group-header';
    header.innerHTML = `
      <span class="sidebar-group-label">${group.label}</span>
      <svg class="sidebar-group-chevron${isCollapsed ? ' sidebar-group-chevron--collapsed' : ''}" width="10" height="10" viewBox="0 0 10 10">
        <path d="M2.5 3.5L5 6.5L7.5 3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    header.addEventListener('click', () => toggleGroup(group.label));

    groupEl.appendChild(header);

    // Pages container (collapsible)
    const pagesWrap = document.createElement('div');
    pagesWrap.className = 'sidebar-group-pages';
    if (isCollapsed) pagesWrap.classList.add('sidebar-group-pages--collapsed');

    visiblePages.forEach((page) => {
      pagesWrap.appendChild(createButton(page, _router!, hiddenSet));
    });

    groupEl.appendChild(pagesWrap);
    nav.appendChild(groupEl);
  });

  // Spacer + bottom group (Settings etc.)
  const visibleBottom = bottomPages.filter((p) => !hiddenSet.has(p.id));
  if (visibleBottom.length > 0) {
    const spacer = document.createElement('div');
    spacer.className = 'sidebar-spacer';
    nav.appendChild(spacer);

    const sep = document.createElement('div');
    sep.className = 'sidebar-separator';
    nav.appendChild(sep);

    visibleBottom.forEach((page) => {
      nav.appendChild(createButton(page, _router!, hiddenSet));
    });
  }

  sidebar.appendChild(nav);

  // Restore active state
  const currentId = _router?.getCurrentPageId();
  if (currentId) setActive(currentId);
}

// ── Group collapse ───────────────────────────────────────────

async function toggleGroup(label: string): Promise<void> {
  if (collapsedGroups.has(label)) {
    collapsedGroups.delete(label);
  } else {
    collapsedGroups.add(label);
  }
  // Persist
  const s = (await window.glowAPI.storage.get<Record<string, unknown>>('settings')) ?? {};
  s.collapsedSidebarGroups = [...collapsedGroups];
  await window.glowAPI.storage.set('settings', s);

  await buildSidebar();
}

// ── Context menu ─────────────────────────────────────────────

function dismissCtxMenu(): void {
  if (activeCtxMenu) {
    activeCtxMenu.remove();
    activeCtxMenu = null;
  }
}

function showCtxMenu(page: PageDefinition, x: number, y: number, isHidden: boolean): void {
  dismissCtxMenu();

  const menu = document.createElement('div');
  menu.className = 'sidebar-ctx-menu';

  // Position
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const canHide = !ALWAYS_VISIBLE.has(page.id);

  menu.innerHTML = `
    <div class="sidebar-ctx-header">${page.label}</div>
    ${canHide ? `
      <button class="sidebar-ctx-item" data-action="toggle-visibility">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${isHidden
            ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
            : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
          }
        </svg>
        <span>${isHidden ? 'Show in sidebar' : 'Hide from sidebar'}</span>
      </button>
    ` : `
      <div class="sidebar-ctx-item sidebar-ctx-item--disabled">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>Always visible</span>
      </div>
    `}
  `;

  document.body.appendChild(menu);
  activeCtxMenu = menu;

  // Keep within viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  });

  // Bind actions
  menu.querySelector('[data-action="toggle-visibility"]')?.addEventListener('click', async () => {
    dismissCtxMenu();
    const s = (await window.glowAPI.storage.get<{ hiddenPages?: string[] }>('settings')) ?? {};
    const hidden = new Set(s.hiddenPages ?? []);
    if (isHidden) {
      hidden.delete(page.id);
    } else {
      hidden.add(page.id);
    }
    (s as any).hiddenPages = [...hidden];
    await window.glowAPI.storage.set('settings', s);
    await buildSidebar();
  });
}

// ── Helpers ──────────────────────────────────────────────────

function createButton(page: PageDefinition, router: Router, hiddenSet: Set<string>): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'sidebar-btn';
  btn.dataset.pageId = page.id;
  btn.title = page.label;
  btn.innerHTML = `
    <span class="sidebar-btn-icon">${page.icon}</span>
    <span class="sidebar-btn-label">${page.label}</span>
  `;

  btn.addEventListener('click', () => router.navigate(page.id));

  // Right-click context menu
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showCtxMenu(page, e.clientX, e.clientY, hiddenSet.has(page.id));
  });

  return btn;
}

function setActive(activeId: string): void {
  document.querySelectorAll('.sidebar-btn').forEach((el) => {
    const btn = el as HTMLElement;
    btn.classList.toggle('active', btn.dataset.pageId === activeId);
  });
}
