function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getMissionControlPageHTML({ userEmail, error } = {}) {
  const errHtml = error ? `<div class="flash error">${escapeHtml(error)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Mission Control — OpenClaw</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #f8f9fa;
      --surface: #ffffff;
      --surface2: #f1f3f5;
      --border: #e9ecef;
      --border2: #dee2e6;
      --accent: #1971c2;
      --accent-light: #e7f5ff;
      --text: #212529;
      --text2: #495057;
      --muted: #868e96;
      --success: #2f9e44;
      --success-bg: #ebfbee;
      --warn: #e67700;
      --warn-bg: #fff9db;
      --danger: #c92a2a;
      --danger-bg: #fff5f5;
      --high: #c92a2a;
      --high-bg: #fff5f5;
      --medium: #e67700;
      --medium-bg: #fff9db;
      --low: #2f9e44;
      --low-bg: #ebfbee;
      --sidebar-w: 220px;
      --topbar-h: 52px;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: var(--text);
      background: var(--bg);
      min-height: 100vh;
    }
    a { color: inherit; text-decoration: none; }
    button { font-family: inherit; cursor: pointer; }

    /* ── Topbar ── */
    .topbar {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: var(--topbar-h);
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      padding: 0 16px 0 0;
      z-index: 200;
      gap: 0;
    }
    .topbar-brand {
      width: var(--sidebar-w);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 16px;
      border-right: 1px solid var(--border);
      height: 100%;
    }
    .brand-icon {
      width: 28px; height: 28px;
      background: #1c1c1e;
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px;
    }
    .brand-name { font-size: 13px; font-weight: 700; color: var(--text); }
    .brand-sub { font-size: 11px; color: var(--muted); }
    .topbar-center { flex: 1; padding: 0 16px; }
    .topbar-right {
      display: flex; align-items: center; gap: 10px;
    }
    .topbar-user {
      display: flex; align-items: center; gap: 8px;
    }
    .user-avatar {
      width: 30px; height: 30px;
      background: #1971c2;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: white;
    }
    .user-info { line-height: 1.3; }
    .user-name { font-size: 13px; font-weight: 600; }
    .user-role { font-size: 11px; color: var(--muted); }

    /* ── Sidebar ── */
    .sidebar {
      position: fixed;
      top: var(--topbar-h);
      left: 0;
      width: var(--sidebar-w);
      bottom: 0;
      background: var(--surface);
      border-right: 1px solid var(--border);
      overflow-y: auto;
      padding: 8px 0 24px;
      z-index: 100;
    }
    .nav-section-label {
      padding: 16px 16px 4px;
      font-size: 10px;
      font-weight: 700;
      color: var(--muted);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 16px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text2);
      cursor: pointer;
      border-radius: 0;
      transition: background 0.1s, color 0.1s;
      position: relative;
    }
    .nav-item:hover { background: var(--surface2); color: var(--text); }
    .nav-item.active { background: var(--accent-light); color: var(--accent); font-weight: 600; }
    .nav-item.active::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 3px;
      background: var(--accent);
      border-radius: 0 2px 2px 0;
    }
    .nav-icon { font-size: 15px; width: 18px; text-align: center; flex-shrink: 0; }
    .nav-badge {
      margin-left: auto;
      background: var(--accent);
      color: white;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 10px;
      min-width: 18px;
      text-align: center;
    }

    /* ── Main ── */
    .main {
      margin-left: var(--sidebar-w);
      margin-top: var(--topbar-h);
      min-height: calc(100vh - var(--topbar-h));
      padding: 24px;
    }
    .panel { display: none; }
    .panel.active { display: block; }

    /* ── Page header ── */
    .page-header {
      margin-bottom: 20px;
    }
    .page-title { font-size: 22px; font-weight: 700; color: var(--text); }
    .page-sub { font-size: 13px; color: var(--muted); margin-top: 2px; }

    /* ── Flash ── */
    .flash {
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 16px;
      border: 1px solid;
    }
    .flash.error { background: var(--danger-bg); border-color: #ffc9c9; color: var(--danger); }
    .flash.success { background: var(--success-bg); border-color: #b2f2bb; color: var(--success); }

    /* ── Buttons ── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 6px;
      border: 1px solid transparent;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
      white-space: nowrap;
    }
    .btn:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-primary { background: var(--accent); color: white; }
    .btn-secondary { background: var(--surface); color: var(--text); border-color: var(--border2); }
    .btn-danger { background: var(--danger-bg); color: var(--danger); border-color: #ffc9c9; }
    .btn-success { background: var(--success-bg); color: var(--success); border-color: #b2f2bb; }
    .btn-sm { padding: 5px 10px; font-size: 12px; }
    .btn-icon { padding: 6px; border-radius: 6px; background: transparent; border: 1px solid var(--border); color: var(--muted); font-size: 14px; }
    .btn-icon:hover { background: var(--surface2); color: var(--text); }

    /* ── Toolbar row ── */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .toolbar-left { display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap; }
    .toolbar-right { display: flex; align-items: center; gap: 8px; }

    /* ── View toggle ── */
    .view-toggle {
      display: flex;
      border: 1px solid var(--border2);
      border-radius: 6px;
      overflow: hidden;
    }
    .view-btn {
      padding: 5px 10px;
      background: var(--surface);
      border: none;
      font-size: 13px;
      color: var(--muted);
      cursor: pointer;
      border-right: 1px solid var(--border2);
    }
    .view-btn:last-child { border-right: none; }
    .view-btn.active { background: var(--surface2); color: var(--text); }

    /* ── Kanban board ── */
    .kanban-wrap { overflow-x: auto; }
    .kanban {
      display: flex;
      gap: 12px;
      min-width: max-content;
      align-items: flex-start;
    }
    .kanban-col {
      width: 280px;
      flex-shrink: 0;
      background: var(--surface2);
      border-radius: 10px;
      padding: 0;
      overflow: hidden;
    }
    .kanban-col-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .kanban-col-title {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; color: var(--text2);
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .col-dot { width: 8px; height: 8px; border-radius: 50%; }
    .col-dot.inbox { background: #74c0fc; }
    .col-dot.in-progress { background: #ffd43b; }
    .col-dot.review { background: #a9e34b; }
    .col-dot.done { background: #69db7c; }
    .col-count {
      background: var(--surface2);
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: 10px;
      border: 1px solid var(--border);
    }
    .kanban-col-body { padding: 10px; min-height: 80px; }
    .task-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: box-shadow 0.15s, border-color 0.15s;
    }
    .task-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-color: var(--border2); }
    .task-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .task-card-title { font-size: 13px; font-weight: 500; line-height: 1.4; color: var(--text); flex: 1; }
    .priority-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }
    .priority-badge.high { background: var(--high-bg); color: var(--high); }
    .priority-badge.medium { background: var(--medium-bg); color: var(--medium); }
    .priority-badge.low { background: var(--low-bg); color: var(--low); }
    .task-card-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
    .task-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      background: var(--accent-light);
      color: var(--accent);
      border: 1px solid #d0ebff;
    }
    .task-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 4px;
    }
    .task-assignee {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; color: var(--muted);
    }
    .assignee-dot {
      width: 18px; height: 18px;
      border-radius: 50%;
      background: var(--surface2);
      border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      font-size: 9px;
    }
    .kanban-add-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 8px 10px;
      background: transparent;
      border: none;
      font-size: 12px;
      color: var(--muted);
      cursor: pointer;
      border-radius: 6px;
      margin-top: 2px;
    }
    .kanban-add-btn:hover { background: var(--surface); color: var(--text); }

    /* ── Approval badges ── */
    .approval-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .approval-badge.pending { background: var(--warn-bg); color: var(--warn); }
    .approval-badge.approved { background: var(--success-bg); color: var(--success); }
    .approval-badge.rejected { background: var(--danger-bg); color: var(--danger); }

    /* ── Table ── */
    .table-wrap { overflow-x: auto; }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .data-table th {
      text-align: left;
      padding: 9px 14px;
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.07em;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }
    .data-table th:hover { color: var(--text); }
    .data-table th .sort-icon { opacity: 0.4; margin-left: 4px; }
    .data-table td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table tr:hover td { background: var(--surface2); }
    .data-table-wrap {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }

    /* ── Search / filter bar ── */
    .search-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--surface);
      border: 1px solid var(--border2);
      border-radius: 6px;
      padding: 6px 12px;
      flex: 1;
      max-width: 400px;
    }
    .search-bar input {
      border: none;
      outline: none;
      font-size: 13px;
      color: var(--text);
      background: transparent;
      width: 100%;
    }
    .search-bar input::placeholder { color: var(--muted); }
    .filter-select {
      padding: 6px 10px;
      border: 1px solid var(--border2);
      border-radius: 6px;
      font-size: 13px;
      color: var(--text);
      background: var(--surface);
      outline: none;
      cursor: pointer;
    }

    /* ── Tags ── */
    .color-dot {
      display: inline-block;
      width: 10px; height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .tag-name-cell { display: flex; align-items: center; gap: 8px; }
    .tag-slug { font-size: 11px; color: var(--muted); font-family: monospace; }

    /* ── Agents ── */
    .agent-status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .status-dot.online { background: var(--success); box-shadow: 0 0 5px var(--success); }
    .status-dot.offline { background: var(--muted); }
    .status-dot.busy { background: var(--warn); box-shadow: 0 0 5px var(--warn); }

    /* ── Overview stats ── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 18px;
    }
    .stat-label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px; }
    .stat-value { font-size: 28px; font-weight: 700; color: var(--text); line-height: 1; }
    .stat-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }

    /* ── Card ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px 20px;
      margin-bottom: 16px;
    }
    .card-title { font-size: 14px; font-weight: 700; margin-bottom: 14px; }

    /* ── Gateway ── */
    .gw-status-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .gw-status-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 20px;
      font-size: 13px; font-weight: 600;
    }
    .gw-status-badge.running { background: var(--success-bg); color: var(--success); }
    .gw-status-badge.stopped { background: var(--danger-bg); color: var(--danger); }
    .gw-actions { display: flex; gap: 8px; margin-left: auto; }
    .log-tail {
      margin-top: 14px;
      background: #1a1b1e;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 11px;
      color: #c1c2c5;
      max-height: 180px;
      overflow-y: auto;
    }
    .log-line { padding: 1px 0; line-height: 1.6; }
    .log-line.stderr { color: #ffa8a8; }

    /* ── Live feed ── */
    .feed-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
    }
    .feed-item:last-child { border-bottom: none; }
    .feed-icon {
      width: 30px; height: 30px;
      border-radius: 50%;
      background: var(--accent-light);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
    }
    .feed-body { flex: 1; }
    .feed-event { font-size: 13px; font-weight: 500; color: var(--text); font-family: monospace; }
    .feed-actor { font-size: 12px; color: var(--muted); margin-top: 1px; }
    .feed-time { font-size: 11px; color: var(--muted); white-space: nowrap; }

    /* ── Modal ── */
    .modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 300;
      align-items: center;
      justify-content: center;
    }
    .modal-backdrop.open { display: flex; }
    .modal {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      width: min(500px, calc(100vw - 32px));
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      max-height: calc(100vh - 48px);
      overflow-y: auto;
    }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 18px;
    }
    .modal-title { font-size: 16px; font-weight: 700; }
    .modal-close { background: none; border: none; font-size: 18px; color: var(--muted); cursor: pointer; padding: 2px 6px; border-radius: 4px; }
    .modal-close:hover { background: var(--surface2); color: var(--text); }
    .modal-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }

    /* ── Form ── */
    .field { margin-bottom: 14px; }
    .field label { display: block; font-size: 12px; font-weight: 600; color: var(--text2); margin-bottom: 5px; }
    .field input, .field textarea, .field select {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--border2);
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
      color: var(--text);
      background: var(--surface);
      outline: none;
      transition: border-color 0.15s;
    }
    .field input:focus, .field textarea:focus, .field select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(25,113,194,0.1);
    }
    .field textarea { resize: vertical; min-height: 80px; }
    .field select option { background: var(--surface); }
    .color-field { display: flex; align-items: center; gap: 8px; }
    .color-field input[type="color"] { width: 36px; height: 36px; padding: 2px; border-radius: 6px; cursor: pointer; }

    /* ── Empty state ── */
    .empty {
      text-align: center;
      padding: 48px 24px;
      color: var(--muted);
    }
    .empty-icon { font-size: 40px; margin-bottom: 12px; }
    .empty-title { font-size: 15px; font-weight: 600; color: var(--text2); margin-bottom: 6px; }
    .empty-sub { font-size: 13px; }

    /* ── Spinner ── */
    .spinner {
      display: inline-block;
      width: 16px; height: 16px;
      border: 2px solid var(--border2);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Boards list ── */
    .boards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 14px;
    }
    .board-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      cursor: pointer;
      transition: box-shadow 0.15s, border-color 0.15s;
    }
    .board-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.08); border-color: var(--accent); }
    .board-card-name { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
    .board-card-desc { font-size: 12px; color: var(--muted); margin-bottom: 10px; min-height: 18px; }
    .board-card-meta { display: flex; gap: 8px; font-size: 11px; color: var(--muted); align-items: center; }
    .board-status-badge {
      padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;
    }
    .board-status-badge.active { background: var(--success-bg); color: var(--success); }
    .board-status-badge.archived { background: var(--surface2); color: var(--muted); }

    /* ── Pagination ── */
    .pagination { display: flex; gap: 6px; justify-content: flex-end; margin-top: 12px; }

    /* ── Integration tabs ── */
    .itab-active { background: var(--accent) !important; color: white !important; border-color: var(--accent) !important; }

    /* ── Integration channel cards ── */
    .int-channel-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
    }
    .int-channel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:10px; }
    .int-channel-title { display:flex; align-items:flex-start; gap:10px; }
    .int-channel-name { font-weight:700; font-size:14px; color:var(--text); }
    .int-channel-desc { font-size:12px; color:var(--muted); margin-top:2px; }
    .int-badge { display:inline-flex; align-items:center; padding:3px 9px; border-radius:20px; font-size:11px; font-weight:700; border:1px solid var(--border); background:var(--surface2); color:var(--muted); }
    .int-badge.on { background:var(--success-bg); color:var(--success); border-color:#b2f2bb; }
    .int-badge.off { background:var(--surface2); color:var(--muted); }
    .int-channel-form { display:grid; gap:10px; }
    .int-field { display:flex; flex-direction:column; gap:4px; }
    .int-field label { font-size:12px; font-weight:600; color:var(--text2); }
    .int-field input { padding:7px 10px; border:1px solid var(--border2); border-radius:6px; font-size:13px; color:var(--text); background:var(--surface); outline:none; transition:border-color 0.15s; }
    .int-field input:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(25,113,194,0.1); }
    .int-fields-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    @media (max-width:600px) { .int-fields-grid { grid-template-columns:1fr; } }
    .int-channels-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .sidebar { transform: translateX(-100%); }
      .main { margin-left: 0; }
    }
  </style>
</head>
<body>

  <!-- ── Topbar ── -->
  <header class="topbar">
    <div class="topbar-brand">
      <div class="brand-icon">⚡</div>
      <div>
        <div class="brand-name">OPENCLAW</div>
        <div class="brand-sub">Mission Control</div>
      </div>
    </div>
    <div class="topbar-center"></div>
    <div class="topbar-right">
      <div class="topbar-user">
        <div class="user-avatar" id="user-avatar-initials">?</div>
        <div class="user-info">
          <div class="user-name" id="user-display-name">${escapeHtml(userEmail || 'User')}</div>
          <div class="user-role">Operator</div>
        </div>
      </div>
      <form method="POST" action="/auth/logout" style="margin-left:8px;">
        <button class="btn btn-secondary btn-sm" type="submit">Sign out</button>
      </form>
    </div>
  </header>

  <!-- ── Sidebar ── -->
  <nav class="sidebar">
    <div class="nav-section-label">Overview</div>
    <div class="nav-item" data-panel="dashboard"><span class="nav-icon">⊞</span> Dashboard</div>
    <div class="nav-item" data-panel="live-feed"><span class="nav-icon">⚡</span> Live feed</div>

    <div class="nav-section-label">Boards</div>
    <div class="nav-item" data-panel="board-groups"><span class="nav-icon">▤</span> Board groups</div>
    <div class="nav-item active" data-panel="boards"><span class="nav-icon">◫</span> Boards</div>
    <div class="nav-item" data-panel="tags"><span class="nav-icon">🏷</span> Tags</div>
    <div class="nav-item" data-panel="approvals"><span class="nav-icon">◎</span> Approvals</div>
    <div class="nav-item" data-panel="custom-fields"><span class="nav-icon">⊞</span> Custom fields</div>

    <div class="nav-section-label">Skills</div>
    <div class="nav-item" data-panel="marketplace"><span class="nav-icon">⊕</span> Marketplace</div>
    <div class="nav-item" data-panel="packs"><span class="nav-icon">⊟</span> Packs</div>

    <div class="nav-section-label">Automation</div>
    <div class="nav-item" data-panel="prompts"><span class="nav-icon">⚡</span> Prompts</div>

    <div class="nav-section-label">Integrations</div>
    <div class="nav-item" data-panel="integrations"><span class="nav-icon">🔌</span> Integrations</div>

    <div class="nav-section-label">Administration</div>
    <div class="nav-item" data-panel="organization"><span class="nav-icon">⊞</span> Organization</div>
    <div class="nav-item" data-panel="gateways"><span class="nav-icon">⊞</span> Gateways</div>
    <div class="nav-item" data-panel="agents"><span class="nav-icon">◉</span> Agents</div>

    <div class="nav-section-label" style="margin-top:8px;"></div>
    <div class="nav-item" onclick="window.location='/lite'"><span class="nav-icon">↗</span> Lite Panel</div>
  </nav>

  <!-- ── Main ── -->
  <main class="main">
    ${errHtml}
    <div id="flash-area"></div>

    <!-- Dashboard / Overview -->
    <div id="panel-dashboard" class="panel">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div class="page-title">Dashboard</div>
          <div class="page-sub">System overview and recent activity.</div>
        </div>
        <a class="btn btn-secondary" href="/openclaw" target="_blank" rel="noreferrer">↗ Open console</a>
      </div>
      <div class="stats-grid" id="ov-stats">
        <div class="stat-card"><div class="stat-label">Gateway</div><div class="stat-value" id="ov-gw">—</div><div class="stat-sub" id="ov-gw-uptime"></div></div>
        <div class="stat-card"><div class="stat-label">Open Tasks</div><div class="stat-value" id="ov-tasks">—</div><div class="stat-sub">todo + in-progress</div></div>
        <div class="stat-card"><div class="stat-label">Pending Approvals</div><div class="stat-value" id="ov-approvals">—</div><div class="stat-sub">awaiting decision</div></div>
        <div class="stat-card"><div class="stat-label">Active Agents</div><div class="stat-value" id="ov-agents">—</div><div class="stat-sub">registered agents</div></div>
        <div class="stat-card"><div class="stat-label">Sessions</div><div class="stat-value" id="ov-sessions">—</div><div class="stat-sub">gateway sessions</div></div>
      </div>
      <div class="card">
        <div class="card-title">Recent Activity</div>
        <div id="ov-feed"><span class="spinner"></span></div>
      </div>
    </div>

    <!-- Live Feed -->
    <div id="panel-live-feed" class="panel">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="page-title">Live feed</div>
          <div class="page-sub">Real-time audit event stream.</div>
        </div>
        <button class="btn btn-secondary" onclick="loadLiveFeed()">↻ Refresh</button>
      </div>
      <div class="card" id="live-feed-list"><span class="spinner"></span></div>
    </div>

    <!-- Board Groups -->
    <div id="panel-board-groups" class="panel">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="page-title">Board groups</div>
          <div class="page-sub">Organize boards into groups.</div>
        </div>
        <button class="btn btn-primary" onclick="openGroupModal()">+ New group</button>
      </div>
      <div id="groups-list"><span class="spinner"></span></div>
    </div>

    <!-- Boards -->
    <div id="panel-boards" class="panel active">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div class="page-title" id="boards-page-title">Boards</div>
          <div class="page-sub">Manage your work boards.</div>
        </div>
        <button class="btn btn-primary" onclick="openBoardModal()">+ New board</button>
      </div>
      <div id="boards-list"><span class="spinner"></span></div>
    </div>

    <!-- Tasks / Kanban -->
    <div id="panel-kanban" class="panel">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div class="page-title" id="kanban-title">Board</div>
          <div class="page-sub" id="kanban-sub">Keep tasks moving through your workflow.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <div class="view-toggle">
            <button class="view-btn active" id="view-board-btn" onclick="setView('board')">⊞ Board</button>
            <button class="view-btn" id="view-list-btn" onclick="setView('list')">≡ List</button>
          </div>
          <button class="btn btn-primary" onclick="openTaskModal()">+ New task</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="toolbar-left">
          <div id="kanban-agent-filters" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
        </div>
        <div class="toolbar-right">
          <button class="btn-icon" title="Filter" onclick="toggleFilterBar()">⊟</button>
          <button class="btn-icon" title="Group" onclick="">⊞</button>
          <button class="btn-icon" title="Settings" onclick="">⚙</button>
        </div>
      </div>
      <!-- Board view -->
      <div id="kanban-board-view">
        <div class="kanban-wrap">
          <div class="kanban" id="kanban-cols"></div>
        </div>
      </div>
      <!-- List view -->
      <div id="kanban-list-view" style="display:none;">
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assignee</th>
                <th>Tags</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="task-list-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tags -->
    <div id="panel-tags" class="panel">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="page-title">Tags</div>
          <div class="page-sub" id="tags-sub">Loading…</div>
        </div>
        <button class="btn btn-primary" onclick="openTagModal()">+ New tag</button>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tag ↑</th>
              <th>Color ↕</th>
              <th>Tasks ↕</th>
              <th>Updated ↕</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="tags-tbody"></tbody>
        </table>
      </div>
    </div>

    <!-- Approvals -->
    <div id="panel-approvals" class="panel">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="page-title">Approvals</div>
          <div class="page-sub">Governance and approval requests.</div>
        </div>
        <button class="btn btn-primary" onclick="openApprovalModal()">+ Request approval</button>
      </div>
      <div id="approvals-list"><span class="spinner"></span></div>
    </div>

    <!-- Custom Fields (placeholder) -->
    <div id="panel-custom-fields" class="panel">
      <div class="page-header">
        <div class="page-title">Custom fields</div>
        <div class="page-sub">Define custom metadata fields for tasks.</div>
      </div>
      <div class="empty">
        <div class="empty-icon">⊞</div>
        <div class="empty-title">Custom fields coming soon</div>
        <div class="empty-sub">Define custom metadata fields to attach to tasks and boards.</div>
      </div>
    </div>

    <!-- Marketplace -->
    <div id="panel-marketplace" class="panel">
      <div class="page-header">
        <div class="page-title">Skills Marketplace</div>
        <div class="page-sub" id="marketplace-sub">Loading…</div>
      </div>
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-bar">
            <span>🔍</span>
            <input type="text" id="marketplace-search" placeholder="Search by name, description, category, pack, source…" oninput="filterMarketplace()"/>
          </div>
          <select class="filter-select" id="marketplace-category" onchange="filterMarketplace()">
            <option value="">All categories</option>
          </select>
          <select class="filter-select" id="marketplace-risk" onchange="filterMarketplace()">
            <option value="">Risk</option>
            <option value="safe">Safe</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Skill ↑</th>
              <th>Pack ↕</th>
              <th>Category ↕</th>
              <th>Risk ↕</th>
              <th>Source ↕</th>
              <th>Installed on ↕</th>
              <th>Updated ↕</th>
            </tr>
          </thead>
          <tbody id="marketplace-tbody"></tbody>
        </table>
      </div>
    </div>

    <!-- Packs (placeholder) -->
    <div id="panel-packs" class="panel">
      <div class="page-header">
        <div class="page-title">Packs</div>
        <div class="page-sub">Skill packs bundled for deployment.</div>
      </div>
      <div class="empty">
        <div class="empty-icon">⊟</div>
        <div class="empty-title">No packs configured</div>
        <div class="empty-sub">Packs bundle multiple skills for easy deployment.</div>
      </div>
    </div>

    <!-- Organization (placeholder) -->
    <div id="panel-organization" class="panel">
      <div class="page-header">
        <div class="page-title">Organization</div>
        <div class="page-sub">Manage your organization settings.</div>
      </div>
      <div class="empty">
        <div class="empty-icon">⊞</div>
        <div class="empty-title">Organization settings</div>
        <div class="empty-sub">Configure organization-level settings, members, and billing.</div>
      </div>
    </div>

    <!-- Gateways -->
    <div id="panel-gateways" class="panel">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="page-title">Gateways</div>
          <div class="page-sub">Connect and operate gateway integrations.</div>
        </div>
        <button class="btn btn-secondary" onclick="loadGateway()">↻ Refresh</button>
      </div>
      <div class="card" id="gw-card">
        <div class="gw-status-row">
          <div id="gw-status-badge" class="gw-status-badge stopped"><span class="status-dot offline"></span> Loading…</div>
          <div id="gw-uptime-text" style="font-size:12px;color:var(--muted);"></div>
          <div class="gw-actions">
            <button class="btn btn-success btn-sm" onclick="gwAction('start')" id="gw-start">▶ Start</button>
            <button class="btn btn-danger btn-sm" onclick="gwAction('stop')" id="gw-stop">■ Stop</button>
            <button class="btn btn-secondary btn-sm" onclick="gwAction('restart')" id="gw-restart">↻ Restart</button>
          </div>
        </div>
        <div class="log-tail" id="gw-log-tail"><span style="color:#6c757d;">Loading logs…</span></div>
        <div style="margin-top:10px;font-size:12px;color:var(--muted);">Full gateway management: <a href="/lite" style="color:var(--accent);">/lite</a></div>
      </div>
    </div>

    <!-- Agents -->
    <div id="panel-agents" class="panel">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="page-title">Agents</div>
          <div class="page-sub" id="agents-sub">Loading…</div>
        </div>
        <button class="btn btn-primary" onclick="openAgentModal()">+ Add agent</button>
      </div>
      <div id="agents-list"><span class="spinner"></span></div>
    </div>

    <!-- Integrations -->
    <div id="panel-integrations" class="panel">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div class="page-title">Integrations</div>
          <div class="page-sub">Manage channels and external connectors.</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary" id="itab-channels" onclick="setIntegrationTab('channels')">Channels</button>
          <button class="btn btn-secondary" id="itab-connectors" onclick="setIntegrationTab('connectors')">Connectors</button>
        </div>
      </div>

      <!-- Channels sub-panel -->
      <div id="ipanel-channels">
        <div id="integrations-channels-content"><span class="spinner"></span></div>
      </div>

      <!-- Connectors sub-panel -->
      <div id="ipanel-connectors" style="display:none;">
        <div class="page-sub" style="margin-bottom:12px;">Powered by Composio. Connections are configured server-side.</div>
        <div id="integrations-connectors-error" class="flash error" style="display:none;"></div>
        <div id="integrations-connectors-loading" style="color:var(--muted);font-size:13px;">Loading…</div>
        <input type="search" id="integrations-connectors-search" placeholder="Search connectors…" style="width:100%;max-width:320px;margin-bottom:12px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:inherit;font-size:14px;" />
        <div id="integrations-connectors-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;"></div>
      </div>
    </div>

    <!-- Prompts -->
    <div id="panel-prompts" class="panel">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="page-title">Prompts</div>
          <div class="page-sub">Saved /shortcodes — launch agents, run workflows, and trigger edge functions from the bot.</div>
        </div>
        <button class="btn btn-primary" onclick="openPromptModal()">+ New prompt</button>
      </div>
      <div id="prompts-tip" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#0369a1;">
        <strong>How it works:</strong> Save a workflow, agent launch, or edge function as a <code>/shortcode</code>. Then type <code>/shortcode</code> in the bot to run it instantly.
        <br>Example: <code>/project-doc-planner</code> → runs the project-doc-planner workflow.
      </div>
      <div id="prompts-list"><span class="spinner"></span></div>
    </div>

  </main>

  <!-- ── Board Modal ── -->
  <div class="modal-backdrop" id="board-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title" id="board-modal-title">New Board</div>
        <button class="modal-close" onclick="closeModal('board-modal')">✕</button>
      </div>
      <input type="hidden" id="board-modal-id"/>
      <div class="field"><label>Name *</label><input id="board-name" type="text" placeholder="e.g. Sprint 1"/></div>
      <div class="field"><label>Description</label><textarea id="board-desc" placeholder="Optional description…"></textarea></div>
      <div class="field"><label>Group</label>
        <select id="board-group-id"><option value="">No group</option></select>
      </div>
      <div class="field"><label>Status</label>
        <select id="board-status"><option value="active">Active</option><option value="archived">Archived</option></select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('board-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveBoard()">Save board</button>
      </div>
    </div>
  </div>

  <!-- ── Task Modal ── -->
  <div class="modal-backdrop" id="task-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title" id="task-modal-title">New Task</div>
        <button class="modal-close" onclick="closeModal('task-modal')">✕</button>
      </div>
      <input type="hidden" id="task-modal-id"/>
      <input type="hidden" id="task-modal-board-id"/>
      <div class="field"><label>Title *</label><input id="task-title" type="text" placeholder="Task title…"/></div>
      <div class="field"><label>Description</label><textarea id="task-desc" placeholder="Optional description…"></textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label>Column</label>
          <select id="task-column-status">
            <option value="inbox">Inbox</option>
            <option value="in-progress">In Progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div class="field"><label>Priority</label>
          <select id="task-priority">
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Assignee Agent</label><input id="task-agent" type="text" placeholder="e.g. Backend Engineer"/></div>
      <div class="field"><label>Tags (comma-separated)</label><input id="task-tags" type="text" placeholder="e.g. CI, Security"/></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('task-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveTask()">Save task</button>
      </div>
    </div>
  </div>

  <!-- ── Approval Modal ── -->
  <div class="modal-backdrop" id="approval-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Request Approval</div>
        <button class="modal-close" onclick="closeModal('approval-modal')">✕</button>
      </div>
      <div class="field"><label>Action Type *</label><input id="approval-type" type="text" placeholder="e.g. gateway.restart, config.change"/></div>
      <div class="field"><label>Description</label><textarea id="approval-payload" placeholder="Describe what needs approval…"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('approval-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveApproval()">Submit request</button>
      </div>
    </div>
  </div>

  <!-- ── Tag Modal ── -->
  <div class="modal-backdrop" id="tag-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title" id="tag-modal-title">New Tag</div>
        <button class="modal-close" onclick="closeModal('tag-modal')">✕</button>
      </div>
      <input type="hidden" id="tag-modal-id"/>
      <div class="field"><label>Name *</label><input id="tag-name" type="text" placeholder="e.g. CI, Security"/></div>
      <div class="field">
        <label>Color</label>
        <div class="color-field">
          <input type="color" id="tag-color" value="#4587280"/>
          <input type="text" id="tag-color-text" placeholder="#4587280" oninput="syncColorText()" style="flex:1;"/>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('tag-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveTag()">Save tag</button>
      </div>
    </div>
  </div>

  <!-- ── Agent Modal ── -->
  <div class="modal-backdrop" id="agent-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title" id="agent-modal-title">Add Agent</div>
        <button class="modal-close" onclick="closeModal('agent-modal')">✕</button>
      </div>
      <input type="hidden" id="agent-modal-id"/>
      <div class="field"><label>Name *</label><input id="agent-name" type="text" placeholder="e.g. Backend Engineer"/></div>
      <div class="field"><label>Role</label><input id="agent-role" type="text" placeholder="e.g. General AI"/></div>
      <div class="field"><label>Board</label>
        <select id="agent-board-id"><option value="">No board</option></select>
      </div>
      <div class="field"><label>Status</label>
        <select id="agent-status">
          <option value="offline">Offline</option>
          <option value="online">Online</option>
          <option value="busy">Busy</option>
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('agent-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveAgent()">Save agent</button>
      </div>
    </div>
  </div>

  <!-- ── Prompt Modal ── -->
  <div class="modal-backdrop" id="prompt-modal">
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <div class="modal-title" id="prompt-modal-title">New Prompt</div>
        <button class="modal-close" onclick="closeModal('prompt-modal')">✕</button>
      </div>
      <input type="hidden" id="prompt-modal-slug"/>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label>Name *</label><input id="prompt-name" type="text" placeholder="e.g. SEO Agent"/></div>
        <div class="field"><label>Shortcode * <span style="color:#64748b;font-weight:400;">(no /)</span></label><input id="prompt-slug" type="text" placeholder="e.g. seo-agent"/></div>
      </div>
      <div class="field"><label>Description</label><input id="prompt-desc" type="text" placeholder="What does this prompt do?"/></div>
      <div class="field"><label>Type</label>
        <select id="prompt-type" onchange="onPromptTypeChange()">
          <option value="workflow">Workflow — run a Supabase edge function workflow</option>
          <option value="agent_launch">Agent Launch — start a conversation with a Sparti agent</option>
          <option value="chat">Chat — send a message to a Sparti agent</option>
          <option value="edge_fn">Edge Function — call any Supabase edge function</option>
          <option value="composite">Composite — run multiple steps in sequence</option>
        </select>
      </div>
      <div class="field">
        <label>Payload <span style="color:#64748b;font-weight:400;">(JSON)</span></label>
        <textarea id="prompt-payload" rows="6" placeholder='{"edge_fn_slug":"workflow-ai","workflow":"project-doc-planner"}'
          style="font-family:monospace;font-size:12px;"></textarea>
        <div id="prompt-payload-hint" style="font-size:11px;color:#64748b;margin-top:4px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('prompt-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="savePrompt()">Save prompt</button>
      </div>
    </div>
  </div>

  <!-- ── Group Modal ── -->
  <div class="modal-backdrop" id="group-modal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title" id="group-modal-title">New Board Group</div>
        <button class="modal-close" onclick="closeModal('group-modal')">✕</button>
      </div>
      <input type="hidden" id="group-modal-id"/>
      <div class="field"><label>Name *</label><input id="group-name" type="text" placeholder="e.g. Engineering"/></div>
      <div class="field"><label>Description</label><textarea id="group-desc" placeholder="Optional description…"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('group-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveGroup()">Save group</button>
      </div>
    </div>
  </div>

  <script>
    // ── State ──────────────────────────────────────────────────────────────────
    let currentBoardId = null;
    let currentBoardName = '';
    let allBoards = [];
    let allTasks = [];
    let allSkills = [];
    let currentView = 'board';

    // ── User avatar initials ───────────────────────────────────────────────────
    (function() {
      const email = ${JSON.stringify(userEmail || '')};
      if (email) {
        const initials = email.split('@')[0].slice(0, 2).toUpperCase();
        document.getElementById('user-avatar-initials').textContent = initials;
        document.getElementById('user-display-name').textContent = email.split('@')[0];
      }
    })();

    // ── Flash ──────────────────────────────────────────────────────────────────
    function showFlash(msg, type = 'success') {
      const area = document.getElementById('flash-area');
      const el = document.createElement('div');
      el.className = 'flash ' + type;
      el.textContent = msg;
      area.appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.4s'; setTimeout(() => el.remove(), 400); }, 3500);
    }

    // ── Navigation ─────────────────────────────────────────────────────────────
    const navItems = document.querySelectorAll('.nav-item[data-panel]');
    function setPanel(name) {
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('panel-' + name);
      if (panel) panel.classList.add('active');
      navItems.forEach(n => n.classList.toggle('active', n.dataset.panel === name));
      history.replaceState(null, '', '#' + name);
      if (name === 'dashboard') loadDashboard();
      if (name === 'live-feed') loadLiveFeed();
      if (name === 'board-groups') loadGroups();
      if (name === 'boards') loadBoards();
      if (name === 'tags') loadTags();
      if (name === 'approvals') loadApprovals();
      if (name === 'marketplace') loadMarketplace();
      if (name === 'gateways') loadGateway();
      if (name === 'agents') loadAgents();
      if (name === 'prompts') loadPrompts();
      if (name === 'integrations') {
        setIntegrationTab(currentIntTab);
      }
    }
    navItems.forEach(n => n.addEventListener('click', () => setPanel(n.dataset.panel)));

    // ── API helper ─────────────────────────────────────────────────────────────
    async function api(method, path, body) {
      const opts = { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
      if (body !== undefined) opts.body = JSON.stringify(body);
      const res = await fetch(path, opts);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
      return json;
    }

    // ── Modal helpers ──────────────────────────────────────────────────────────
    function openModal(id) { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }
    document.querySelectorAll('.modal-backdrop').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    });

    // ── Utilities ──────────────────────────────────────────────────────────────
    function esc(s) {
      return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
    }
    function toJson(v) { return esc(JSON.stringify(v)); }
    function fmtDate(s) {
      if (!s) return '';
      try {
        const d = new Date(s);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
               d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      } catch { return s; }
    }
    function fmtUptime(ms) {
      if (!ms) return '';
      const s = Math.floor(ms / 1000);
      if (s < 60) return s + 's';
      const m = Math.floor(s / 60);
      if (m < 60) return m + 'm ' + (s % 60) + 's';
      const h = Math.floor(m / 60);
      return h + 'h ' + (m % 60) + 'm';
    }
    function priorityBadge(p) {
      const label = (p || 'medium').toUpperCase();
      return \`<span class="priority-badge \${esc(p || 'medium')}">\${label}</span>\`;
    }
    function approvalBadge(s) {
      return \`<span class="approval-badge \${esc(s)}">\${esc(s)}</span>\`;
    }
    function feedIcon(eventType) {
      if (eventType.startsWith('board')) return '◫';
      if (eventType.startsWith('task')) return '✓';
      if (eventType.startsWith('approval')) return '◎';
      if (eventType.startsWith('agent')) return '◉';
      if (eventType.startsWith('tag')) return '🏷';
      return '⚡';
    }

    // ── Dashboard ──────────────────────────────────────────────────────────────
    async function loadDashboard() {
      try {
        const data = await api('GET', '/mission-control/api/overview');
        const gw = data.gateway || {};
        const gwEl = document.getElementById('ov-gw');
        gwEl.innerHTML = gw.gatewayRunning
          ? '<span style="color:var(--success);">Running</span>'
          : '<span style="color:var(--danger);">Stopped</span>';
        document.getElementById('ov-gw-uptime').textContent = gw.uptime ? fmtUptime(gw.uptime) : '';
        document.getElementById('ov-tasks').textContent = data.openTasks ?? '—';
        document.getElementById('ov-approvals').textContent = data.pendingApprovals ?? '—';
        document.getElementById('ov-sessions').textContent = data.sessions ?? '—';

        // agent count
        try {
          const ag = await api('GET', '/mission-control/api/agents');
          document.getElementById('ov-agents').textContent = (ag.agents || []).length;
        } catch { document.getElementById('ov-agents').textContent = '—'; }

        const feedEl = document.getElementById('ov-feed');
        const events = data.recentAudit || [];
        if (events.length === 0) {
          feedEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0;">No recent activity.</div>';
        } else {
          feedEl.innerHTML = events.map(e => \`
            <div class="feed-item">
              <div class="feed-icon">\${feedIcon(e.event_type)}</div>
              <div class="feed-body">
                <div class="feed-event">\${esc(e.event_type)}</div>
                <div class="feed-actor">\${esc(e.actor || 'system')}</div>
              </div>
              <div class="feed-time">\${fmtDate(e.created_at)}</div>
            </div>
          \`).join('');
        }
      } catch (err) {
        showFlash('Failed to load dashboard: ' + err.message, 'error');
      }
    }

    // ── Live Feed ──────────────────────────────────────────────────────────────
    async function loadLiveFeed() {
      const el = document.getElementById('live-feed-list');
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const data = await api('GET', '/mission-control/api/live-feed?limit=50');
        const events = data.events || [];
        if (events.length === 0) {
          el.innerHTML = '<div class="empty"><div class="empty-icon">⚡</div><div class="empty-title">No events yet</div><div class="empty-sub">Activity will appear here as you use Mission Control.</div></div>';
          return;
        }
        el.innerHTML = events.map(e => \`
          <div class="feed-item">
            <div class="feed-icon">\${feedIcon(e.event_type)}</div>
            <div class="feed-body">
              <div class="feed-event">\${esc(e.event_type)}</div>
              <div class="feed-actor">\${esc(e.actor || 'system')} · \${esc(JSON.stringify(e.payload || {})).slice(0, 80)}</div>
            </div>
            <div class="feed-time">\${fmtDate(e.created_at)}</div>
          </div>
        \`).join('');
      } catch (err) {
        el.innerHTML = \`<div class="flash error">Failed to load feed: \${esc(err.message)}</div>\`;
      }
    }

    // ── Board Groups ───────────────────────────────────────────────────────────
    async function loadGroups() {
      const el = document.getElementById('groups-list');
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const data = await api('GET', '/mission-control/api/board-groups');
        const groups = data.groups || [];
        if (groups.length === 0) {
          el.innerHTML = \`<div class="empty"><div class="empty-icon">▤</div><div class="empty-title">No board groups yet</div><div class="empty-sub">Create a group to organize related boards together.</div></div>\`;
          return;
        }
        el.innerHTML = \`<div class="boards-grid">\${groups.map(g => \`
          <div class="board-card" onclick="openGroupModal(\${toJson(g)})">
            <div class="board-card-name">\${esc(g.name)}</div>
            <div class="board-card-desc">\${esc(g.description || '')}</div>
            <div class="board-card-meta">\${fmtDate(g.created_at)}</div>
          </div>
        \`).join('')}</div>\`;
      } catch (err) {
        el.innerHTML = \`<div class="flash error">Failed to load groups: \${esc(err.message)}</div>\`;
      }
    }

    function openGroupModal(group) {
      document.getElementById('group-modal-title').textContent = group ? 'Edit Group' : 'New Board Group';
      document.getElementById('group-modal-id').value = group?.id || '';
      document.getElementById('group-name').value = group?.name || '';
      document.getElementById('group-desc').value = group?.description || '';
      openModal('group-modal');
    }

    async function saveGroup() {
      const id = document.getElementById('group-modal-id').value;
      const name = document.getElementById('group-name').value.trim();
      const description = document.getElementById('group-desc').value.trim();
      if (!name) { showFlash('Name is required.', 'error'); return; }
      try {
        if (id) {
          await api('PATCH', \`/mission-control/api/board-groups/\${id}\`, { name, description });
          showFlash('Group updated.');
        } else {
          await api('POST', '/mission-control/api/board-groups', { name, description });
          showFlash('Group created.');
        }
        closeModal('group-modal');
        loadGroups();
        populateGroupSelect();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    async function populateGroupSelect() {
      try {
        const data = await api('GET', '/mission-control/api/board-groups');
        const sel = document.getElementById('board-group-id');
        const cur = sel.value;
        sel.innerHTML = '<option value="">No group</option>' + (data.groups || []).map(g =>
          \`<option value="\${esc(g.id)}" \${g.id === cur ? 'selected' : ''}>\${esc(g.name)}</option>\`
        ).join('');
      } catch { /* non-fatal */ }
    }

    // ── Boards ─────────────────────────────────────────────────────────────────
    async function loadBoards() {
      const el = document.getElementById('boards-list');
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const data = await api('GET', '/mission-control/api/boards');
        allBoards = data.boards || [];
        populateBoardSelects(allBoards);
        if (allBoards.length === 0) {
          el.innerHTML = \`<div class="empty"><div class="empty-icon">◫</div><div class="empty-title">No boards yet</div><div class="empty-sub">Create a board to start organizing tasks.</div></div>\`;
          return;
        }
        el.innerHTML = \`<div class="boards-grid">\${allBoards.map(b => \`
          <div class="board-card" onclick="openBoard('\${esc(b.id)}', '\${esc(b.name)}')">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div class="board-card-name">\${esc(b.name)}</div>
              <span class="board-status-badge \${esc(b.status || 'active')}">\${esc(b.status || 'active')}</span>
            </div>
            <div class="board-card-desc">\${esc(b.description || '')}</div>
            <div class="board-card-meta">
              <span>\${fmtDate(b.created_at)}</span>
              <span style="margin-left:auto;">
                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();openBoardModal(\${toJson(b)})">Edit</button>
                <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="event.stopPropagation();deleteBoard('\${esc(b.id)}')">Delete</button>
              </span>
            </div>
          </div>
        \`).join('')}</div>\`;
      } catch (err) {
        el.innerHTML = \`<div class="flash error">Failed to load boards: \${esc(err.message)}</div>\`;
      }
    }

    function populateBoardSelects(boards) {
      ['agent-board-id'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">No board</option>' + boards.map(b =>
          \`<option value="\${esc(b.id)}" \${b.id === cur ? 'selected' : ''}>\${esc(b.name)}</option>\`
        ).join('');
      });
    }

    function openBoard(id, name) {
      currentBoardId = id;
      currentBoardName = name;
      document.getElementById('kanban-title').textContent = name;
      document.getElementById('kanban-sub').textContent = 'Keep tasks moving through your workflow.';
      setPanel('kanban');
      loadTasks(id);
    }

    function openBoardModal(board) {
      document.getElementById('board-modal-title').textContent = board ? 'Edit Board' : 'New Board';
      document.getElementById('board-modal-id').value = board?.id || '';
      document.getElementById('board-name').value = board?.name || '';
      document.getElementById('board-desc').value = board?.description || '';
      document.getElementById('board-status').value = board?.status || 'active';
      document.getElementById('board-group-id').value = board?.group_id || '';
      populateGroupSelect();
      openModal('board-modal');
    }

    async function saveBoard() {
      const id = document.getElementById('board-modal-id').value;
      const name = document.getElementById('board-name').value.trim();
      const description = document.getElementById('board-desc').value.trim();
      const status = document.getElementById('board-status').value;
      const group_id = document.getElementById('board-group-id').value || null;
      if (!name) { showFlash('Board name is required.', 'error'); return; }
      try {
        if (id) {
          await api('PATCH', \`/mission-control/api/boards/\${id}\`, { name, description, status, group_id });
          showFlash('Board updated.');
        } else {
          await api('POST', '/mission-control/api/boards', { name, description, group_id });
          showFlash('Board created.');
        }
        closeModal('board-modal');
        loadBoards();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    async function deleteBoard(id) {
      if (!confirm('Delete this board and all its tasks?')) return;
      try {
        await api('DELETE', \`/mission-control/api/boards/\${id}\`);
        showFlash('Board deleted.');
        loadBoards();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    // ── Tasks / Kanban ─────────────────────────────────────────────────────────
    async function loadTasks(boardId) {
      if (!boardId) return;
      currentBoardId = boardId;
      const colsEl = document.getElementById('kanban-cols');
      const listEl = document.getElementById('task-list-tbody');
      colsEl.innerHTML = '<span class="spinner"></span>';
      try {
        const data = await api('GET', \`/mission-control/api/boards/\${boardId}/tasks\`);
        allTasks = data.tasks || [];
        renderKanban(allTasks);
        renderTaskList(allTasks);
        renderAgentFilters(allTasks);
      } catch (err) {
        colsEl.innerHTML = \`<div class="flash error">Failed to load tasks: \${esc(err.message)}</div>\`;
      }
    }

    function renderKanban(tasks) {
      const cols = { inbox: [], 'in-progress': [], review: [], done: [] };
      tasks.forEach(t => {
        const col = t.column_status || (t.status === 'done' ? 'done' : t.status === 'in-progress' ? 'in-progress' : 'inbox');
        if (cols[col]) cols[col].push(t); else cols.inbox.push(t);
      });
      const colDefs = [
        { key: 'inbox', label: 'Inbox' },
        { key: 'in-progress', label: 'In Progress' },
        { key: 'review', label: 'Review' },
        { key: 'done', label: 'Done' },
      ];
      document.getElementById('kanban-cols').innerHTML = colDefs.map(({ key, label }) => \`
        <div class="kanban-col">
          <div class="kanban-col-header">
            <div class="kanban-col-title">
              <span class="col-dot \${key}"></span>
              \${label}
            </div>
            <span class="col-count">\${cols[key].length}</span>
          </div>
          <div class="kanban-col-body">
            \${cols[key].map(t => \`
              <div class="task-card" onclick="openTaskModal(\${toJson(t)})">
                <div class="task-card-top">
                  <div class="task-card-title">\${esc(t.title)}</div>
                  \${priorityBadge(t.priority)}
                </div>
                \${(t.tags || []).length ? \`<div class="task-card-tags">\${(t.tags || []).map(tag => \`<span class="task-tag">\${esc(tag)}</span>\`).join('')}</div>\` : ''}
                <div class="task-card-footer">
                  \${t.assignee_agent ? \`<div class="task-assignee"><div class="assignee-dot">◉</div>\${esc(t.assignee_agent)}</div>\` : '<div></div>'}
                </div>
              </div>
            \`).join('')}
            <button class="kanban-add-btn" onclick="openTaskModal(null, '\${key}')">+ Add task</button>
          </div>
        </div>
      \`).join('');
    }

    function renderTaskList(tasks) {
      const tbody = document.getElementById('task-list-tbody');
      if (!tasks.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">No tasks.</td></tr>';
        return;
      }
      tbody.innerHTML = tasks.map(t => \`
        <tr>
          <td><span style="font-weight:500;">\${esc(t.title)}</span></td>
          <td><span class="approval-badge \${t.column_status === 'done' ? 'approved' : 'pending'}">\${esc(t.column_status || t.status || 'inbox')}</span></td>
          <td>\${priorityBadge(t.priority)}</td>
          <td>\${t.assignee_agent ? \`<div class="task-assignee"><div class="assignee-dot">◉</div>\${esc(t.assignee_agent)}</div>\` : '<span style="color:var(--muted);">—</span>'}</td>
          <td>\${(t.tags || []).map(tag => \`<span class="task-tag">\${esc(tag)}</span>\`).join(' ')}</td>
          <td style="color:var(--muted);font-size:12px;">\${fmtDate(t.created_at)}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="openTaskModal(\${toJson(t)})">Edit</button>
            <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="deleteTask('\${esc(t.id)}')">Del</button>
          </td>
        </tr>
      \`).join('');
    }

    function renderAgentFilters(tasks) {
      const agents = [...new Set(tasks.map(t => t.assignee_agent).filter(Boolean))];
      const el = document.getElementById('kanban-agent-filters');
      el.innerHTML = agents.map(a => \`
        <div style="display:flex;align-items:center;gap:5px;padding:4px 10px;background:var(--surface);border:1px solid var(--border);border-radius:20px;font-size:12px;color:var(--text2);">
          <div class="assignee-dot" style="width:20px;height:20px;">◉</div>
          \${esc(a)}
        </div>
      \`).join('');
    }

    function setView(v) {
      currentView = v;
      document.getElementById('kanban-board-view').style.display = v === 'board' ? '' : 'none';
      document.getElementById('kanban-list-view').style.display = v === 'list' ? '' : 'none';
      document.getElementById('view-board-btn').classList.toggle('active', v === 'board');
      document.getElementById('view-list-btn').classList.toggle('active', v === 'list');
    }

    function toggleFilterBar() { /* future: show/hide filter row */ }

    function openTaskModal(task, defaultCol) {
      document.getElementById('task-modal-title').textContent = task ? 'Edit Task' : 'New Task';
      document.getElementById('task-modal-id').value = task?.id || '';
      document.getElementById('task-modal-board-id').value = task?.board_id || currentBoardId || '';
      document.getElementById('task-title').value = task?.title || '';
      document.getElementById('task-desc').value = task?.description || '';
      document.getElementById('task-column-status').value = task?.column_status || defaultCol || 'inbox';
      document.getElementById('task-priority').value = task?.priority || 'medium';
      document.getElementById('task-agent').value = task?.assignee_agent || '';
      document.getElementById('task-tags').value = (task?.tags || []).join(', ');
      openModal('task-modal');
    }

    async function saveTask() {
      const id = document.getElementById('task-modal-id').value;
      const boardId = document.getElementById('task-modal-board-id').value || currentBoardId;
      const title = document.getElementById('task-title').value.trim();
      const description = document.getElementById('task-desc').value.trim();
      const column_status = document.getElementById('task-column-status').value;
      const priority = document.getElementById('task-priority').value;
      const assignee_agent = document.getElementById('task-agent').value.trim();
      const tags = document.getElementById('task-tags').value.split(',').map(t => t.trim()).filter(Boolean);
      if (!title) { showFlash('Title is required.', 'error'); return; }
      if (!boardId) { showFlash('No board selected.', 'error'); return; }
      const status = column_status === 'done' ? 'done' : column_status === 'in-progress' ? 'in-progress' : 'todo';
      try {
        if (id) {
          await api('PATCH', \`/mission-control/api/tasks/\${id}\`, { title, description, status, column_status, priority, assignee_agent, tags });
          showFlash('Task updated.');
        } else {
          await api('POST', \`/mission-control/api/boards/\${boardId}/tasks\`, { title, description, status, column_status, priority, assignee_agent, tags });
          showFlash('Task created.');
        }
        closeModal('task-modal');
        loadTasks(boardId);
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    async function deleteTask(id) {
      if (!confirm('Delete this task?')) return;
      try {
        await api('DELETE', \`/mission-control/api/tasks/\${id}\`);
        showFlash('Task deleted.');
        loadTasks(currentBoardId);
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    // ── Tags ───────────────────────────────────────────────────────────────────
    async function loadTags() {
      const tbody = document.getElementById('tags-tbody');
      tbody.innerHTML = '<tr><td colspan="5"><span class="spinner"></span></td></tr>';
      try {
        const data = await api('GET', '/mission-control/api/tags');
        const tags = data.tags || [];
        document.getElementById('tags-sub').textContent = tags.length + ' tag' + (tags.length !== 1 ? 's' : '') + ' configured.';
        if (tags.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px;">No tags yet.</td></tr>';
          return;
        }
        tbody.innerHTML = tags.map(t => \`
          <tr>
            <td>
              <div class="tag-name-cell">
                <span class="color-dot" style="background:\${esc(t.color || '#888')};"></span>
                <span style="font-weight:600;">\${esc(t.name)}</span>
              </div>
              <div class="tag-slug">\${esc(t.slug)}</div>
            </td>
            <td><span style="font-family:monospace;font-size:12px;">\${esc(t.color || '')}</span></td>
            <td>\${t.task_count ?? 0}</td>
            <td style="color:var(--muted);font-size:12px;">\${fmtDate(t.updated_at || t.created_at)}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="openTagModal(\${toJson(t)})">Edit</button>
              <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="deleteTag('\${esc(t.id)}')">Delete</button>
            </td>
          </tr>
        \`).join('');
      } catch (err) {
        tbody.innerHTML = \`<tr><td colspan="5" class="flash error">Failed: \${esc(err.message)}</td></tr>\`;
      }
    }

    function openTagModal(tag) {
      document.getElementById('tag-modal-title').textContent = tag ? 'Edit Tag' : 'New Tag';
      document.getElementById('tag-modal-id').value = tag?.id || '';
      document.getElementById('tag-name').value = tag?.name || '';
      const color = tag?.color || '#458728';
      document.getElementById('tag-color').value = color.startsWith('#') && color.length === 7 ? color : '#458728';
      document.getElementById('tag-color-text').value = color;
      openModal('tag-modal');
    }

    function syncColorText() {
      const text = document.getElementById('tag-color-text').value;
      if (/^#[0-9a-fA-F]{6}$/.test(text)) {
        document.getElementById('tag-color').value = text;
      }
    }

    async function saveTag() {
      const id = document.getElementById('tag-modal-id').value;
      const name = document.getElementById('tag-name').value.trim();
      const color = document.getElementById('tag-color-text').value.trim() || document.getElementById('tag-color').value;
      if (!name) { showFlash('Name is required.', 'error'); return; }
      try {
        if (id) {
          await api('PATCH', \`/mission-control/api/tags/\${id}\`, { name, color });
          showFlash('Tag updated.');
        } else {
          await api('POST', '/mission-control/api/tags', { name, color });
          showFlash('Tag created.');
        }
        closeModal('tag-modal');
        loadTags();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    async function deleteTag(id) {
      if (!confirm('Delete this tag?')) return;
      try {
        await api('DELETE', \`/mission-control/api/tags/\${id}\`);
        showFlash('Tag deleted.');
        loadTags();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    // ── Approvals ──────────────────────────────────────────────────────────────
    async function loadApprovals() {
      const el = document.getElementById('approvals-list');
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const data = await api('GET', '/mission-control/api/approvals');
        const items = data.approvals || [];
        if (items.length === 0) {
          el.innerHTML = '<div class="empty"><div class="empty-icon">◎</div><div class="empty-title">No approval requests</div><div class="empty-sub">Submit a request to route sensitive actions through an approval flow.</div></div>';
          return;
        }
        el.innerHTML = \`<div class="data-table-wrap"><table class="data-table">
          <thead><tr><th>Action</th><th>Status</th><th>Created</th><th>Decided</th><th>Actions</th></tr></thead>
          <tbody>\${items.map(a => \`
            <tr>
              <td>
                <span style="font-family:monospace;font-size:12px;color:var(--accent);">\${esc(a.action_type)}</span>
                \${a.payload?.description ? \`<div style="font-size:11px;color:var(--muted);margin-top:2px;">\${esc(a.payload.description)}</div>\` : ''}
              </td>
              <td>\${approvalBadge(a.status)}</td>
              <td style="font-size:12px;color:var(--muted);">\${fmtDate(a.created_at)}</td>
              <td style="font-size:12px;color:var(--muted);">\${a.decided_at ? fmtDate(a.decided_at) : '—'}</td>
              <td>\${a.status === 'pending' ? \`
                <button class="btn btn-success btn-sm" onclick="decideApproval('\${esc(a.id)}', 'approved')">Approve</button>
                <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="decideApproval('\${esc(a.id)}', 'rejected')">Reject</button>
              \` : '—'}</td>
            </tr>
          \`).join('')}</tbody>
        </table></div>\`;
      } catch (err) {
        el.innerHTML = \`<div class="flash error">Failed: \${esc(err.message)}</div>\`;
      }
    }

    function openApprovalModal() {
      document.getElementById('approval-type').value = '';
      document.getElementById('approval-payload').value = '';
      openModal('approval-modal');
    }

    async function saveApproval() {
      const action_type = document.getElementById('approval-type').value.trim();
      const description = document.getElementById('approval-payload').value.trim();
      if (!action_type) { showFlash('Action type is required.', 'error'); return; }
      try {
        await api('POST', '/mission-control/api/approvals', { action_type, payload: { description } });
        showFlash('Approval request submitted.');
        closeModal('approval-modal');
        loadApprovals();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    async function decideApproval(id, decision) {
      try {
        await api('POST', \`/mission-control/api/approvals/\${id}/decide\`, { decision });
        showFlash('Approval ' + decision + '.');
        loadApprovals();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    // ── Marketplace ────────────────────────────────────────────────────────────
    let allMarketplaceSkills = [];

    async function loadMarketplace() {
      const tbody = document.getElementById('marketplace-tbody');
      tbody.innerHTML = '<tr><td colspan="7"><span class="spinner"></span></td></tr>';
      try {
        const data = await api('GET', '/dashboard/api/skills');
        allMarketplaceSkills = data.skills || [];
        document.getElementById('marketplace-sub').textContent = allMarketplaceSkills.length + ' skills synced from packs.';

        // Populate category filter
        const cats = [...new Set(allMarketplaceSkills.map(s => s.category || 'uncategorized'))];
        const catSel = document.getElementById('marketplace-category');
        catSel.innerHTML = '<option value="">All categories</option>' + cats.map(c =>
          \`<option value="\${esc(c)}">\${esc(c)}</option>\`
        ).join('');

        renderMarketplace(allMarketplaceSkills);
      } catch (err) {
        tbody.innerHTML = \`<tr><td colspan="7" class="flash error">Failed: \${esc(err.message)}</td></tr>\`;
      }
    }

    function filterMarketplace() {
      const q = document.getElementById('marketplace-search').value.toLowerCase();
      const cat = document.getElementById('marketplace-category').value;
      const risk = document.getElementById('marketplace-risk').value;
      const filtered = allMarketplaceSkills.filter(s => {
        if (q && !JSON.stringify(s).toLowerCase().includes(q)) return false;
        if (cat && (s.category || 'uncategorized') !== cat) return false;
        if (risk && (s.risk || 'safe') !== risk) return false;
        return true;
      });
      renderMarketplace(filtered);
    }

    function renderMarketplace(skills) {
      const tbody = document.getElementById('marketplace-tbody');
      if (!skills.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">No skills found.</td></tr>';
        return;
      }
      tbody.innerHTML = skills.map(s => \`
        <tr>
          <td>
            <div style="font-weight:600;color:var(--accent);">\${esc(s.name)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px;">\${esc((s.description || '').slice(0, 100))}</div>
          </td>
          <td style="font-size:12px;color:var(--muted);">\${esc(s.pack || '—')}</td>
          <td style="font-size:12px;">\${esc(s.category || 'uncategorized')}</td>
          <td>
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:var(--success-bg);color:var(--success);">
              \${esc((s.risk || 'safe').toUpperCase())}
            </span>
          </td>
          <td style="font-size:11px;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(s.source || '—')}</td>
          <td style="font-size:12px;">\${s.enabled ? \`<span style="color:var(--success);font-weight:600;">Primary</span>\` : '—'}</td>
          <td style="font-size:12px;color:var(--muted);">\${fmtDate(s.updated_at || '')}</td>
        </tr>
      \`).join('');
    }

    // ── Gateway ────────────────────────────────────────────────────────────────
    async function loadGateway() {
      try {
        const data = await api('GET', '/mission-control/api/gateway');
        const gw = data.gateway || {};
        const badge = document.getElementById('gw-status-badge');
        const dot = badge.querySelector('.status-dot');
        if (gw.gatewayRunning) {
          badge.className = 'gw-status-badge running';
          badge.innerHTML = '<span class="status-dot online"></span> Running';
        } else {
          badge.className = 'gw-status-badge stopped';
          badge.innerHTML = '<span class="status-dot offline"></span> Stopped';
        }
        document.getElementById('gw-uptime-text').textContent = gw.uptime ? 'Uptime: ' + fmtUptime(gw.uptime) : '';

        const logTail = document.getElementById('gw-log-tail');
        const logs = data.logs || [];
        logTail.innerHTML = logs.length
          ? logs.map(l => \`<div class="log-line \${l.stream === 'stderr' ? 'stderr' : ''}">\${esc(l.text)}</div>\`).join('')
          : '<span style="color:#6c757d;">No recent logs.</span>';
        logTail.scrollTop = logTail.scrollHeight;
      } catch (err) {
        document.getElementById('gw-status-badge').innerHTML = '<span class="status-dot offline"></span> Error';
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

    // ── Agents ─────────────────────────────────────────────────────────────────
    async function loadAgents() {
      const el = document.getElementById('agents-list');
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const data = await api('GET', '/mission-control/api/agents');
        const agents = data.agents || [];
        document.getElementById('agents-sub').textContent = agents.length + ' agent' + (agents.length !== 1 ? 's' : '') + ' total.';
        if (agents.length === 0) {
          el.innerHTML = '<div class="empty"><div class="empty-icon">◉</div><div class="empty-title">No agents registered</div><div class="empty-sub">Add agents to track and manage your AI workers.</div></div>';
          return;
        }
        el.innerHTML = \`<div class="data-table-wrap"><table class="data-table">
          <thead><tr><th>Name</th><th>Role</th><th>Board</th><th>Status</th><th>Last seen</th><th>Actions</th></tr></thead>
          <tbody>\${agents.map(a => \`
            <tr>
              <td style="font-weight:600;">\${esc(a.name)}</td>
              <td style="color:var(--muted);font-size:12px;">\${esc(a.role || 'General AI')}</td>
              <td style="font-size:12px;">\${esc(allBoards.find(b => b.id === a.board_id)?.name || '—')}</td>
              <td>
                <div class="agent-status">
                  <span class="status-dot \${esc(a.status || 'offline')}"></span>
                  \${esc(a.status || 'offline')}
                </div>
              </td>
              <td style="font-size:12px;color:var(--muted);">\${a.last_seen_at ? fmtDate(a.last_seen_at) : '—'}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="openAgentModal(\${toJson(a)})">Edit</button>
                <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="deleteAgent('\${esc(a.id)}')">Delete</button>
              </td>
            </tr>
          \`).join('')}</tbody>
        </table></div>\`;
      } catch (err) {
        el.innerHTML = \`<div class="flash error">Failed: \${esc(err.message)}</div>\`;
      }
    }

    function openAgentModal(agent) {
      document.getElementById('agent-modal-title').textContent = agent ? 'Edit Agent' : 'Add Agent';
      document.getElementById('agent-modal-id').value = agent?.id || '';
      document.getElementById('agent-name').value = agent?.name || '';
      document.getElementById('agent-role').value = agent?.role || '';
      document.getElementById('agent-status').value = agent?.status || 'offline';
      document.getElementById('agent-board-id').value = agent?.board_id || '';
      populateBoardSelects(allBoards);
      openModal('agent-modal');
    }

    async function saveAgent() {
      const id = document.getElementById('agent-modal-id').value;
      const name = document.getElementById('agent-name').value.trim();
      const role = document.getElementById('agent-role').value.trim();
      const status = document.getElementById('agent-status').value;
      const board_id = document.getElementById('agent-board-id').value || null;
      if (!name) { showFlash('Name is required.', 'error'); return; }
      try {
        if (id) {
          await api('PATCH', \`/mission-control/api/agents/\${id}\`, { name, role, status, board_id });
          showFlash('Agent updated.');
        } else {
          await api('POST', '/mission-control/api/agents', { name, role, board_id });
          showFlash('Agent added.');
        }
        closeModal('agent-modal');
        loadAgents();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    async function deleteAgent(id) {
      if (!confirm('Delete this agent?')) return;
      try {
        await api('DELETE', \`/mission-control/api/agents/\${id}\`);
        showFlash('Agent deleted.');
        loadAgents();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    // ── Prompts ─────────────────────────────────────────────────────────────────
    const PROMPT_TYPE_HINTS = {
      workflow: '{"edge_fn_slug":"workflow-ai","workflow":"project-doc-planner","brand_id":"optional-uuid"}',
      agent_launch: '{"agent_id":"uuid","brand_id":"optional-uuid","project_id":"optional-uuid","message":"optional initial message"}',
      chat: '{"agent_id":"uuid","message":"default message","brand_id":"optional-uuid"}',
      edge_fn: '{"edge_fn_slug":"brand-voice-profile","brand_id":"optional-uuid"}',
      composite: '{"steps":[{"type":"edge_fn","edge_fn_slug":"brand-voice-profile"},{"type":"agent_launch","agent_id":"uuid"}]}',
    };

    function onPromptTypeChange() {
      const type = document.getElementById('prompt-type').value;
      const hint = document.getElementById('prompt-payload-hint');
      const ta = document.getElementById('prompt-payload');
      hint.textContent = 'Example: ' + (PROMPT_TYPE_HINTS[type] || '{}');
      if (!ta.value.trim() || ta.value === '{}') {
        ta.placeholder = PROMPT_TYPE_HINTS[type] || '{}';
      }
    }

    async function loadPrompts() {
      const el = document.getElementById('prompts-list');
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const { prompts } = await api('GET', '/mission-control/api/prompts');
        const sub = document.getElementById('agents-sub');
        if (!prompts.length) {
          el.innerHTML = \`<div style="color:#94a3b8;padding:32px;text-align:center;">
            No prompts yet. Create one with <strong>+ New prompt</strong> or ask the bot to <strong>save this as /shortcode</strong>.
          </div>\`;
          return;
        }
        const typeColors = { workflow:'#7c3aed', agent_launch:'#0891b2', chat:'#059669', edge_fn:'#d97706', composite:'#dc2626' };
        el.innerHTML = \`<table class="data-table" style="width:100%;">
          <thead><tr>
            <th>Shortcode</th><th>Name</th><th>Type</th><th>Description</th><th>Uses</th><th>Last used</th><th></th>
          </tr></thead>
          <tbody>\${prompts.map(p => \`<tr>
            <td><code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px;">/\${esc(p.slug)}</code></td>
            <td style="font-weight:500;">\${esc(p.name)}</td>
            <td><span style="background:\${typeColors[p.type]||'#64748b'}22;color:\${typeColors[p.type]||'#64748b'};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">\${p.type}</span></td>
            <td style="color:#64748b;font-size:13px;">\${esc(p.description||'')}</td>
            <td style="color:#64748b;font-size:13px;">\${p.usage_count||0}</td>
            <td style="color:#64748b;font-size:12px;">\${p.last_used_at ? new Date(p.last_used_at).toLocaleDateString() : '—'}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="editPrompt(\${JSON.stringify(p).replace(/"/g,'&quot;')})">Edit</button>
              <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;color:#ef4444;" onclick="deletePrompt('\${esc(p.slug)}')">Delete</button>
            </td>
          </tr>\`).join('')}
          </tbody>
        </table>\`;
      } catch (err) { el.innerHTML = \`<div style="color:#ef4444;">Error: \${err.message}</div>\`; }
    }

    function openPromptModal(prompt) {
      document.getElementById('prompt-modal-title').textContent = prompt ? 'Edit Prompt' : 'New Prompt';
      document.getElementById('prompt-modal-slug').value = prompt ? prompt.slug : '';
      document.getElementById('prompt-name').value = prompt ? prompt.name : '';
      document.getElementById('prompt-slug').value = prompt ? prompt.slug : '';
      document.getElementById('prompt-slug').disabled = !!prompt;
      document.getElementById('prompt-desc').value = prompt ? (prompt.description || '') : '';
      document.getElementById('prompt-type').value = prompt ? prompt.type : 'workflow';
      document.getElementById('prompt-payload').value = prompt ? JSON.stringify(prompt.payload, null, 2) : '';
      onPromptTypeChange();
      openModal('prompt-modal');
    }

    function editPrompt(p) { openPromptModal(p); }

    async function savePrompt() {
      const existingSlug = document.getElementById('prompt-modal-slug').value;
      const name = document.getElementById('prompt-name').value.trim();
      const slug = document.getElementById('prompt-slug').value.trim();
      const description = document.getElementById('prompt-desc').value.trim();
      const type = document.getElementById('prompt-type').value;
      const payloadRaw = document.getElementById('prompt-payload').value.trim();
      if (!name) return showFlash('Name is required', 'error');
      if (!existingSlug && !slug) return showFlash('Shortcode is required', 'error');
      let payload = {};
      if (payloadRaw) {
        try { payload = JSON.parse(payloadRaw); }
        catch { return showFlash('Payload must be valid JSON', 'error'); }
      }
      try {
        if (existingSlug) {
          await api('PATCH', \`/mission-control/api/prompts/\${existingSlug}\`, { name, description, type, payload });
          showFlash('Prompt updated.');
        } else {
          await api('POST', '/mission-control/api/prompts', { name, slug, description, type, payload });
          showFlash(\`Prompt /\${slug} saved. Type it in the bot to run it.\`);
        }
        closeModal('prompt-modal');
        loadPrompts();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    async function deletePrompt(slug) {
      if (!confirm(\`Delete /\${slug}?\`)) return;
      try {
        await api('DELETE', \`/mission-control/api/prompts/\${slug}\`);
        showFlash('Prompt deleted.');
        loadPrompts();
      } catch (err) { showFlash('Failed: ' + err.message, 'error'); }
    }

    // ── Integrations ───────────────────────────────────────────────────────────
    let intChannelGroupsLoaded = false;
    let intConnectorsLoaded = false;
    let currentIntTab = 'channels';

    function setIntegrationTab(tab) {
      currentIntTab = tab;
      document.getElementById('ipanel-channels').style.display = tab === 'channels' ? '' : 'none';
      document.getElementById('ipanel-connectors').style.display = tab === 'connectors' ? '' : 'none';
      document.getElementById('itab-channels').classList.toggle('itab-active', tab === 'channels');
      document.getElementById('itab-connectors').classList.toggle('itab-active', tab === 'connectors');
      if (tab === 'channels' && !intChannelGroupsLoaded) loadIntChannels();
      if (tab === 'connectors' && !intConnectorsLoaded) loadIntConnectors();
    }

    async function loadIntChannels() {
      const el = document.getElementById('integrations-channels-content');
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const res = await fetch('/lite/api/config', { headers: { Accept: 'application/json' } });
        const cfgJson = res.ok ? await res.json() : {};
        const channelsCfg = (cfgJson.config && cfgJson.config.channels) ? cfgJson.config.channels : {};

        const chRes = await fetch('/api/schemas', { headers: { Accept: 'application/json' } });
        const chJson = chRes.ok ? await chRes.json() : {};
        const groups = Array.isArray(chJson.channelGroups) ? chJson.channelGroups : [];

        if (!groups.length) {
          el.innerHTML = '<div class="empty"><div class="empty-icon">📡</div><div class="empty-title">No channels available</div><div class="empty-sub">Channel definitions could not be loaded.</div></div>';
          intChannelGroupsLoaded = true;
          return;
        }

        const popular = groups.filter(c => c.category === 'popular');
        const more = groups.filter(c => c.category !== 'popular');

        function renderIntChannelCard(ch) {
          const cfg = channelsCfg[ch.name] || {};
          const enabled = !!cfg.enabled;
          const fields = (ch.fields || []).map(f => {
            const val = cfg[f.id] != null ? esc(String(cfg[f.id])) : '';
            const type = f.type === 'password' ? 'password' : 'text';
            return \`<div class="int-field">
              <label for="int-\${esc(ch.name)}-\${esc(f.id)}">\${esc(f.label || f.id)}</label>
              <input id="int-\${esc(ch.name)}-\${esc(f.id)}" name="\${esc(f.id)}" type="\${type}" placeholder="\${esc(f.placeholder || '')}" value="\${val}"/>
            </div>\`;
          }).join('');
          const help = ch.helpUrl ? \`<div style="font-size:12px;color:var(--muted);"><a href="\${esc(ch.helpUrl)}" target="_blank" rel="noreferrer" style="color:var(--accent);">Docs</a>\${ch.note ? ' · ' + esc(ch.note) : ''}</div>\` : (ch.note ? \`<div style="font-size:12px;color:var(--muted);">\${esc(ch.note)}</div>\` : '');
          const icon = ch.emoji ? \`<span style="font-size:20px;">\${esc(ch.emoji)}</span>\` : \`<span style="font-size:16px;">💬</span>\`;
          return \`<div class="int-channel-card">
            <div class="int-channel-head">
              <div class="int-channel-title">
                \${icon}
                <div>
                  <div class="int-channel-name">\${esc(ch.displayName || ch.name)}</div>
                  \${ch.description ? \`<div class="int-channel-desc">\${esc(ch.description)}</div>\` : ''}
                </div>
              </div>
              <span class="int-badge \${enabled ? 'on' : 'off'}">\${enabled ? 'Enabled' : 'Not set'}</span>
            </div>
            <form class="int-channel-form" method="POST" action="/dashboard/channels/\${encodeURIComponent(ch.name)}">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--text2);">
                <input type="checkbox" name="enabled" value="true" \${enabled ? 'checked' : ''}/>
                Enabled
              </label>
              \${fields ? \`<div class="int-fields-grid">\${fields}</div>\` : ''}
              \${help}
              <div>
                <button class="btn btn-primary btn-sm" type="submit">Save</button>
              </div>
            </form>
          </div>\`;
        }

        el.innerHTML = \`
          \${popular.length ? '<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:10px;">Channels</div>' : ''}
          <div class="int-channels-grid">\${popular.map(renderIntChannelCard).join('')}</div>
          \${more.length ? '<div style="font-size:13px;font-weight:700;color:var(--text2);margin:18px 0 10px;">More</div>' : ''}
          \${more.length ? \`<div class="int-channels-grid">\${more.map(renderIntChannelCard).join('')}</div>\` : ''}
        \`;
        intChannelGroupsLoaded = true;
      } catch (err) {
        el.innerHTML = \`<div class="flash error">Failed to load channels: \${esc(err.message)}</div>\`;
      }
    }

    let intConnectorsAll = [];
    let intConnectorsConfigured = false;

    function filterIntConnectors(items, q) {
      const s = (q || '').trim().toLowerCase();
      if (!s) return items;
      return items.filter(c => {
        const name = (c.name || c.key || '').toLowerCase();
        const desc = (c.description || '').toLowerCase();
        const key = (c.key || '').toLowerCase();
        if (name.includes(s) || desc.includes(s) || key.includes(s)) return true;
        if (c.children && Array.isArray(c.children)) {
          return c.children.some(ch => (ch.name || ch.key || '').toLowerCase().includes(s));
        }
        return false;
      });
    }

    function renderIntConnectorsList(items, configured) {
      const list = document.getElementById('integrations-connectors-list');
      if (!list) return;

      function connectorEmoji(key) {
        const k = String(key || '').toLowerCase();
        if (k.includes('google')) return '🟦';
        if (k.includes('github')) return '🐙';
        if (k.includes('slack')) return '💬';
        if (k.includes('web')) return '🔎';
        return '🔌';
      }

      function renderOne(c, isChild) {
        const key = String(c.key || c.id || c.name || 'connector');
        const name = esc(c.name || c.displayName || c.key || 'Connector');
        const desc = c.description ? \`<div class="int-channel-desc">\${esc(c.description)}</div>\` : '';
        const badges = c.badges || {};
        const isUnavailable = badges.unavailable === true;
        const provider = c.provider || 'composio';
        const accounts = Array.isArray(c.accounts) ? c.accounts : [];

        const statusLabel = badges.connected ? 'Connected' : (isUnavailable ? 'Unavailable' : 'Not connected');
        const statusCls = badges.connected ? 'on' : 'off';

        const accountLines = accounts.length
          ? accounts.map(a => {
              const label = esc(a.email || a.label || a.id || 'Account');
              return \`<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;">
                <span style="font-size:12px;font-family:monospace;color:var(--text2);">\${label}</span>
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-secondary btn-sm" data-int-action="reconnect" data-int-key="\${esc(key)}">Reconnect</button>
                  <button class="btn btn-danger btn-sm" data-int-action="disconnect" data-int-key="\${esc(key)}">Disconnect</button>
                </div>
              </div>\`;
            }).join('')
          : (isChild ? '' : '<div style="font-size:12px;color:var(--muted);margin-top:6px;">No accounts connected.</div>');

        const addBtn = provider !== 'builtin' && !isUnavailable
          ? \`<button class="btn btn-primary btn-sm" data-int-action="connect" data-int-key="\${esc(key)}">Add account</button>\`
          : (isUnavailable ? \`<button class="btn btn-secondary btn-sm" disabled style="opacity:0.45;cursor:not-allowed;" title="\${esc(c.unavailableReason || 'Unavailable')}">Add account</button>\` : '');

        const warning = !isChild && isUnavailable && c.unavailableReason
          ? \`<div style="font-size:12px;color:var(--warn);margin-top:8px;">⚠ \${esc(c.unavailableReason)}</div>\`
          : (!isChild && !configured && provider === 'composio')
            ? \`<div style="font-size:12px;color:var(--muted);margin-top:8px;">Set <code>COMPOSIO_API_KEY</code> to enable Composio connectors.</div>\`
            : '';

        if (isChild) {
          return \`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;padding:6px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;">\${name}</span>
            \${addBtn}
          </div>\`;
        }

        const body = c.children && c.children.length
          ? \`<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:12px;color:var(--muted);">Services</summary><div style="margin-top:8px;">\${c.children.map(ch => renderOne(ch, true)).join('')}</div></details>\`
          : \`<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;"><span style="font-size:12px;color:var(--muted);">Accounts</span>\${addBtn}</div>\${accountLines}\${warning}\`;

        return \`<div class="int-channel-card">
          <div class="int-channel-head">
            <div class="int-channel-title">
              <span style="font-size:20px;">\${connectorEmoji(key)}</span>
              <div>
                <div class="int-channel-name">\${name}</div>
                \${desc}
              </div>
            </div>
            <span class="int-badge \${statusCls}">\${statusLabel}</span>
          </div>
          <div>\${body}</div>
        </div>\`;
      }

      list.innerHTML = items.length
        ? items.map(c => renderOne(c, false)).join('')
        : '<div style="color:var(--muted);font-size:13px;">No connectors match your search.</div>';
    }

    async function loadIntConnectors() {
      const loading = document.getElementById('integrations-connectors-loading');
      const list = document.getElementById('integrations-connectors-list');
      const errEl = document.getElementById('integrations-connectors-error');
      errEl.style.display = 'none';
      loading.style.display = 'block';
      list.innerHTML = '';
      try {
        const res = await fetch('/dashboard/connectors', { headers: { Accept: 'application/json' } });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
        const items = Array.isArray(json.connectors) ? json.connectors : [];
        intConnectorsConfigured = json.configured === true;
        intConnectorsAll = items;

        const searchEl = document.getElementById('integrations-connectors-search');
        const q = (searchEl && searchEl.value) ? searchEl.value : '';
        renderIntConnectorsList(filterIntConnectors(items, q), intConnectorsConfigured);
        intConnectorsLoaded = true;
      } catch (err) {
        errEl.textContent = err.message || 'Failed to load connectors';
        errEl.style.display = 'block';
      } finally {
        loading.style.display = 'none';
      }
    }

    const intSearchEl = document.getElementById('integrations-connectors-search');
    if (intSearchEl) intSearchEl.addEventListener('input', function () {
      if (intConnectorsAll.length === 0) return;
      renderIntConnectorsList(filterIntConnectors(intConnectorsAll, this.value), intConnectorsConfigured);
    });

    document.getElementById('integrations-connectors-list').addEventListener('click', async (ev) => {
      const btn = ev.target.closest ? ev.target.closest('button[data-int-action][data-int-key]') : null;
      if (!btn) return;
      const action = btn.getAttribute('data-int-action');
      const key = btn.getAttribute('data-int-key');
      if (!action || !key) return;
      const errEl = document.getElementById('integrations-connectors-error');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/dashboard/connectors/' + encodeURIComponent(key) + '/' + encodeURIComponent(action), {
          method: 'POST', headers: { Accept: 'application/json' },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
        if (json.redirectUrl) { window.location.href = json.redirectUrl; return; }
        intConnectorsLoaded = false;
        loadIntConnectors();
      } catch (err) {
        errEl.textContent = err.message || 'Action failed';
        errEl.style.display = 'block';
      }
    });

    // ── Init ───────────────────────────────────────────────────────────────────
    const hash = location.hash.replace('#', '');
    const validPanels = ['dashboard','live-feed','board-groups','boards','kanban','tags','approvals','custom-fields','marketplace','packs','organization','gateways','agents','prompts','integrations'];
    // Set initial active state for integration tabs
    document.getElementById('itab-channels').classList.add('itab-active');

    if (hash && validPanels.includes(hash)) {
      setPanel(hash);
    } else {
      setPanel('boards');
      loadBoards();
    }
  </script>
</body>
</html>`;
}
