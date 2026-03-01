import type {
  PageDefinition,
  AutoResponderRule,
  TrafficEntry,
} from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────────

let globalEnabled = false;
let rules: AutoResponderRule[] = [];
let interceptedCount = 0;
let proxyPort = 0;
let proxyRunning = false;
let certMessage = '';

// Rule editor
let editingRule: Partial<AutoResponderRule> | null = null;
let editingId: string | null = null;
let ruleError: string | null = null;
let responseMode: 'inline' | 'file' = 'inline';

// Traffic
let traffic: TrafficEntry[] = [];
let selectedTrafficId: number | null = null;

// View
let viewMode: 'rules' | 'traffic' = 'rules';

const MAX_TRAFFIC = 500;

// ─── Render ───────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="page-autoresponder">
      <div class="ar-header">
        <div class="ar-header-text">
          <h1 class="page-title">AutoResponder</h1>
          <p class="page-subtitle">MITM Proxy — intercepts HTTP/HTTPS traffic from all applications</p>
        </div>
        <div class="ar-header-actions">
          <div class="ar-counter">
            <span class="ar-counter-value">${interceptedCount}</span>
            <span class="ar-counter-label">intercepted</span>
          </div>
          <label class="ar-master-toggle" title="${globalEnabled ? 'Stop' : 'Start'} Proxy">
            <input type="checkbox" class="ar-master-input" id="ar-master-toggle" ${globalEnabled ? 'checked' : ''}>
            <span class="ar-master-slider"></span>
            <span class="ar-master-label">${globalEnabled ? 'ON' : 'OFF'}</span>
          </label>
        </div>
      </div>

      ${renderProxyStatusBar()}

      <!-- Tab bar -->
      <div class="ar-tabs">
        <button class="ar-tab ${viewMode === 'rules' ? 'ar-tab--active' : ''}" data-tab="rules">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Rules <span class="ar-tab-count">${rules.length}</span>
        </button>
        <button class="ar-tab ${viewMode === 'traffic' ? 'ar-tab--active' : ''}" data-tab="traffic">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Traffic <span class="ar-tab-count">${traffic.length}</span>
        </button>
      </div>

      ${viewMode === 'rules' ? renderRulesView() : renderTrafficView()}

      ${editingRule ? renderEditor() : ''}
    </div>`;

  bindEvents();
}

// ─── Proxy Status Bar ─────────────────────────────────────────

function renderProxyStatusBar(): string {
  if (!proxyRunning && !globalEnabled) {
    return `<div class="ar-proxy-bar ar-proxy-bar--off">
      <span class="ar-proxy-dot"></span>
      <span>Proxy stopped — toggle ON to start capturing traffic</span>
    </div>`;
  }

  if (globalEnabled && !proxyRunning) {
    return `<div class="ar-proxy-bar ar-proxy-bar--error">
      <span class="ar-proxy-dot"></span>
      <span>Proxy failed to start</span>
    </div>`;
  }

  const certBtn = `<button class="ar-cert-btn" id="ar-install-cert">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    Install CA Certificate
  </button>`;
  const msg = certMessage ? `<span class="ar-cert-msg">${esc(certMessage)}</span>` : '';

  return `<div class="ar-proxy-bar ar-proxy-bar--on">
    <span class="ar-proxy-dot"></span>
    <span>Proxy running on <strong>127.0.0.1:${proxyPort}</strong></span>
    ${certBtn}
    ${msg}
  </div>`;
}

// ─── Rules View ───────────────────────────────────────────────

function renderRulesView(): string {
  const addBtn = `
    <button class="ar-add-btn" id="ar-add-rule">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Rule
    </button>`;

  if (rules.length === 0) {
    return `
      <div class="ar-empty">
        <div class="ar-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <p class="ar-empty-text">No rules configured</p>
        <p class="ar-empty-sub">Add a rule to start intercepting requests.</p>
        ${addBtn}
      </div>`;
  }

  const rows = rules.map((r) => {
    const sourceTag = r.responseFile
      ? `<span class="ar-rule-file-tag" title="${esc(r.responseFile)}">FILE</span>`
      : '';
    return `
    <div class="ar-rule ${r.enabled ? '' : 'ar-rule--disabled'}" data-id="${r.id}">
      <div class="ar-rule-left">
        <label class="ar-rule-toggle">
          <input type="checkbox" class="ar-rule-toggle-input" data-id="${r.id}" ${r.enabled ? 'checked' : ''}>
          <span class="ar-rule-toggle-slider"></span>
        </label>
        <div class="ar-rule-info">
          <div class="ar-rule-label">${esc(r.label || r.pattern)} ${sourceTag}</div>
          <div class="ar-rule-meta">
            <span class="ar-rule-match-badge ar-match-${r.match}">${r.match}</span>
            <span class="ar-rule-pattern" title="${esc(r.pattern)}">${esc(truncate(r.pattern, 55))}</span>
            <span class="ar-rule-status-code">${r.statusCode}</span>
          </div>
        </div>
      </div>
      <div class="ar-rule-actions">
        <button class="ar-rule-btn ar-rule-edit" data-id="${r.id}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="ar-rule-btn ar-rule-delete" data-id="${r.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="ar-rules-header">${addBtn}</div>
    <div class="ar-rules-list">${rows}</div>`;
}

// ─── Traffic View ─────────────────────────────────────────────

function renderTrafficView(): string {
  const clearBtn = traffic.length > 0 ? `
    <button class="ar-clear-traffic-btn" id="ar-clear-traffic">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      Clear
    </button>` : '';

  if (traffic.length === 0) {
    return `
      <div class="ar-empty">
        <div class="ar-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <p class="ar-empty-text">No traffic captured</p>
        <p class="ar-empty-sub">HTTP requests will appear here in real time.</p>
      </div>`;
  }

  const tableRows = traffic.slice().reverse().map((t) => {
    const isSelected = t.id === selectedTrafficId;
    const statusClass = t.error ? 'ar-status-error'
      : t.intercepted ? 'ar-status-intercept'
      : (t.statusCode >= 400) ? 'ar-status-error'
      : (t.statusCode >= 300) ? 'ar-status-redirect'
      : 'ar-status-ok';
    const interceptBadge = t.intercepted
      ? '<span class="ar-traffic-badge">INTERCEPTED</span>'
      : '';

    return `
      <tr class="ar-traffic-row ${isSelected ? 'ar-traffic-row--selected' : ''} ${t.intercepted ? 'ar-traffic-row--intercepted' : ''}" data-id="${t.id}">
        <td class="ar-traffic-cell ar-traffic-id">${t.id}</td>
        <td class="ar-traffic-cell ar-traffic-status ${statusClass}">${t.error ? 'ERR' : (t.statusCode || '—')}</td>
        <td class="ar-traffic-cell ar-traffic-method">${t.method}</td>
        <td class="ar-traffic-cell ar-traffic-proto">${t.protocol}</td>
        <td class="ar-traffic-cell ar-traffic-host">${esc(t.host)}</td>
        <td class="ar-traffic-cell ar-traffic-url" title="${esc(t.url)}">${esc(extractPath(t.url))} ${interceptBadge}</td>
      </tr>`;
  }).join('');

  const detail = selectedTrafficId ? renderTrafficDetail() : '';

  return `
    <div class="ar-traffic-toolbar">
      <span class="ar-traffic-count">${traffic.length} requests</span>
      ${clearBtn}
    </div>
    <div class="ar-traffic-table-wrap">
      <table class="ar-traffic-table">
        <thead>
          <tr>
            <th class="ar-th ar-th-id">#</th>
            <th class="ar-th ar-th-status">Result</th>
            <th class="ar-th ar-th-method">Method</th>
            <th class="ar-th ar-th-proto">Protocol</th>
            <th class="ar-th ar-th-host">Host</th>
            <th class="ar-th ar-th-url">URL</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    ${detail}`;
}

// ─── Traffic Detail Panel ─────────────────────────────────────

function renderTrafficDetail(): string {
  const entry = traffic.find((t) => t.id === selectedTrafficId);
  if (!entry) return '';

  // Request headers
  const reqHeaders = Object.entries(entry.requestHeaders || {})
    .map(([k, v]) => `<div class="ar-detail-hdr"><span class="ar-detail-hdr-key">${esc(k)}:</span> <span class="ar-detail-hdr-val">${esc(String(v))}</span></div>`)
    .join('') || '<span class="ar-detail-none">No headers captured</span>';

  // Response headers
  const resHeaders = Object.entries(entry.responseHeaders || {})
    .map(([k, v]) => {
      const val = Array.isArray(v) ? v.join(', ') : String(v);
      return `<div class="ar-detail-hdr"><span class="ar-detail-hdr-key">${esc(k)}:</span> <span class="ar-detail-hdr-val">${esc(val)}</span></div>`;
    })
    .join('') || '<span class="ar-detail-none">No headers captured</span>';

  // Response body (only for intercepted)
  const bodySection = entry.responseBody
    ? `<div class="ar-detail-section">
        <div class="ar-detail-section-title">Response Body</div>
        <pre class="ar-detail-body">${esc(truncate(entry.responseBody, 5000))}</pre>
      </div>`
    : entry.intercepted
      ? '<div class="ar-detail-section"><span class="ar-detail-none">Response body not available</span></div>'
      : '<div class="ar-detail-section"><span class="ar-detail-none">Response body only available for intercepted requests</span></div>';

  return `
    <div class="ar-detail-panel" id="ar-detail-panel">
      <div class="ar-detail-header">
        <div class="ar-detail-title">
          <span class="ar-detail-method">${entry.method}</span>
          <span class="ar-detail-url-full" title="${esc(entry.url)}">${esc(truncate(entry.url, 90))}</span>
          ${entry.intercepted ? '<span class="ar-traffic-badge">INTERCEPTED</span>' : ''}
          ${entry.error ? `<span class="ar-detail-error-badge">ERROR</span>` : ''}
        </div>
        <button class="ar-detail-close" id="ar-detail-close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="ar-detail-info-row">
        <span class="ar-detail-chip">${entry.protocol}</span>
        <span class="ar-detail-chip">${entry.statusCode || '—'}</span>
        <span class="ar-detail-chip">${entry.contentType || 'unknown'}</span>
        ${entry.interceptedBy ? `<span class="ar-detail-chip ar-detail-chip--accent">Rule: ${esc(entry.interceptedBy)}</span>` : ''}
        ${entry.error ? `<span class="ar-detail-chip ar-detail-chip--danger">${esc(entry.error)}</span>` : ''}
      </div>

      <div class="ar-detail-sections">
        <div class="ar-detail-section">
          <div class="ar-detail-section-title">Request Headers</div>
          <div class="ar-detail-headers">${reqHeaders}</div>
        </div>
        <div class="ar-detail-section">
          <div class="ar-detail-section-title">Response Headers</div>
          <div class="ar-detail-headers">${resHeaders}</div>
        </div>
        ${bodySection}
      </div>
    </div>`;
}

// ─── Rule Editor Modal ────────────────────────────────────────

function renderEditor(): string {
  const r = editingRule!;
  const isNew = !editingId;
  const title = isNew ? 'New Rule' : 'Edit Rule';
  const hasFile = responseMode === 'file';

  return `
    <div class="ar-editor-overlay" id="ar-editor-overlay">
      <div class="ar-editor">
        <div class="ar-editor-header">
          <h3 class="ar-editor-title">${title}</h3>
          <button class="ar-editor-close" id="ar-editor-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        ${ruleError ? `<div class="ar-editor-error">${esc(ruleError)}</div>` : ''}

        <div class="ar-editor-body">
          <div class="ar-field">
            <label class="ar-field-label">Label</label>
            <input type="text" class="ar-field-input" id="ar-field-label"
              value="${esc(r.label || '')}" placeholder="e.g. Block World Info" />
          </div>

          <div class="ar-field-row">
            <div class="ar-field ar-field--match">
              <label class="ar-field-label">Match</label>
              <select class="ar-field-select" id="ar-field-match">
                <option value="contains" ${r.match === 'contains' ? 'selected' : ''}>Contains</option>
                <option value="exact" ${r.match === 'exact' ? 'selected' : ''}>Exact URL</option>
                <option value="regex" ${r.match === 'regex' ? 'selected' : ''}>Regex</option>
              </select>
            </div>
            <div class="ar-field ar-field--grow">
              <label class="ar-field-label">Pattern</label>
              <input type="text" class="ar-field-input" id="ar-field-pattern"
                value="${esc(r.pattern || '')}" placeholder="e.g. /world/info or https://..." />
            </div>
          </div>

          <div class="ar-field-row">
            <div class="ar-field ar-field--status">
              <label class="ar-field-label">Status Code</label>
              <input type="number" class="ar-field-input" id="ar-field-status"
                value="${r.statusCode ?? 200}" min="100" max="599" />
            </div>
            <div class="ar-field ar-field--grow">
              <label class="ar-field-label">Content-Type</label>
              <input type="text" class="ar-field-input" id="ar-field-content-type"
                value="${esc(r.contentType || 'application/json')}" placeholder="application/json" />
            </div>
          </div>

          <!-- Response source toggle -->
          <div class="ar-response-source">
            <label class="ar-field-label">Response Source</label>
            <div class="ar-response-tabs">
              <button class="ar-response-tab ${!hasFile ? 'ar-response-tab--active' : ''}" data-mode="inline">Write Inline</button>
              <button class="ar-response-tab ${hasFile ? 'ar-response-tab--active' : ''}" data-mode="file">Load from File</button>
            </div>
          </div>

          ${hasFile ? `
            <div class="ar-file-picker">
              <div class="ar-file-path-row">
                <input type="text" class="ar-field-input ar-file-path" id="ar-field-file"
                  value="${esc(r.responseFile || '')}" placeholder="No file selected..." readonly />
                <button class="ar-browse-btn" id="ar-browse-file">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  Browse...
                </button>
              </div>
              ${r.responseFile ? `<div class="ar-file-info">File: <strong>${esc(fileName(r.responseFile))}</strong></div>` : ''}
            </div>
          ` : `
            <div class="ar-field">
              <textarea class="ar-field-textarea" id="ar-field-body" rows="10"
                placeholder='{"success": true, "data": {}}'>${esc(r.body || '')}</textarea>
            </div>
          `}

          <div class="ar-field">
            <label class="ar-field-label">Test URL <span class="ar-field-hint">(optional)</span></label>
            <div class="ar-test-row">
              <input type="text" class="ar-field-input" id="ar-field-test-url"
                placeholder="https://example.com/api/world/info" />
              <button class="ar-test-btn" id="ar-test-btn">Test</button>
            </div>
            <div class="ar-test-result" id="ar-test-result"></div>
          </div>
        </div>

        <div class="ar-editor-footer">
          <button class="ar-btn ar-btn--ghost" id="ar-editor-cancel">Cancel</button>
          <button class="ar-btn ar-btn--primary" id="ar-editor-save">
            ${isNew ? 'Add Rule' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>`;
}

// ─── Events ───────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // Master toggle
  const masterToggle = el.querySelector('#ar-master-toggle') as HTMLInputElement | null;
  masterToggle?.addEventListener('change', async () => {
    const result = await window.glowAPI.autoresponder.setEnabled(masterToggle.checked);
    globalEnabled = result.enabled;
    proxyPort = result.port || 0;
    proxyRunning = result.enabled;
    if (result.error) {
      certMessage = 'Error: ' + result.error;
    } else {
      certMessage = '';
    }
    draw();
  });

  // Install certificate button
  el.querySelector('#ar-install-cert')?.addEventListener('click', async () => {
    certMessage = 'Installing...';
    draw();
    const result = await window.glowAPI.autoresponder.installCert();
    certMessage = result.message;
    draw();
  });

  // Tabs
  el.querySelectorAll('.ar-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      viewMode = (tab as HTMLElement).dataset.tab as 'rules' | 'traffic';
      selectedTrafficId = null;
      draw();
    });
  });

  // Add rule
  el.querySelector('#ar-add-rule')?.addEventListener('click', () => {
    editingId = null;
    editingRule = {
      enabled: true,
      match: 'contains',
      pattern: '',
      statusCode: 200,
      contentType: 'application/json',
      body: '',
      responseFile: undefined,
      label: '',
    };
    responseMode = 'inline';
    ruleError = null;
    draw();
  });

  // Rule toggles
  el.querySelectorAll<HTMLInputElement>('.ar-rule-toggle-input').forEach((input) => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id!;
      await window.glowAPI.autoresponder.toggleRule(id, input.checked);
      const rule = rules.find((r) => r.id === id);
      if (rule) rule.enabled = input.checked;
      draw();
    });
  });

  // Edit buttons
  el.querySelectorAll('.ar-rule-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      const rule = rules.find((r) => r.id === id);
      if (!rule) return;
      editingId = id;
      editingRule = { ...rule };
      responseMode = rule.responseFile ? 'file' : 'inline';
      ruleError = null;
      draw();
    });
  });

  // Delete buttons
  el.querySelectorAll('.ar-rule-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id!;
      await window.glowAPI.autoresponder.deleteRule(id);
      rules = rules.filter((r) => r.id !== id);
      draw();
    });
  });

  // ── Traffic events ──────────────────────────────────────
  el.querySelector('#ar-clear-traffic')?.addEventListener('click', async () => {
    await window.glowAPI.autoresponder.clearTraffic();
    traffic = [];
    interceptedCount = 0;
    selectedTrafficId = null;
    draw();
  });

  // Click on traffic row
  el.querySelectorAll('.ar-traffic-row').forEach((row) => {
    row.addEventListener('click', () => {
      const id = parseInt((row as HTMLElement).dataset.id!, 10);
      selectedTrafficId = selectedTrafficId === id ? null : id;
      draw();
    });
  });

  // Close detail panel
  el.querySelector('#ar-detail-close')?.addEventListener('click', () => {
    selectedTrafficId = null;
    draw();
  });

  // ── Editor events ────────────────────────────────────────
  el.querySelector('#ar-editor-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'ar-editor-overlay') closeEditor();
  });

  el.querySelector('#ar-editor-close')?.addEventListener('click', () => closeEditor());
  el.querySelector('#ar-editor-cancel')?.addEventListener('click', () => closeEditor());
  el.querySelector('#ar-editor-save')?.addEventListener('click', () => saveRule());
  el.querySelector('#ar-test-btn')?.addEventListener('click', () => testRule());

  // Response source tabs (inline / file)
  el.querySelectorAll('.ar-response-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      responseMode = (tab as HTMLElement).dataset.mode as 'inline' | 'file';
      // Preserve current values before redraw
      preserveEditorState();
      draw();
    });
  });

  // Browse file button
  el.querySelector('#ar-browse-file')?.addEventListener('click', async () => {
    const filePath = await window.glowAPI.autoresponder.browseFile();
    if (filePath && editingRule) {
      editingRule.responseFile = filePath;
      preserveEditorState();
      draw();
    }
  });
}

function preserveEditorState(): void {
  if (!el || !editingRule) return;
  const label = (el.querySelector('#ar-field-label') as HTMLInputElement)?.value;
  const match = (el.querySelector('#ar-field-match') as HTMLSelectElement)?.value;
  const pattern = (el.querySelector('#ar-field-pattern') as HTMLInputElement)?.value;
  const statusCode = (el.querySelector('#ar-field-status') as HTMLInputElement)?.value;
  const contentType = (el.querySelector('#ar-field-content-type') as HTMLInputElement)?.value;
  const body = (el.querySelector('#ar-field-body') as HTMLTextAreaElement)?.value;
  const file = (el.querySelector('#ar-field-file') as HTMLInputElement)?.value;

  if (label !== undefined) editingRule.label = label;
  if (match) editingRule.match = match as any;
  if (pattern !== undefined) editingRule.pattern = pattern;
  if (statusCode) editingRule.statusCode = parseInt(statusCode, 10) || 200;
  if (contentType !== undefined) editingRule.contentType = contentType;
  if (body !== undefined) editingRule.body = body;
  if (file !== undefined && file) editingRule.responseFile = file;
}

function closeEditor(): void {
  editingRule = null;
  editingId = null;
  ruleError = null;
  draw();
}

async function saveRule(): Promise<void> {
  if (!el || !editingRule) return;

  preserveEditorState();

  const label = editingRule.label?.trim() || '';
  const match = editingRule.match || 'contains';
  const pattern = editingRule.pattern?.trim() || '';
  const statusCode = editingRule.statusCode || 200;
  const contentType = editingRule.contentType?.trim() || 'application/json';
  const body = responseMode === 'inline' ? (editingRule.body || '') : '';
  const responseFile = responseMode === 'file' ? (editingRule.responseFile || undefined) : undefined;

  if (!pattern) {
    ruleError = 'Pattern is required.';
    draw();
    return;
  }

  if (match === 'regex') {
    try { new RegExp(pattern); } catch (e: any) {
      ruleError = `Invalid regex: ${e.message}`;
      draw();
      return;
    }
  }

  if (responseMode === 'file' && !responseFile) {
    ruleError = 'Please select a response file.';
    draw();
    return;
  }

  const ruleData = {
    enabled: editingRule.enabled ?? true,
    match,
    pattern,
    statusCode,
    contentType,
    body,
    responseFile,
    label,
  };

  try {
    if (editingId) {
      const updated = await window.glowAPI.autoresponder.updateRule(editingId, ruleData);
      if (updated) {
        const idx = rules.findIndex((r) => r.id === editingId);
        if (idx >= 0) rules[idx] = updated;
      }
    } else {
      const newRule = await window.glowAPI.autoresponder.addRule(ruleData);
      rules.push(newRule);
    }
    closeEditor();
  } catch (err: any) {
    ruleError = err.message || 'Failed to save rule';
    draw();
  }
}

async function testRule(): Promise<void> {
  if (!el) return;
  const match = (el.querySelector('#ar-field-match') as HTMLSelectElement).value;
  const pattern = (el.querySelector('#ar-field-pattern') as HTMLInputElement).value.trim();
  const testUrl = (el.querySelector('#ar-field-test-url') as HTMLInputElement).value.trim();
  const resultEl = el.querySelector('#ar-test-result') as HTMLElement;

  if (!pattern || !testUrl) {
    if (resultEl) resultEl.innerHTML = '<span class="ar-test-warn">Enter a pattern and test URL.</span>';
    return;
  }

  const result = await window.glowAPI.autoresponder.testPattern(match, pattern, testUrl);
  if (resultEl) {
    if (result.error) {
      resultEl.innerHTML = `<span class="ar-test-fail">Error: ${esc(result.error)}</span>`;
    } else if (result.matches) {
      resultEl.innerHTML = '<span class="ar-test-pass">&#10003; Pattern matches URL</span>';
    } else {
      resultEl.innerHTML = '<span class="ar-test-fail">&#10007; No match</span>';
    }
  }
}

// ─── IPC listener for real-time traffic ───────────────────────

function onTraffic(msg: { type: string; entry: TrafficEntry }): void {
  if (msg.type === 'new') {
    traffic.push(msg.entry);
    if (traffic.length > MAX_TRAFFIC) traffic.shift();
    if (msg.entry.intercepted) interceptedCount++;

    // If in traffic view, append row without full redraw (for performance)
    if (viewMode === 'traffic' && el && !selectedTrafficId) {
      appendTrafficRow(msg.entry);
      updateTrafficCount();
    } else if (viewMode !== 'traffic') {
      // Just update counter badge
      updateTabBadge();
    }
  } else if (msg.type === 'update') {
    const idx = traffic.findIndex((t) => t.id === msg.entry.id);
    if (idx >= 0) {
      traffic[idx] = msg.entry;
      // Update the row in place if visible
      if (viewMode === 'traffic' && el) {
        updateTrafficRow(msg.entry);
      }
    }
  }
}

function appendTrafficRow(t: TrafficEntry): void {
  if (!el) return;
  const tbody = el.querySelector('.ar-traffic-table tbody');
  if (!tbody) { draw(); return; }

  const statusClass = t.error ? 'ar-status-error'
    : t.intercepted ? 'ar-status-intercept'
    : 'ar-status-ok';
  const interceptBadge = t.intercepted ? '<span class="ar-traffic-badge">INTERCEPTED</span>' : '';

  const tr = document.createElement('tr');
  tr.className = `ar-traffic-row ${t.intercepted ? 'ar-traffic-row--intercepted' : ''}`;
  tr.dataset.id = String(t.id);
  tr.innerHTML = `
    <td class="ar-traffic-cell ar-traffic-id">${t.id}</td>
    <td class="ar-traffic-cell ar-traffic-status ${statusClass}">${t.error ? 'ERR' : (t.statusCode || '—')}</td>
    <td class="ar-traffic-cell ar-traffic-method">${t.method}</td>
    <td class="ar-traffic-cell ar-traffic-proto">${t.protocol}</td>
    <td class="ar-traffic-cell ar-traffic-host">${esc(t.host)}</td>
    <td class="ar-traffic-cell ar-traffic-url" title="${esc(t.url)}">${esc(extractPath(t.url))} ${interceptBadge}</td>`;

  tr.addEventListener('click', () => {
    selectedTrafficId = selectedTrafficId === t.id ? null : t.id;
    draw();
  });

  // Prepend (newest first)
  if (tbody.firstChild) {
    tbody.insertBefore(tr, tbody.firstChild);
  } else {
    tbody.appendChild(tr);
  }

  // Remove empty state if present
  const empty = el.querySelector('.ar-empty');
  if (empty) draw();
}

function updateTrafficRow(t: TrafficEntry): void {
  if (!el) return;
  const row = el.querySelector(`.ar-traffic-row[data-id="${t.id}"]`);
  if (!row) return;

  const statusClass = t.error ? 'ar-status-error'
    : t.intercepted ? 'ar-status-intercept'
    : (t.statusCode >= 400) ? 'ar-status-error'
    : (t.statusCode >= 300) ? 'ar-status-redirect'
    : 'ar-status-ok';

  const statusCell = row.querySelector('.ar-traffic-status');
  if (statusCell) {
    statusCell.className = `ar-traffic-cell ar-traffic-status ${statusClass}`;
    statusCell.textContent = t.error ? 'ERR' : String(t.statusCode || '—');
  }

  if (t.intercepted && !row.classList.contains('ar-traffic-row--intercepted')) {
    row.classList.add('ar-traffic-row--intercepted');
  }

  // If this entry is selected and detail panel is open, refresh detail
  if (t.id === selectedTrafficId) {
    const detailPanel = el.querySelector('#ar-detail-panel');
    if (detailPanel) {
      draw(); // Full redraw to update detail panel
    }
  }
}

function updateTrafficCount(): void {
  if (!el) return;
  const countEl = el.querySelector('.ar-traffic-count');
  if (countEl) countEl.textContent = `${traffic.length} requests`;
  const counterVal = el.querySelector('.ar-counter-value');
  if (counterVal) counterVal.textContent = String(interceptedCount);
  const tabCount = el.querySelector('.ar-tab[data-tab="traffic"] .ar-tab-count');
  if (tabCount) tabCount.textContent = String(traffic.length);
}

function updateTabBadge(): void {
  if (!el) return;
  const tabCount = el.querySelector('.ar-tab[data-tab="traffic"] .ar-tab-count');
  if (tabCount) tabCount.textContent = String(traffic.length);
  const counterVal = el.querySelector('.ar-counter-value');
  if (counterVal) counterVal.textContent = String(interceptedCount);
}

async function reload(): Promise<void> {
  const status = await window.glowAPI.autoresponder.getFullStatus();
  globalEnabled = status.enabled;
  rules = status.rules;
  interceptedCount = status.interceptedCount;

  // Get proxy status
  const ps = await window.glowAPI.autoresponder.getProxyStatus();
  proxyRunning = ps.running;
  proxyPort = ps.port;

  // Load current traffic
  const currentTraffic = await window.glowAPI.autoresponder.getTraffic();
  traffic = currentTraffic;

  draw();
}

// ─── Helpers ──────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\u2026' : s;
}

function extractPath(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname + u.search;
    return p.length > 80 ? p.slice(0, 80) + '\u2026' : p;
  } catch {
    return url.length > 80 ? url.slice(0, 80) + '\u2026' : url;
  }
}

function fileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

// ─── Page Definition ──────────────────────────────────────────

export const autoresponderPage: PageDefinition = {
  id: 'autoresponder',
  label: 'AutoResponder',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  order: 15,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    traffic = [];
    selectedTrafficId = null;

    window.glowAPI.autoresponder.onTraffic(onTraffic);

    await reload();
  },

  cleanup(): void {
    window.glowAPI.autoresponder.offTraffic();
    el = null;
  },
};
