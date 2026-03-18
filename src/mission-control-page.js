function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toJsonForScript(value) {
  return JSON.stringify(value ?? null).replaceAll('</', '<\\/');
}

export function getMissionControlPageHTML({ userEmail, error } = {}) {
  const errHtml = error ? `<div class="flash error">${escapeHtml(error)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Mission Control — OpenClaw</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --bg: #0f1117;
      --surface: #181b22;
      --surface2: #1e2230;
      --border: rgba(255,255,255,0.08);
      --accent: #ff5c5c;
      --accent2: #00e5cc;
      --text: #e4e4e7;
      --muted: #71717a;
      --success: #22c55e;
      --warn: #f59e0b;
      --danger: #ef4444;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      letter-spacing: -0.01em;
    }
    a { color: inherit; text-decoration: none; }

    /* ── Top bar ── */
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      height: 52px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .topbar-left { display: flex; align-items: center; gap: 16px; }
    .logo { font-size: 15px; font-weight: 700; color: var(--accent); letter-spacing: -0.02em; }
    .breadcrumb { font-size: 13px; color: var(--muted); }
    .breadcrumb a { color: var(--accent2); }
    .topbar-right { display: flex; align-items: center; gap: 12px; }
    .user-email { font-size: 12px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
    .btn-sm {
      padding: 5px 12px;
      border-radius: 7px;
      border: 1px solid var(--border);
      background: var(--surface2);
      color: var(--text);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .btn-sm:hover { border-color: var(--accent2); }

    /* ── Layout ── */
    .layout { display: flex; min-height: calc(100vh - 52px); }
    .sidebar {
      width: 200px;
      flex-shrink: 0;
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 16px 0;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 20px;
      font-size: 13px;
      font-weight: 500;
      color: var(--muted);
      cursor: pointer;
      border-left: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    .nav-item:hover { color: var(--text); background: rgba(255,255,255,0.04); }
    .nav-item.active { color: var(--text); border-left-color: var(--accent); background: rgba(255,92,92,0.06); }
    .nav-icon { font-size: 15px; }
    .nav-section { padding: 16px 20px 4px; font-size: 10px; font-weight: 700; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; }

    /* ── Main content ── */
    .main { flex: 1; padding: 24px; overflow-y: auto; }
    .panel { display: none; }
    .panel.active { display: block; }

    /* ── Flash messages ── */
    .flash {
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 16px;
    }
    .flash.error { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; }
    .flash.success { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); color: #86efac; }

    /* ── Cards ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 18px;
    }
    .stat-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
    .stat-value { font-size: 26px; font-weight: 700; color: var(--text); }
    .stat-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }

    /* ── Status dot ── */
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
    .dot.green { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .dot.red { background: var(--danger); }
    .dot.yellow { background: var(--warn); }

    /* ── Section header ── */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .section-title { font-size: 16px; font-weight: 700; margin: 0; }

    /* ── Buttons ── */
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: 0;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s;
    }
    .btn:hover { opacity: 0.88; transform: translateY(-1px); }
    .btn.primary { background: linear-gradient(135deg, #ff5c5c, #991b1b); color: white; }
    .btn.secondary { background: var(--surface2); border: 1px solid var(--border); color: var(--text); }
    .btn.danger { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; }
    .btn.success-btn { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); color: #86efac; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

    /* ── Table ── */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid var(--border); }
    td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
    tr:last-child td { border-bottom: 0; }
    tr:hover td { background: rgba(255,255,255,0.02); }

    /* ── Badges ── */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge.todo { background: rgba(113,113,122,0.2); color: var(--muted); }
    .badge.in-progress { background: rgba(245,158,11,0.15); color: #fcd34d; }
    .badge.done { background: rgba(34,197,94,0.15); color: #86efac; }
    .badge.pending { background: rgba(245,158,11,0.15); color: #fcd34d; }
    .badge.approved { background: rgba(34,197,94,0.15); color: #86efac; }
    .badge.rejected { background: rgba(239,68,68,0.15); color: #fca5a5; }

    /* ── Form elements ── */
    .field { margin-bottom: 12px; }
    .field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; font-weight: 600; }
    .field input, .field textarea, .field select {
      width: 100%;
      padding: 9px 11px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: rgba(15,17,23,0.9);
      color: var(--text);
      font-size: 13px;
      font-family: inherit;
      outline: none;
    }
    .field input:focus, .field textarea:focus, .field select:focus {
      border-color: rgba(255,92,92,0.5);
      box-shadow: 0 0 0 3px rgba(255,92,92,0.1);
    }
    .field textarea { resize: vertical; min-height: 72px; }
    .field select option { background: #181b22; }

    /* ── Modal ── */
    .modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 200;
      place-items: center;
    }
    .modal-backdrop.open { display: grid; }
    .modal {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 24px;
      width: min(480px, calc(100vw - 32px));
      box-shadow: 0 40px 100px rgba(0,0,0,0.6);
    }
    .modal h3 { margin: 0 0 16px 0; font-size: 16px; font-weight: 700; }
    .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }

    /* ── Board list ── */
    .board-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
    .board-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 18px;
      cursor: pointer;
      transition: border-color 0.15s, transform 0.1s;
    }
    .board-card:hover { border-color: var(--accent2); transform: translateY(-2px); }
    .board-card .board-name { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
    .board-card .board-desc { font-size: 12px; color: var(--muted); }
    .board-card .board-meta { display: flex; gap: 8px; margin-top: 10px; font-size: 11px; color: var(--muted); }

    /* ── Task list ── */
    .task-columns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .task-col { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
    .task-col-header { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 10px; }
    .task-item {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .task-item:hover { border-color: rgba(255,255,255,0.18); }
    .task-item .task-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .task-item .task-meta { font-size: 11px; color: var(--muted); display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { display: inline-block; padding: 1px 7px; border-radius: 20px; font-size: 10px; font-weight: 600; background: rgba(0,229,204,0.1); color: var(--accent2); border: 1px solid rgba(0,229,204,0.2); }

    /* ── Audit log ── */
    .audit-type { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent2); }
    .audit-actor { font-size: 12px; color: var(--muted); }
    .audit-ts { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; white-space: nowrap; }
    .audit-payload { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* ── Gateway card ── */
    .gw-card { display: flex; align-items: center; gap: 16px; }
    .gw-status-text { font-size: 14px; font-weight: 600; }
    .gw-uptime { font-size: 12px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
    .gw-actions { display: flex; gap: 8px; margin-left: auto; }
    .log-tail {
      margin-top: 14px;
      background: #0a0c10;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #a1a1aa;
      max-height: 160px;
      overflow-y: auto;
    }
    .log-line { padding: 1px 0; }
    .log-line.stderr { color: #fca5a5; }

    /* ── Empty state ── */
    .empty { text-align: center; padding: 48px 24px; color: var(--muted); }
    .empty-icon { font-size: 36px; margin-bottom: 10px; }
    .empty p { font-size: 14px; margin: 0 0 16px 0; }

    /* ── Loading spinner ── */
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--accent2); border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Responsive ── */
    @media (max-width: 700px) {
      .sidebar { display: none; }
      .task-columns { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-left">
      <span class="logo">⚡ OpenClaw</span>
      <span class="breadcrumb"><a href="/dashboard">Dashboard</a> / Mission Control</span>
    </div>
    <div class="topbar-right">
      ${userEmail ? `<span class="user-email">${escapeHtml(userEmail)}</span>` : ''}
      <a href="/dashboard" class="btn-sm">← Dashboard</a>
      <form method="POST" action="/auth/logout" style="display:inline;">
        <button class="btn-sm" type="submit">Sign out</button>
      </form>
    </div>
  </header>

  <div class="layout">
    <nav class="sidebar">
      <div class="nav-section">Operations</div>
      <div class="nav-item active" data-panel="overview"><span class="nav-icon">🎯</span> Overview</div>
      <div class="nav-item" data-panel="boards"><span class="nav-icon">📋</span> Boards</div>
      <div class="nav-item" data-panel="tasks"><span class="nav-icon">✅</span> Tasks</div>
      <div class="nav-section">Governance</div>
      <div class="nav-item" data-panel="approvals"><span class="nav-icon">🔐</span> Approvals</div>
      <div class="nav-item" data-panel="audit"><span class="nav-icon">📜</span> Audit Trail</div>
      <div class="nav-section">System</div>
      <div class="nav-item" data-panel="gateway"><span class="nav-icon">⚙️</span> Gateway</div>
      <div class="nav-item" onclick="window.location='/lite'"><span class="nav-icon">🖥️</span> Lite Panel ↗</div>
    </nav>

    <main class="main">
      ${errHtml}
      <div id="flash-area"></div>

      <!-- ── Overview ── -->
      <div id="panel-overview" class="panel active">
        <div class="section-header">
          <h2 class="section-title">Overview</h2>
          <button class="btn secondary" onclick="loadOverview()">Refresh</button>
        </div>
        <div class="card-grid" id="overview-stats">
          <div class="stat-card"><div class="stat-label">Gateway</div><div class="stat-value" id="ov-gw-status">—</div><div class="stat-sub" id="ov-gw-uptime"></div></div>
          <div class="stat-card"><div class="stat-label">Open Tasks</div><div class="stat-value" id="ov-tasks">—</div><div class="stat-sub">todo + in-progress</div></div>
          <div class="stat-card"><div class="stat-label">Pending Approvals</div><div class="stat-value" id="ov-approvals">—</div><div class="stat-sub">awaiting decision</div></div>
          <div class="stat-card"><div class="stat-label">Sessions</div><div class="stat-value" id="ov-sessions">—</div><div class="stat-sub">active gateway sessions</div></div>
        </div>
        <div class="card">
          <div class="stat-label" style="margin-bottom:10px;">Recent Audit Events</div>
          <div id="ov-audit-list"><span class="spinner"></span></div>
        </div>
      </div>

      <!-- ── Boards ── -->
      <div id="panel-boards" class="panel">
        <div class="section-header">
          <h2 class="section-title">Boards</h2>
          <button class="btn primary" onclick="openBoardModal()">+ New Board</button>
        </div>
        <div id="boards-list"><span class="spinner"></span></div>
      </div>

      <!-- ── Tasks ── -->
      <div id="panel-tasks" class="panel">
        <div class="section-header">
          <h2 class="section-title" id="tasks-title">Tasks</h2>
          <div style="display:flex;gap:8px;align-items:center;">
            <select id="board-select" class="btn-sm" style="padding:5px 8px;" onchange="loadTasks(this.value)">
              <option value="">Select board…</option>
            </select>
            <button class="btn primary" onclick="openTaskModal()" id="new-task-btn" disabled>+ New Task</button>
          </div>
        </div>
        <div id="tasks-columns">
          <div class="empty"><div class="empty-icon">📋</div><p>Select a board to view tasks.</p></div>
        </div>
      </div>

      <!-- ── Approvals ── -->
      <div id="panel-approvals" class="panel">
        <div class="section-header">
          <h2 class="section-title">Approval Requests</h2>
          <button class="btn primary" onclick="openApprovalModal()">+ Request Approval</button>
        </div>
        <div id="approvals-list"><span class="spinner"></span></div>
      </div>

      <!-- ── Audit Trail ── -->
      <div id="panel-audit" class="panel">
        <div class="section-header">
          <h2 class="section-title">Audit Trail</h2>
          <button class="btn secondary" onclick="loadAudit()">Refresh</button>
        </div>
        <div class="card table-wrap">
          <table>
            <thead><tr><th>Event</th><th>Actor</th><th>Time</th><th>Details</th></tr></thead>
            <tbody id="audit-tbody"><tr><td colspan="4"><span class="spinner"></span></td></tr></tbody>
          </table>
        </div>
        <div id="audit-pagination" style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;"></div>
      </div>

      <!-- ── Gateway ── -->
      <div id="panel-gateway" class="panel">
        <div class="section-header">
          <h2 class="section-title">Gateway</h2>
          <button class="btn secondary" onclick="loadGateway()">Refresh</button>
        </div>
        <div class="card" id="gw-card">
          <div class="gw-card">
            <div>
              <div id="gw-status-text" class="gw-status-text"><span class="spinner"></span></div>
              <div id="gw-uptime-text" class="gw-uptime"></div>
            </div>
            <div class="gw-actions">
              <button class="btn success-btn" onclick="gwAction('start')" id="gw-start">Start</button>
              <button class="btn danger" onclick="gwAction('stop')" id="gw-stop">Stop</button>
              <button class="btn secondary" onclick="gwAction('restart')" id="gw-restart">Restart</button>
            </div>
          </div>
          <div class="log-tail" id="gw-log-tail"></div>
          <div style="margin-top:10px;font-size:12px;color:var(--muted);">For full gateway management, visit <a href="/lite" style="color:var(--accent2);">/lite</a>.</div>
        </div>
      </div>
    </main>
  </div>

  <!-- ── Board Modal ── -->
  <div class="modal-backdrop" id="board-modal">
    <div class="modal">
      <h3 id="board-modal-title">New Board</h3>
      <input type="hidden" id="board-modal-id"/>
      <div class="field"><label>Name</label><input id="board-name" type="text" placeholder="e.g. Sprint 1"/></div>
      <div class="field"><label>Description</label><textarea id="board-desc" placeholder="Optional description…"></textarea></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="closeModal('board-modal')">Cancel</button>
        <button class="btn primary" onclick="saveBoard()">Save</button>
      </div>
    </div>
  </div>

  <!-- ── Task Modal ── -->
  <div class="modal-backdrop" id="task-modal">
    <div class="modal">
      <h3 id="task-modal-title">New Task</h3>
      <input type="hidden" id="task-modal-id"/>
      <input type="hidden" id="task-modal-board-id"/>
      <div class="field"><label>Title</label><input id="task-title" type="text" placeholder="Task title…"/></div>
      <div class="field"><label>Description</label><textarea id="task-desc" placeholder="Optional description…"></textarea></div>
      <div class="field"><label>Status</label>
        <select id="task-status">
          <option value="todo">Todo</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </div>
      <div class="field"><label>Assignee Agent</label><input id="task-agent" type="text" placeholder="e.g. claude-sonnet"/></div>
      <div class="field"><label>Tags (comma-separated)</label><input id="task-tags" type="text" placeholder="e.g. backend, urgent"/></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="closeModal('task-modal')">Cancel</button>
        <button class="btn primary" onclick="saveTask()">Save</button>
      </div>
    </div>
  </div>

  <!-- ── Approval Modal ── -->
  <div class="modal-backdrop" id="approval-modal">
    <div class="modal">
      <h3>Request Approval</h3>
      <div class="field"><label>Action Type</label><input id="approval-type" type="text" placeholder="e.g. gateway.restart, config.change"/></div>
      <div class="field"><label>Description / Payload</label><textarea id="approval-payload" placeholder="Describe what needs approval…"></textarea></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="closeModal('approval-modal')">Cancel</button>
        <button class="btn primary" onclick="saveApproval()">Submit</button>
      </div>
    </div>
  </div>

  <script>
    // ── State ──
    let currentBoardId = null;

    // ── Flash ──
    function showFlash(msg, type = 'success') {
      const area = document.getElementById('flash-area');
      const el = document.createElement('div');
      el.className = 'flash ' + type;
      el.textContent = msg;
      area.appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }, 3500);
    }

    // ── Navigation ──
    const panels = document.querySelectorAll('.panel');
    const navItems = document.querySelectorAll('.nav-item[data-panel]');
    function setPanel(name) {
      panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
      navItems.forEach(n => n.classList.toggle('active', n.dataset.panel === name));
      if (name === 'overview') loadOverview();
      if (name === 'boards') loadBoards();
      if (name === 'approvals') loadApprovals();
      if (name === 'audit') loadAudit();
      if (name === 'gateway') loadGateway();
    }
    navItems.forEach(n => n.addEventListener('click', () => setPanel(n.dataset.panel)));

    // ── API helpers ──
    async function api(method, path, body) {
      const opts = { method, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } };
      if (body !== undefined) opts.body = JSON.stringify(body);
      const res = await fetch(path, opts);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
      return json;
    }

    // ── Modal helpers ──
    function openModal(id) { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }
    document.querySelectorAll('.modal-backdrop').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    });

    // ── Overview ──
    async function loadOverview() {
      try {
        const data = await api('GET', '/mission-control/api/overview');
        const gw = data.gateway || {};
        const gwEl = document.getElementById('ov-gw-status');
        if (gw.gatewayRunning) {
          gwEl.innerHTML = '<span class="dot green"></span>Running';
        } else {
          gwEl.innerHTML = '<span class="dot red"></span>Stopped';
        }
        document.getElementById('ov-gw-uptime').textContent = gw.uptime ? formatUptime(gw.uptime) : '';
        document.getElementById('ov-tasks').textContent = data.openTasks ?? '—';
        document.getElementById('ov-approvals').textContent = data.pendingApprovals ?? '—';
        document.getElementById('ov-sessions').textContent = data.sessions ?? '—';

        const auditList = document.getElementById('ov-audit-list');
        const events = data.recentAudit || [];
        if (events.length === 0) {
          auditList.innerHTML = '<div style="color:var(--muted);font-size:13px;">No audit events yet.</div>';
        } else {
          auditList.innerHTML = events.map(e => \`
            <div style="display:flex;gap:12px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
              <span class="audit-type">\${esc(e.event_type)}</span>
              <span class="audit-actor">\${esc(e.actor || '')}</span>
              <span class="audit-ts" style="margin-left:auto;">\${fmtDate(e.created_at)}</span>
            </div>
          \`).join('');
        }
      } catch (err) {
        document.getElementById('ov-gw-status').textContent = 'Error';
        showFlash('Failed to load overview: ' + err.message, 'error');
      }
    }

    // ── Boards ──
    async function loadBoards() {
      const el = document.getElementById('boards-list');
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const data = await api('GET', '/mission-control/api/boards');
        const boards = data.boards || [];
        populateBoardSelect(boards);
        if (boards.length === 0) {
          el.innerHTML = \`<div class="empty"><div class="empty-icon">📋</div><p>No boards yet. Create one to get started.</p></div>\`;
          return;
        }
        el.innerHTML = \`<div class="board-list">\${boards.map(b => \`
          <div class="board-card" onclick="openBoard('\${esc(b.id)}', '\${esc(b.name)}')">
            <div class="board-name">\${esc(b.name)}</div>
            <div class="board-desc">\${esc(b.description || '')}</div>
            <div class="board-meta">
              <span>\${esc(b.status || 'active')}</span>
              <span>\${fmtDate(b.created_at)}</span>
            </div>
          </div>
        \`).join('')}</div>\`;
      } catch (err) {
        el.innerHTML = \`<div class="flash error">Failed to load boards: \${esc(err.message)}</div>\`;
      }
    }

    function populateBoardSelect(boards) {
      const sel = document.getElementById('board-select');
      const cur = sel.value;
      sel.innerHTML = '<option value="">Select board…</option>' + boards.map(b =>
        \`<option value="\${esc(b.id)}" \${b.id === cur ? 'selected' : ''}>\${esc(b.name)}</option>\`
      ).join('');
    }

    function openBoard(id, name) {
      currentBoardId = id;
      setPanel('tasks');
      document.getElementById('tasks-title').textContent = 'Tasks — ' + name;
      document.getElementById('board-select').value = id;
      document.getElementById('new-task-btn').disabled = false;
      loadTasks(id);
    }

    function openBoardModal(board) {
      document.getElementById('board-modal-title').textContent = board ? 'Edit Board' : 'New Board';
      document.getElementById('board-modal-id').value = board ? board.id : '';
      document.getElementById('board-name').value = board ? board.name : '';
      document.getElementById('board-desc').value = board ? (board.description || '') : '';
      openModal('board-modal');
    }

    async function saveBoard() {
      const id = document.getElementById('board-modal-id').value;
      const name = document.getElementById('board-name').value.trim();
      const description = document.getElementById('board-desc').value.trim();
      if (!name) { showFlash('Board name is required.', 'error'); return; }
      try {
        if (id) {
          await api('PATCH', \`/mission-control/api/boards/\${id}\`, { name, description });
          showFlash('Board updated.');
        } else {
          await api('POST', '/mission-control/api/boards', { name, description });
          showFlash('Board created.');
        }
        closeModal('board-modal');
        loadBoards();
      } catch (err) {
        showFlash('Failed to save board: ' + err.message, 'error');
      }
    }

    // ── Tasks ──
    async function loadTasks(boardId) {
      if (!boardId) return;
      currentBoardId = boardId;
      document.getElementById('new-task-btn').disabled = false;
      const el = document.getElementById('tasks-columns');
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const data = await api('GET', \`/mission-control/api/boards/\${boardId}/tasks\`);
        const tasks = data.tasks || [];
        const cols = { 'todo': [], 'in-progress': [], 'done': [] };
        tasks.forEach(t => { if (cols[t.status]) cols[t.status].push(t); else cols['todo'].push(t); });

        const colLabels = { 'todo': 'To Do', 'in-progress': 'In Progress', 'done': 'Done' };
        el.innerHTML = \`<div class="task-columns">\${Object.entries(cols).map(([status, items]) => \`
          <div class="task-col">
            <div class="task-col-header">\${colLabels[status]} (\${items.length})</div>
            \${items.length === 0
              ? '<div style="color:var(--muted);font-size:12px;text-align:center;padding:16px 0;">Empty</div>'
              : items.map(t => \`
                <div class="task-item" onclick="openTaskModal(\${toJson(t)})">
                  <div class="task-title">\${esc(t.title)}</div>
                  <div class="task-meta">
                    \${t.assignee_agent ? \`<span>🤖 \${esc(t.assignee_agent)}</span>\` : ''}
                    \${(t.tags || []).map(tag => \`<span class="tag">\${esc(tag)}</span>\`).join('')}
                  </div>
                </div>
              \`).join('')
            }
          </div>
        \`).join('')}</div>\`;
      } catch (err) {
        el.innerHTML = \`<div class="flash error">Failed to load tasks: \${esc(err.message)}</div>\`;
      }
    }

    function openTaskModal(task) {
      document.getElementById('task-modal-title').textContent = task ? 'Edit Task' : 'New Task';
      document.getElementById('task-modal-id').value = task ? task.id : '';
      document.getElementById('task-modal-board-id').value = task ? task.board_id : (currentBoardId || '');
      document.getElementById('task-title').value = task ? task.title : '';
      document.getElementById('task-desc').value = task ? (task.description || '') : '';
      document.getElementById('task-status').value = task ? (task.status || 'todo') : 'todo';
      document.getElementById('task-agent').value = task ? (task.assignee_agent || '') : '';
      document.getElementById('task-tags').value = task ? (task.tags || []).join(', ') : '';
      openModal('task-modal');
    }

    async function saveTask() {
      const id = document.getElementById('task-modal-id').value;
      const boardId = document.getElementById('task-modal-board-id').value || currentBoardId;
      const title = document.getElementById('task-title').value.trim();
      const description = document.getElementById('task-desc').value.trim();
      const status = document.getElementById('task-status').value;
      const assignee_agent = document.getElementById('task-agent').value.trim();
      const tags = document.getElementById('task-tags').value.split(',').map(t => t.trim()).filter(Boolean);
      if (!title) { showFlash('Task title is required.', 'error'); return; }
      if (!boardId) { showFlash('No board selected.', 'error'); return; }
      try {
        if (id) {
          await api('PATCH', \`/mission-control/api/tasks/\${id}\`, { title, description, status, assignee_agent, tags });
          showFlash('Task updated.');
        } else {
          await api('POST', \`/mission-control/api/boards/\${boardId}/tasks\`, { title, description, status, assignee_agent, tags });
          showFlash('Task created.');
        }
        closeModal('task-modal');
        loadTasks(boardId);
      } catch (err) {
        showFlash('Failed to save task: ' + err.message, 'error');
      }
    }

    // ── Approvals ──
    async function loadApprovals() {
      const el = document.getElementById('approvals-list');
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const data = await api('GET', '/mission-control/api/approvals');
        const items = data.approvals || [];
        if (items.length === 0) {
          el.innerHTML = \`<div class="empty"><div class="empty-icon">🔐</div><p>No approval requests.</p></div>\`;
          return;
        }
        el.innerHTML = \`<div class="card table-wrap"><table>
          <thead><tr><th>Action</th><th>Status</th><th>Created</th><th>Decided</th><th>Actions</th></tr></thead>
          <tbody>\${items.map(a => \`
            <tr>
              <td><span class="audit-type">\${esc(a.action_type)}</span><br/><span style="font-size:11px;color:var(--muted);">\${esc(a.payload?.description || '')}</span></td>
              <td><span class="badge \${esc(a.status)}">\${esc(a.status)}</span></td>
              <td class="audit-ts">\${fmtDate(a.created_at)}</td>
              <td class="audit-ts">\${a.decided_at ? fmtDate(a.decided_at) : '—'}</td>
              <td>\${a.status === 'pending' ? \`
                <button class="btn success-btn" style="font-size:11px;padding:4px 10px;" onclick="decideApproval('\${esc(a.id)}', 'approved')">Approve</button>
                <button class="btn danger" style="font-size:11px;padding:4px 10px;margin-left:4px;" onclick="decideApproval('\${esc(a.id)}', 'rejected')">Reject</button>
              \` : '—'}</td>
            </tr>
          \`).join('')}</tbody>
        </table></div>\`;
      } catch (err) {
        el.innerHTML = \`<div class="flash error">Failed to load approvals: \${esc(err.message)}</div>\`;
      }
    }

    function openApprovalModal() { openModal('approval-modal'); }

    async function saveApproval() {
      const action_type = document.getElementById('approval-type').value.trim();
      const description = document.getElementById('approval-payload').value.trim();
      if (!action_type) { showFlash('Action type is required.', 'error'); return; }
      try {
        await api('POST', '/mission-control/api/approvals', { action_type, payload: { description } });
        showFlash('Approval request submitted.');
        closeModal('approval-modal');
        document.getElementById('approval-type').value = '';
        document.getElementById('approval-payload').value = '';
        loadApprovals();
      } catch (err) {
        showFlash('Failed to submit approval: ' + err.message, 'error');
      }
    }

    async function decideApproval(id, decision) {
      try {
        await api('POST', \`/mission-control/api/approvals/\${id}/decide\`, { decision });
        showFlash('Approval ' + decision + '.');
        loadApprovals();
      } catch (err) {
        showFlash('Failed to decide approval: ' + err.message, 'error');
      }
    }

    // ── Audit ──
    let auditOffset = 0;
    const AUDIT_PAGE = 30;

    async function loadAudit(offset = 0) {
      auditOffset = offset;
      const tbody = document.getElementById('audit-tbody');
      tbody.innerHTML = '<tr><td colspan="4"><span class="spinner"></span></td></tr>';
      try {
        const data = await api('GET', \`/mission-control/api/audit?limit=\${AUDIT_PAGE}&offset=\${offset}\`);
        const events = data.events || [];
        if (events.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px;">No audit events.</td></tr>';
        } else {
          tbody.innerHTML = events.map(e => \`
            <tr>
              <td class="audit-type">\${esc(e.event_type)}</td>
              <td class="audit-actor">\${esc(e.actor || 'system')}</td>
              <td class="audit-ts">\${fmtDate(e.created_at)}</td>
              <td class="audit-payload" title="\${esc(JSON.stringify(e.payload || {}))}">\${esc(JSON.stringify(e.payload || {}))}</td>
            </tr>
          \`).join('');
        }
        const pag = document.getElementById('audit-pagination');
        pag.innerHTML = '';
        if (offset > 0) {
          const prev = document.createElement('button');
          prev.className = 'btn secondary';
          prev.textContent = '← Prev';
          prev.onclick = () => loadAudit(Math.max(0, offset - AUDIT_PAGE));
          pag.appendChild(prev);
        }
        if (events.length === AUDIT_PAGE) {
          const next = document.createElement('button');
          next.className = 'btn secondary';
          next.textContent = 'Next →';
          next.onclick = () => loadAudit(offset + AUDIT_PAGE);
          pag.appendChild(next);
        }
      } catch (err) {
        tbody.innerHTML = \`<tr><td colspan="4" class="flash error">Failed to load audit: \${esc(err.message)}</td></tr>\`;
      }
    }

    // ── Gateway ──
    async function loadGateway() {
      try {
        const data = await api('GET', '/mission-control/api/gateway');
        const gw = data.gateway || {};
        const statusEl = document.getElementById('gw-status-text');
        if (gw.gatewayRunning) {
          statusEl.innerHTML = '<span class="dot green"></span>Running';
        } else {
          statusEl.innerHTML = '<span class="dot red"></span>Stopped';
        }
        document.getElementById('gw-uptime-text').textContent = gw.uptime ? 'Uptime: ' + formatUptime(gw.uptime) : '';

        const logTail = document.getElementById('gw-log-tail');
        const logs = data.logs || [];
        logTail.innerHTML = logs.length
          ? logs.map(l => \`<div class="log-line \${l.stream === 'stderr' ? 'stderr' : ''}">\${esc(l.text)}</div>\`).join('')
          : '<span style="color:var(--muted);">No recent logs.</span>';
        logTail.scrollTop = logTail.scrollHeight;
      } catch (err) {
        document.getElementById('gw-status-text').textContent = 'Error loading gateway status';
      }
    }

    async function gwAction(action) {
      const btn = document.getElementById('gw-' + action);
      if (btn) btn.disabled = true;
      try {
        await api('POST', \`/lite/api/gateway/\${action}\`);
        showFlash('Gateway ' + action + ' successful.');
        setTimeout(loadGateway, 1200);
      } catch (err) {
        showFlash('Gateway ' + action + ' failed: ' + err.message, 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // ── Utilities ──
    function esc(s) {
      return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
    }
    function toJson(v) { return esc(JSON.stringify(v)); }
    function fmtDate(s) {
      if (!s) return '';
      try { return new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; }
    }
    function formatUptime(ms) {
      if (!ms) return '';
      const s = Math.floor(ms / 1000);
      if (s < 60) return s + 's';
      const m = Math.floor(s / 60);
      if (m < 60) return m + 'm ' + (s % 60) + 's';
      const h = Math.floor(m / 60);
      return h + 'h ' + (m % 60) + 'm';
    }

    // ── Init ──
    loadOverview();
  </script>
</body>
</html>`;
}
