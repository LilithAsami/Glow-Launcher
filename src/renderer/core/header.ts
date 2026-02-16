/**
 * Renders the thin top title-bar with drag area and window controls.
 */
export function initHeader(): void {
  const header = document.getElementById('header');
  if (!header) return;

  header.innerHTML = `
    <div class="header-drag"></div>

    <div class="header-controls">
      <button class="header-btn" id="btn-minimize" title="Minimize">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="1" y="5.5" width="10" height="1" fill="currentColor"/>
        </svg>
      </button>
      <button class="header-btn" id="btn-maximize" title="Maximize">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="1.5" y="1.5" width="9" height="9" rx="0.5"
                fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
      <button class="header-btn header-btn-close" id="btn-close" title="Close">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor"
                stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;

  document.getElementById('btn-minimize')?.addEventListener('click', () => {
    window.glowAPI.window.minimize();
  });

  document.getElementById('btn-maximize')?.addEventListener('click', () => {
    window.glowAPI.window.maximize();
  });

  document.getElementById('btn-close')?.addEventListener('click', () => {
    window.glowAPI.window.close();
  });
}
