import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────────
let loading = false;
let data: any = null;
let error: string | null = null;
/** Track which groups are collapsed (by group id) */
const collapsed = new Set<string>();

// ─── Helpers ──────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusClass(status: string): string {
  switch (status) {
    case 'operational': return 'es-status--operational';
    case 'degraded_performance': return 'es-status--degraded';
    case 'partial_outage': return 'es-status--partial';
    case 'major_outage': return 'es-status--major';
    case 'under_maintenance': return 'es-status--maintenance';
    default: return 'es-status--operational';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'operational': return 'Operational';
    case 'degraded_performance': return 'Degraded';
    case 'partial_outage': return 'Partial Outage';
    case 'major_outage': return 'Major Outage';
    case 'under_maintenance': return 'Maintenance';
    default: return status;
  }
}

function indicatorClass(indicator: string): string {
  switch (indicator) {
    case 'none': return 'es-indicator--none';
    case 'minor': return 'es-indicator--minor';
    case 'major': return 'es-indicator--major';
    case 'critical': return 'es-indicator--critical';
    default: return 'es-indicator--none';
  }
}

function impactClass(impact: string): string {
  switch (impact) {
    case 'none': return 'es-impact--none';
    case 'minor': return 'es-impact--minor';
    case 'major': return 'es-impact--major';
    case 'critical': return 'es-impact--critical';
    default: return 'es-impact--none';
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Worst status across children */
function worstStatus(children: any[]): string {
  const priority = ['major_outage', 'partial_outage', 'under_maintenance', 'degraded_performance', 'operational'];
  for (const p of priority) {
    if (children.some((c: any) => c.status === p)) return p;
  }
  return 'operational';
}

// ─── Draw ─────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="epicstatus-page">
      <div class="epicstatus-header">
        <h1 class="page-title">Epic Status</h1>
        <p class="page-subtitle">Real-time Epic Games and Fortnite service status</p>
      </div>

      ${loading ? `
        <div class="epicstatus-loading">
          <div class="epicstatus-spinner"></div>
          <span>Fetching server status...</span>
        </div>
      ` : error ? `
        <div class="epicstatus-error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>${esc(error)}</span>
        </div>
        <button class="epicstatus-btn epicstatus-btn--primary" id="es-refresh">Retry</button>
      ` : data ? renderData() : `
        <div class="epicstatus-loading">
          <div class="epicstatus-spinner"></div>
          <span>Fetching server status...</span>
        </div>
      `}
    </div>
  `;

  bindEvents();
}

function renderData(): string {
  if (!data) return '';

  const ls = data.lightswitch;
  const fortniteStatus = ls ? (ls.status === 'UP' ? 'Online' : ls.status) : 'Unknown';
  const fortniteStatusClass = ls ? (ls.status === 'UP' ? 'es-fortnite--online' : 'es-fortnite--offline') : 'es-fortnite--unknown';

  const groups: any[] = data.groups || [];
  const standalone: any[] = data.standalone || [];
  const rm = data.roadmap || { operational: 0, degraded: 0, partialOutage: 0, majorOutage: 0, maintenance: 0, total: 0 };

  return `
    <!-- Overall status banner -->
    <div class="epicstatus-banner ${indicatorClass(data.overallIndicator)}">
      <div class="epicstatus-banner-dot"></div>
      <span class="epicstatus-banner-text">${esc(data.overallStatus)}</span>
      <button class="epicstatus-btn epicstatus-btn--ghost" id="es-refresh" title="Refresh">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
      </button>
    </div>

    <!-- Fortnite lightswitch -->
    <div class="epicstatus-section">
      <h2 class="epicstatus-section-title">Fortnite Server</h2>
      <div class="epicstatus-fortnite-card ${fortniteStatusClass}">
        <div class="epicstatus-fortnite-status">
          <div class="epicstatus-fortnite-dot"></div>
          <span class="epicstatus-fortnite-label">${esc(fortniteStatus)}</span>
        </div>
        ${ls?.message ? `<p class="epicstatus-fortnite-msg">${esc(ls.message)}</p>` : ''}
        ${ls?.banned ? `<div class="epicstatus-fortnite-banned">Account is banned</div>` : ''}
        ${data.lightswitchError ? `<p class="epicstatus-fortnite-error">${esc(data.lightswitchError)}</p>` : ''}
      </div>
    </div>

    <!-- Roadmap summary -->
    <div class="epicstatus-section">
      <h2 class="epicstatus-section-title">Roadmap</h2>
      <div class="epicstatus-roadmap">
        <div class="epicstatus-roadmap-item es-status--operational">
          <span class="epicstatus-roadmap-count">${rm.operational}</span>
          <span class="epicstatus-roadmap-label">Operational</span>
        </div>
        <div class="epicstatus-roadmap-item es-status--degraded">
          <span class="epicstatus-roadmap-count">${rm.degraded}</span>
          <span class="epicstatus-roadmap-label">Degraded</span>
        </div>
        <div class="epicstatus-roadmap-item es-status--partial">
          <span class="epicstatus-roadmap-count">${rm.partialOutage}</span>
          <span class="epicstatus-roadmap-label">Partial Outage</span>
        </div>
        <div class="epicstatus-roadmap-item es-status--major">
          <span class="epicstatus-roadmap-count">${rm.majorOutage}</span>
          <span class="epicstatus-roadmap-label">Major Outage</span>
        </div>
        <div class="epicstatus-roadmap-item es-status--maintenance">
          <span class="epicstatus-roadmap-count">${rm.maintenance}</span>
          <span class="epicstatus-roadmap-label">Maintenance</span>
        </div>
      </div>
    </div>

    <!-- Grouped components -->
    ${groups.length > 0 ? `
      <div class="epicstatus-section">
        <h2 class="epicstatus-section-title">Services</h2>
        <div class="epicstatus-groups">
          ${groups.map((g: any) => {
            const isOpen = !collapsed.has(g.id);
            const worst = worstStatus(g.children);
            return `
              <div class="epicstatus-group ${isOpen ? 'epicstatus-group--open' : ''}">
                <div class="epicstatus-group-header" data-group-id="${g.id}">
                  <div class="epicstatus-group-left">
                    <svg class="epicstatus-group-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                    <div class="epicstatus-component-dot ${statusClass(worst)}"></div>
                    <span class="epicstatus-group-name">${esc(g.name)}</span>
                    <span class="epicstatus-group-count">${g.children.length}</span>
                  </div>
                  <span class="epicstatus-component-badge ${statusClass(worst)}">${statusLabel(worst)}</span>
                </div>
                ${isOpen && g.children.length > 0 ? `
                  <div class="epicstatus-group-children">
                    ${g.children.map((c: any) => `
                      <div class="epicstatus-component epicstatus-component--child">
                        <div class="epicstatus-component-dot ${statusClass(c.status)}"></div>
                        <span class="epicstatus-component-name">${esc(c.name)}</span>
                        <span class="epicstatus-component-badge ${statusClass(c.status)}">${statusLabel(c.status)}</span>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Standalone components -->
    ${standalone.length > 0 ? `
      <div class="epicstatus-section">
        <h2 class="epicstatus-section-title">Other Services</h2>
        <div class="epicstatus-components">
          ${standalone.map((c: any) => `
            <div class="epicstatus-component">
              <div class="epicstatus-component-dot ${statusClass(c.status)}"></div>
              <span class="epicstatus-component-name">${esc(c.name)}</span>
              <span class="epicstatus-component-badge ${statusClass(c.status)}">${statusLabel(c.status)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Active Incidents -->
    ${data.incidents && data.incidents.length > 0 ? `
      <div class="epicstatus-section">
        <h2 class="epicstatus-section-title">Active Incidents</h2>
        <div class="epicstatus-incidents">
          ${data.incidents.map((inc: any) => `
            <div class="epicstatus-incident ${impactClass(inc.impact)}">
              <div class="epicstatus-incident-header">
                <span class="epicstatus-incident-name">${esc(inc.name)}</span>
                <span class="epicstatus-incident-status">${esc(inc.status)}</span>
              </div>
              <span class="epicstatus-incident-time">${timeAgo(inc.updatedAt)}</span>
              ${inc.updates && inc.updates.length > 0 ? `
                <div class="epicstatus-incident-updates">
                  ${inc.updates.slice(0, 3).map((u: any) => `
                    <div class="epicstatus-incident-update">
                      <span class="epicstatus-incident-update-status">${esc(u.status)}</span>
                      <span class="epicstatus-incident-update-body">${esc(u.body)}</span>
                      <span class="epicstatus-incident-update-time">${timeAgo(u.createdAt)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : `
      <div class="epicstatus-section">
        <div class="epicstatus-no-incidents">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span>No active incidents</span>
        </div>
      </div>
    `}
  `;
}

// ─── Events ───────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  const refreshBtn = el.querySelector('#es-refresh') as HTMLButtonElement | null;
  refreshBtn?.addEventListener('click', () => fetchStatus());

  // Group collapse/expand
  el.querySelectorAll('.epicstatus-group-header').forEach((header) => {
    header.addEventListener('click', () => {
      const id = (header as HTMLElement).dataset.groupId;
      if (!id) return;
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      draw();
    });
  });
}

// ─── Actions ──────────────────────────────────────────────────

async function fetchStatus(): Promise<void> {
  if (loading) return;
  loading = true;
  error = null;
  draw();

  try {
    const result = await window.glowAPI.epicStatus.getAll();
    if (result.success) {
      data = result;
      error = null;
    } else {
      error = result.error || 'Failed to fetch status';
    }
  } catch (err: any) {
    error = err.message || 'Unexpected error';
  } finally {
    loading = false;
    draw();
  }
}

// ─── Page Definition ──────────────────────────────────────────

export const epicStatusPage: PageDefinition = {
  id: 'epicstatus',
  label: 'Epic Status',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  order: 21,
  render(container) {
    el = container;
    draw();
    if (!data && !loading) fetchStatus();
  },
  cleanup() {
    el = null;
  },
};
