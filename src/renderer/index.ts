import { initHeader } from './core/header';
import { initToolbar } from './core/toolbar';
import { initSidebar } from './core/sidebar';
import { Router } from './core/router';
import { pages, hiddenPages, sidebarGroups } from './pages/registry';
import { homePage, prefetchWorldInfo } from './pages/home';
import { tryShowTutorial } from './core/tutorial';
import { initThemeOnStartup, clearTheme, loadThemeSettings, saveThemeSettings } from './utils/themes';
import { checkAndShowUpdateModal } from './utils/updater';

const router = new Router();

// Ctrl+T emergency theme kill switch
document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 't') {
    e.preventDefault();
    clearTheme();
    const ts = await loadThemeSettings();
    ts.enabled = false;
    await saveThemeSettings(ts);
    window.dispatchEvent(new CustomEvent('glow:theme-killed'));
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  // Apply minimalist mode early so layout doesn't flash
  const savedSettings = await window.glowAPI.storage.get<{ minimalist?: boolean }>('settings');
  if (savedSettings?.minimalist) document.body.classList.add('minimalist');

  // Apply saved theme before UI renders
  await initThemeOnStartup();

  initHeader();
  initToolbar(router);
  await initSidebar(sidebarGroups, pages, router);
  router.init([homePage, ...pages, ...hiddenPages]);

  // Pre-fetch world info at startup so home page loads instantly
  prefetchWorldInfo();

  // Show onboarding tutorial on first launch
  tryShowTutorial(router);

  // Check for updates after app is ready
  checkAndShowUpdateModal();
});
