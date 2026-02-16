import type { PageDefinition } from '../../shared/types';
import type { Router } from './router';

/**
 * Builds the sidebar from the page registry.
 * Pages with position:'bottom' are pushed to the end with a spacer.
 */
export function initSidebar(pages: PageDefinition[], router: Router): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const nav = document.createElement('nav');
  nav.className = 'sidebar-nav';

  const sorted = [...pages].sort((a, b) => a.order - b.order);
  const topPages = sorted.filter((p) => p.position !== 'bottom');
  const bottomPages = sorted.filter((p) => p.position === 'bottom');

  // Top group
  topPages.forEach((page) => {
    nav.appendChild(createButton(page, router));
  });

  // Spacer + bottom group
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

  // Default active state
  if (sorted.length > 0) {
    setActive(sorted[0].id);
  }

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
