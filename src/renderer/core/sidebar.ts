import type { PageDefinition } from '../../shared/types';
import type { SidebarGroup } from '../pages/registry';
import type { Router } from './router';

/** IDs that can never be hidden from the sidebar */
const ALWAYS_VISIBLE = new Set(['settings', 'home']);

let _groups: SidebarGroup[] = [];
let _allPages: PageDefinition[] = [];
let _router: Router | null = null;

/**
 * Builds the sidebar from grouped page registry.
 * Renders category headers between groups with visual spacing.
 * Pages with position:'bottom' are pushed to the end with a spacer.
 * Reads hidden pages from storage and skips them.
 */
export async function initSidebar(groups: SidebarGroup[], allPages: PageDefinition[], router: Router): Promise<void> {
  _groups = groups;
  _allPages = allPages;
  _router = router;

  await buildSidebar();

  router.onNavigate(setActive);
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
  const bottomPages = _allPages.filter((p) => p.position === 'bottom' || !groupPageIds.has(p.id));

  // Render groups
  _groups.forEach((group, idx) => {
    const visiblePages = group.pages.filter((p) => !hiddenSet.has(p.id));
    if (visiblePages.length === 0) return; // skip empty groups

    const header = document.createElement('div');
    header.className = 'sidebar-group-header';
    if (idx > 0) header.classList.add('sidebar-group-gap');
    header.textContent = group.label;
    nav.appendChild(header);

    visiblePages.forEach((page) => {
      nav.appendChild(createButton(page, _router!));
    });
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
      nav.appendChild(createButton(page, _router!));
    });
  }

  sidebar.appendChild(nav);

  // Restore active state
  const currentId = _router?.getCurrentPageId();
  if (currentId) setActive(currentId);
}

// ── Helpers ──────────────────────────────────────────────────

function createButton(page: PageDefinition, router: Router): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'sidebar-btn';
  btn.dataset.pageId = page.id;
  btn.innerHTML = `
    <span class="sidebar-btn-icon">${page.icon}</span>
    <span class="sidebar-btn-label">${page.label}</span>
  `;

  btn.addEventListener('click', () => router.navigate(page.id));
  return btn;
}

function setActive(activeId: string): void {
  document.querySelectorAll('.sidebar-btn').forEach((el) => {
    const btn = el as HTMLElement;
    btn.classList.toggle('active', btn.dataset.pageId === activeId);
  });
}
