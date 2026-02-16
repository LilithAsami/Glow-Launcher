import { initHeader } from './core/header';
import { initToolbar } from './core/toolbar';
import { initSidebar } from './core/sidebar';
import { Router } from './core/router';
import { pages, hiddenPages } from './pages/registry';
import { homePage, prefetchWorldInfo } from './pages/home';

const router = new Router();

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initToolbar(router);
  initSidebar(pages, router);
  router.init([homePage, ...pages, ...hiddenPages]);

  // Pre-fetch world info at startup so home page loads instantly
  prefetchWorldInfo();
});
