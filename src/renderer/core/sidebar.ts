import type { PageDefinition } from '../../shared/types';
import type { SidebarGroup } from '../pages/registry';
import type { Router } from './router';

/**
 * Builds the sidebar from grouped page registry.
 * Renders category headers between groups with visual spacing.
 * Pages with position:'bottom' are pushed to the end with a spacer.
 */
export function initSidebar(groups: SidebarGroup[], allPages: PageDefinition[], router: Router): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const nav = document.createElement('nav');
  nav.className = 'sidebar-nav';

  // Collect bottom pages from allPages (e.g. Settings)
  const groupPageIds = new Set(groups.flatMap((g) => g.pages.map((p) => p.id)));
  const bottomPages = allPages.filter((p) => p.position === 'bottom' || !groupPageIds.has(p.id));

  // Render groups
  groups.forEach((group, idx) => {
    // Group header
    const header = document.createElement('div');
    header.className = 'sidebar-group-header';
    if (idx > 0) header.classList.add('sidebar-group-gap');
    header.textContent = group.label;
    nav.appendChild(header);

    // Pages in this group
    group.pages.forEach((page) => {
      nav.appendChild(createButton(page, router));
    });
  });

  // Spacer + bottom group (Settings etc.)
  if (bottomPages.length > 0) {
    const spacer = document.createElement('div');
    spacer.className = 'sidebar-spacer';
    nav.appendChild(spacer);

    const sep = document.createElement('div');
    sep.className = 'sidebar-separator';
    nav.appendChild(sep);

    bottomPages.forEach((page) => {
      nav.appendChild(createButton(page, router));
    });
  }

  sidebar.appendChild(nav);

  // Default active state — first page of first group
  const firstPage = groups[0]?.pages[0];
  if (firstPage) setActive(firstPage.id);

  router.onNavigate(setActive);
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
