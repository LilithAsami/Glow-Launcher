/**
 * Update Modal — shown on startup when a newer GitHub release exists.
 * Displays release notes, version info, and download button.
 */

function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** Convert basic markdown to HTML (headers, bold, bullets, links) */
function markdownToHtml(md: string): string {
  return md
    .split('\n')
    .map((rawLine) => {
      // Strip HTML tags (GitHub may embed <img>, <a>, etc.)
      const line = rawLine.replace(/<[^>]+>/g, '').trim();
      // Headers
      if (line.startsWith('### ')) return `<h4 class="upd-md-h4">${escHtml(line.slice(4))}</h4>`;
      if (line.startsWith('## ')) return `<h3 class="upd-md-h3">${escHtml(line.slice(3))}</h3>`;
      if (line.startsWith('# ')) return `<h2 class="upd-md-h2">${escHtml(line.slice(2))}</h2>`;
      // Bullet points
      if (/^[-*]\s/.test(line)) {
        let content = escHtml(line.slice(2));
        // Bold
        content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        return `<div class="upd-md-bullet"><span class="upd-md-dot">•</span><span>${content}</span></div>`;
      }
      // Empty line
      if (!line) return '<div class="upd-md-spacer"></div>';
      // Regular text with bold
      let text = escHtml(line);
      text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return `<p class="upd-md-p">${text}</p>`;
    })
    .join('');
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

interface ReleaseData {
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt: string;
  exeDownloadUrl: string | null;
  exeFileName: string | null;
  exeSize: number;
}

export async function checkAndShowUpdateModal(): Promise<void> {
  try {
    const result = await window.glowAPI.updater.check();
    if (!result.hasUpdate || !result.release) return;
    showUpdateModal(result.currentVersion, result.release);
  } catch (err) {
    console.error('[Updater] Check failed:', err);
  }
}

function showUpdateModal(currentVersion: string, release: ReleaseData): void {
  // Remove existing
  document.getElementById('update-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'update-overlay';
  overlay.className = 'notif-overlay';
  overlay.style.display = 'flex';

  const sizeText = release.exeSize ? ` (${formatSize(release.exeSize)})` : '';
  const releaseDateStr = release.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  overlay.innerHTML = `
    <div class="notif-modal upd-modal">
      <div class="notif-modal-header upd-header">
        <h2 class="notif-modal-title upd-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #00d4ff)" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          NEW UPDATE ${escHtml(release.tagName)}
        </h2>
        <button class="notif-close-btn" id="upd-close">&times;</button>
      </div>

      <div class="notif-modal-body upd-body">
        <div class="upd-version-bar">
          <div class="upd-version-badge">
            <span class="upd-version-old">v${escHtml(currentVersion)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6e6e88" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            <span class="upd-version-new">${escHtml(release.tagName)}</span>
          </div>
          ${releaseDateStr ? `<span class="upd-date">${releaseDateStr}</span>` : ''}
        </div>

        <div class="upd-notes">
          ${markdownToHtml(release.body)}
        </div>
      </div>

      <div class="upd-footer">
        <div class="upd-links">
          <button class="upd-link-btn" id="upd-open-repo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
            Repository
          </button>
          <button class="upd-link-btn" id="upd-open-releases">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
            Releases
          </button>
        </div>
        <div class="upd-action-btns">
          <button class="upd-dismiss-btn" id="upd-dismiss">Later</button>
          ${release.exeDownloadUrl ? `
          <button class="upd-download-btn" id="upd-download">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Update${sizeText}
          </button>
          ` : `
          <button class="upd-download-btn" id="upd-open-release-page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            View Release
          </button>
          `}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close
  overlay.querySelector('#upd-close')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#upd-dismiss')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'update-overlay') overlay.remove();
  });

  // Links
  overlay.querySelector('#upd-open-repo')?.addEventListener('click', () => {
    window.glowAPI.updater.openRepo();
  });
  overlay.querySelector('#upd-open-releases')?.addEventListener('click', () => {
    window.glowAPI.updater.openReleases();
  });

  // Release page button (when no .exe available)
  overlay.querySelector('#upd-open-release-page')?.addEventListener('click', () => {
    window.glowAPI.shell.openExternal(release.htmlUrl);
    overlay.remove();
  });

  // Download and install
  overlay.querySelector('#upd-download')?.addEventListener('click', async () => {
    if (!release.exeDownloadUrl || !release.exeFileName) return;

    const btn = overlay.querySelector('#upd-download') as HTMLButtonElement;
    const footer = overlay.querySelector('.upd-footer') as HTMLElement;

    // Replace button with progress bar
    btn.replaceWith((() => {
      const wrap = document.createElement('div');
      wrap.id = 'upd-progress-wrap';
      wrap.innerHTML = `
        <div class="upd-progress-label">
          <span id="upd-progress-phase">Downloading…</span>
          <span id="upd-progress-pct">0%</span>
        </div>
        <div class="upd-progress-track">
          <div class="upd-progress-bar" id="upd-progress-bar" style="width:0%"></div>
        </div>`;
      return wrap;
    })());

    // Disable dismiss/close while downloading
    (overlay.querySelector('#upd-close') as HTMLButtonElement).disabled = true;
    (overlay.querySelector('#upd-dismiss') as HTMLButtonElement).disabled = true;

    const setProgress = (phase: string, percent: number) => {
      const bar = overlay.querySelector('#upd-progress-bar') as HTMLElement | null;
      const pct = overlay.querySelector('#upd-progress-pct') as HTMLElement | null;
      const lbl = overlay.querySelector('#upd-progress-phase') as HTMLElement | null;
      if (bar) bar.style.width = `${percent}%`;
      if (pct) pct.textContent = `${percent}%`;
      if (lbl) {
        if (phase === 'downloading') lbl.textContent = 'Downloading…';
        else if (phase === 'launching') lbl.textContent = 'Launching installer…';
        else if (phase === 'done') lbl.textContent = 'Done!';
        else if (phase === 'error') lbl.textContent = 'Error';
      }
    };

    // Subscribe to progress events before triggering the download
    window.glowAPI.updater.onProgress(({ phase, percent }) => {
      setProgress(phase, percent);
      if (phase === 'done') {
        // App will exit(0) from backend; remove overlay after brief pause so user sees Done
        setTimeout(() => overlay.remove(), 1200);
      }
    });

    const result = await window.glowAPI.updater.downloadAndInstall(
      release.exeDownloadUrl,
      release.exeFileName,
    );

    // Always re-enable close/dismiss once the IPC call resolves (success or error)
    (overlay.querySelector('#upd-close') as HTMLButtonElement).disabled = false;
    (overlay.querySelector('#upd-dismiss') as HTMLButtonElement).disabled = false;

    if (!result.success) {
      // Replace progress bar with retry button
      overlay.querySelector('#upd-progress-wrap')?.replaceWith((() => {
        const b = document.createElement('button');
        b.className = 'upd-download-btn';
        b.id = 'upd-download';
        b.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Retry`;
        return b;
      })());

      // Error notice
      overlay.querySelector('.upd-error-notice')?.remove();
      const notice = document.createElement('div');
      notice.className = 'upd-error-notice';
      const fileName = result.downloadPath
        ? result.downloadPath.split(/[\\/]/).pop()
        : release.exeFileName;
      notice.textContent = result.downloadPath
        ? `Downloaded to Downloads as "${fileName}" — run it manually as Administrator to install.`
        : 'Could not open the installer. Download it manually from the Releases page.';
      footer.appendChild(notice);
    }
    // On success: overlay is removed by the onProgress 'done' handler above,
    // and the app will exit(0) from the backend after 600ms.
  });
}
