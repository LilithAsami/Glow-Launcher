/**
 * Notification Panel — in-app notification center.
 *
 * Shows as a modal overlay with notification cards (mobile-tray style).
 * Also handles the toolbar bell badge count.
 */

let panelOpen = false;
let notifications: any[] = [];
let unreadCount = 0;
const sessionStart = Date.now();

/** Initialize listeners — call once from toolbar init */
export function initNotifications(): void {
  // Listen for new notifications
  window.glowAPI.notifications.onNew(() => {
    refreshNotifications();
  });

  // Listen for count updates (mark read, clear)
  window.glowAPI.notifications.onUpdated((data) => {
    unreadCount = data.unreadCount;
    updateBadge();
  });

  // Initial load
  refreshNotifications();
}

async function refreshNotifications(): Promise<void> {
  try {
    notifications = await window.glowAPI.notifications.getAll();
    unreadCount = await window.glowAPI.notifications.getUnreadCount();
    updateBadge();
    if (panelOpen) renderPanel();
  } catch { /* */ }
}

function updateBadge(): void {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/** Toggle panel open/close */
export function togglePanel(): void {
  if (panelOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

function openPanel(): void {
  panelOpen = true;
  // Mark all as read when opening
  window.glowAPI.notifications.markAllRead();

  let overlay = document.getElementById('notif-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'notif-overlay';
    overlay.className = 'notif-overlay';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';

  renderPanel();

  // Click outside to close
  overlay.addEventListener('click', onOverlayClick);
}

function onOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).id === 'notif-overlay') {
    closePanel();
  }
}

function closePanel(): void {
  panelOpen = false;
  const overlay = document.getElementById('notif-overlay');
  if (overlay) {
    overlay.removeEventListener('click', onOverlayClick);
    overlay.style.display = 'none';
  }
}

function renderCardHTML(n: any): string {
  return `
    <div class="notif-card notif-card--${n.category}${n.read ? '' : ' notif-card--unread'}">
      <div class="notif-card-icon">${getCategoryIcon(n.category)}</div>
      <div class="notif-card-content">
        <div class="notif-card-title">${escapeHtml(n.title)}</div>
        <div class="notif-card-body">${escapeHtml(n.body)}</div>
        ${renderRewardPills(n.rewards)}
        <div class="notif-card-time">${formatTime(n.timestamp)}</div>
      </div>
    </div>`;
}

function renderSection(title: string, icon: string, items: any[], emptyMsg: string, clearId?: string): string {
  const header = `
    <div class="notif-section-header">
      <span class="notif-section-title">${icon} ${title}</span>
      ${(clearId && items.length > 0) ? `<button class="notif-section-clear" id="${clearId}">Clear</button>` : ''}
    </div>`;
  if (items.length === 0) {
    return `${header}<div class="notif-empty-mini"><span>${emptyMsg}</span></div>`;
  }
  return `${header}${items.map(renderCardHTML).join('')}`;
}

function renderPanel(): void {
  const overlay = document.getElementById('notif-overlay');
  if (!overlay) return;

  // Split into session (this launch) and history (older)
  const sessionNotifs = [...notifications].filter(n => n.timestamp >= sessionStart).reverse();
  const historyNotifs = [...notifications].filter(n => n.timestamp < sessionStart).reverse();

  overlay.innerHTML = `
    <div class="notif-modal">
      <div class="notif-modal-header">
        <h2 class="notif-modal-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          Notifications
        </h2>
        <div class="notif-modal-actions">
          ${notifications.length > 0 ? `<button class="notif-clear-btn" id="notif-clear-all" title="Clear all">Clear all</button>` : ''}
          <button class="notif-close-btn" id="notif-close" title="Close">&times;</button>
        </div>
      </div>
      <div class="notif-modal-body">
        ${notifications.length === 0
          ? `<div class="notif-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)"
                   stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span>No notifications yet</span>
            </div>`
          : `
            ${renderSection('This Session', '-', sessionNotifs, 'No notifications this session', 'notif-clear-session')}
            ${renderSection('History', '-', historyNotifs, 'No previous notifications', 'notif-clear-history')}
          `}
      </div>
    </div>
  `;

  // Bind events
  overlay.querySelector('#notif-close')?.addEventListener('click', () => closePanel());
  overlay.querySelector('#notif-clear-all')?.addEventListener('click', async () => {
    await window.glowAPI.notifications.clearAll();
    notifications = [];
    unreadCount = 0;
    updateBadge();
    renderPanel();
  });
  overlay.querySelector('#notif-clear-session')?.addEventListener('click', async () => {
    // Clear only session notifications
    const sessionIds = notifications.filter(n => n.timestamp >= sessionStart).map(n => n.id);
    for (const id of sessionIds) {
      await window.glowAPI.notifications.delete(id);
    }
    notifications = notifications.filter(n => n.timestamp < sessionStart);
    unreadCount = Math.max(0, unreadCount - sessionIds.length);
    updateBadge();
    renderPanel();
  });
  overlay.querySelector('#notif-clear-history')?.addEventListener('click', async () => {
    // Clear only history notifications
    const historyIds = notifications.filter(n => n.timestamp < sessionStart).map(n => n.id);
    for (const id of historyIds) {
      await window.glowAPI.notifications.delete(id);
    }
    notifications = notifications.filter(n => n.timestamp >= sessionStart);
    updateBadge();
    renderPanel();
  });
}

function getCategoryIcon(cat: string): string {
  switch (cat) {
    case 'autokick':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>`;
    case 'expeditions':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffa94d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`;
    default:
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#74c0fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderRewardPills(rewards: any[] | undefined): string {
  if (!rewards || rewards.length === 0) return '';

  // Only show items that have an icon
  const withIcons = rewards.filter((r: any) => r.icon);
  if (withIcons.length === 0) return '';

  const MAX_PILLS = 10;
  const pills = withIcons
    .slice(0, MAX_PILLS)
    .map((r: any) => {
      const qty = r.quantity > 1 ? `<span class="notif-pill-qty">x${r.quantity}</span>` : '';
      const title = `${escapeHtml(r.name)}${r.quantity > 1 ? ' x' + r.quantity : ''}`;
      return `<span class="notif-pill" title="${title}"><img src="${r.icon}" alt="" class="notif-pill-icon" onerror="this.style.display='none'">${qty}</span>`;
    })
    .join('');

  const more = withIcons.length > MAX_PILLS
    ? `<span class="notif-pill notif-pill-more">+${withIcons.length - MAX_PILLS}</span>`
    : '';

  return `<div class="notif-reward-pills">${pills}${more}</div>`;
}
