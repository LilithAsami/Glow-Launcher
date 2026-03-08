import { initHeader } from './core/header';
import { initToolbar } from './core/toolbar';
import { initSidebar } from './core/sidebar';
import { Router } from './core/router';
import { pages, hiddenPages, sidebarGroups } from './pages/registry';
import { homePage, prefetchWorldInfo } from './pages/home';
import { tryShowTutorial } from './core/tutorial';

const router = new Router();

document.addEventListener('DOMContentLoaded', async () => {
  // Apply minimalist mode early so layout doesn't flash
  const savedSettings = await window.glowAPI.storage.get<{ minimalist?: boolean }>('settings');
  if (savedSettings?.minimalist) document.body.classList.add('minimalist');

  initHeader();
  initToolbar(router);
  await initSidebar(sidebarGroups, pages, router);
  router.init([homePage, ...pages, ...hiddenPages]);

  // Pre-fetch world info at startup so home page loads instantly
  prefetchWorldInfo();

  // Show onboarding tutorial on first launch
  tryShowTutorial(router);
});
