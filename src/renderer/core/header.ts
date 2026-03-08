/**
 * Header is hidden by default (CSS: display:none).
 * When the toolbar overflows, toolbar.ts adds `.toolbar-split`
 * to #app which makes #header visible via CSS.
 */
export function initHeader(): void {
  const header = document.getElementById('header');
  if (!header) return;

  header.innerHTML = `
    <div class="header-drag"></div>
    <div class="header-wincontrols" id="header-wincontrols"></div>
  `;
}
