import type { PageDefinition } from '../../shared/types';

/**
 * Minimal client-side router.
 * Manages which page is visible and calls render/cleanup lifecycle hooks.
 */
export class Router {
  private currentPage: PageDefinition | null = null;
  private container: HTMLElement | null = null;
  private pages: PageDefinition[] = [];
  private listeners: ((pageId: string) => void)[] = [];

  /** Bootstrap: render the first page */
  init(pages: PageDefinition[]): void {
    this.container = document.getElementById('content');
    this.pages = pages;

    if (pages.length > 0) {
      this.navigate(pages[0].id);
    }
  }

  /** Switch to a page by id */
  navigate(pageId: string): void {
    if (!this.container) return;
    if (this.currentPage?.id === pageId) return;

    // Cleanup previous page
    this.currentPage?.cleanup?.();

    const page = this.pages.find((p) => p.id === pageId);
    if (!page) return;

    this.currentPage = page;
    this.container.innerHTML = '';
    page.render(this.container);

    this.listeners.forEach((cb) => cb(pageId));
  }

  /** Subscribe to navigation changes */
  onNavigate(callback: (pageId: string) => void): void {
    this.listeners.push(callback);
  }

  /** Get current active page id */
  getCurrentPageId(): string | null {
    return this.currentPage?.id ?? null;
  }
}
