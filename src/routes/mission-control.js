/**
 * Mission Control router
 *
 * Mounted at /mission-control in server.js.
 * All routes require Supabase auth via requireUser().
 * No secrets are exposed to the browser.
 */

import { Router } from 'express';
import { requireUser } from '../auth-supabase.js';
import { getUserClient } from '../lib/db.js';
import { getMissionControlPageHTML } from '../mission-control-page.js';
import { emitAudit } from '../audit.js';
import { isGatewayRunning, getGatewayInfo, getGatewayUptime, getRecentLogs } from '../gateway.js';
import { gatewayRPC } from '../gateway-rpc.js';
import { CHANNEL_GROUPS } from '../channels.js';

const router = Router();

// All Mission Control routes require a logged-in Supabase user.
router.use(requireUser());

// ── Page ─────────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.send(getMissionControlPageHTML({ userEmail: req.user?.email }));
});

// ── Overview ──────────────────────────────────────────────────────────────────

router.get('/api/overview', async (req, res) => {
  const supabase = getUserClient(req);
  const userId = req.user.id;

  // Gateway status
  const gateway = {
    gatewayRunning: isGatewayRunning(),
    gatewayInfo: getGatewayInfo(),
    uptime: getGatewayUptime(),
  };

  // Open tasks count (todo + in-progress)
  let openTasks = null;
  try {
    const { count } = await supabase
      .from('mc_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['todo', 'in-progress']);
    openTasks = count ?? 0;
  } catch { /* non-fatal */ }

  // Pending approvals count
  let pendingApprovals = null;
  try {
    const { count } = await supabase
      .from('mc_approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending');
    pendingApprovals = count ?? 0;
  } catch { /* non-fatal */ }

  // Sessions via gateway RPC
  let sessions = null;
  try {
    const result = await gatewayRPC('sessions.list', { includeGlobal: true, limit: 100 });
    if (Array.isArray(result)) sessions = result.length;
    else if (result?.count != null) sessions = result.count;
    else if (Array.isArray(result?.sessions)) sessions = result.sessions.length;
  } catch { /* gateway may not be running */ }

  // Recent audit events (last 5)
  let recentAudit = [];
  try {
    const { data } = await supabase
      .from('mc_audit_events')
      .select('event_type,actor,payload,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    recentAudit = data || [];
  } catch { /* non-fatal */ }

  return res.json({ gateway, openTasks, pendingApprovals, sessions, recentAudit });
});

// ── Boards (backed by the unified `projects` table) ───────────────────────────
//
// mc_boards was merged into `projects` via migration 20260320_unify_tasks_projects.sql.
// The URL shape (/api/boards/*) is preserved so the MC frontend needs no URL changes.
// Field mapping: name → title, sparti_brand_id → brand_id.

router.get('/api/boards', async (req, res) => {
  const supabase = getUserClient(req);
  const { data, error } = await supabase
    .from('projects')
    .select('id,title,description,status,brand_id,is_active,created_at,updated_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  // Normalise to legacy shape so frontend requires no change: title→name, brand_id→sparti_brand_id
  const boards = (data || []).map(normaliseProject);
  return res.json({ boards });
});

router.post('/api/boards', async (req, res) => {
  const supabase = getUserClient(req);
  const { name, title, description, brand_id, sparti_brand_id } = req.body || {};
  const resolvedTitle = (title || name || '').trim();
  if (!resolvedTitle) return res.status(400).json({ error: 'name is required' });
  const resolvedBrandId = brand_id || sparti_brand_id || null;

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: req.user.id,
      title: resolvedTitle,
      description: description ? String(description).trim() : null,
      status: 'active',
      is_active: true,
      brand_id: resolvedBrandId,
    })
    .select('id,title,description,status,brand_id,is_active,created_at,updated_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  emitAudit(supabase, { userId: req.user.id, eventType: 'board.created', actor: req.user.email || req.user.id, payload: { boardId: data.id, name: data.title } });
  return res.status(201).json({ board: normaliseProject(data) });
});

router.patch('/api/boards/:id', async (req, res) => {
  const supabase = getUserClient(req);
  const { name, title, description, status, brand_id, sparti_brand_id } = req.body || {};
  const updates = {};
  const resolvedTitle = title ?? name;
  if (resolvedTitle != null) updates.title = String(resolvedTitle).trim();
  if (description != null) updates.description = String(description).trim();
  if (status != null) {
    updates.status = String(status).trim();
    updates.is_active = updates.status === 'active';
  }
  const resolvedBrandId = brand_id !== undefined ? brand_id : sparti_brand_id;
  if (resolvedBrandId !== undefined) updates.brand_id = resolvedBrandId || null;

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id,title,description,status,brand_id,is_active,created_at,updated_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Board not found' });

  emitAudit(supabase, { userId: req.user.id, eventType: 'board.updated', actor: req.user.email || req.user.id, payload: { boardId: data.id, updates } });
  return res.json({ board: normaliseProject(data) });
});

router.delete('/api/boards/:id', async (req, res) => {
  const supabase = getUserClient(req);
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });

  emitAudit(supabase, { userId: req.user.id, eventType: 'board.deleted', actor: req.user.email || req.user.id, payload: { boardId: req.params.id } });
  return res.json({ ok: true });
});

/**
 * Normalise a projects row to the legacy board shape the frontend expects.
 * Keeps `title` AND adds `name` alias; `brand_id` AND adds `sparti_brand_id` alias.
 */
function normaliseProject(p) {
  return {
    id: p.id,
    name: p.title,           // legacy alias
    title: p.title,
    description: p.description,
    status: p.is_active === false ? 'archived' : (p.status || 'active'),
    brand_id: p.brand_id,
    sparti_brand_id: p.brand_id, // legacy alias
    is_active: p.is_active,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
// mc_tasks.project_id now references projects(id) (unified via migration).
// URL shape preserved: /api/boards/:boardId/tasks — boardId IS the project_id.

router.get('/api/boards/:boardId/tasks', async (req, res) => {
  const supabase = getUserClient(req);

  // Verify the project belongs to the user (replaces old mc_boards ownership check)
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', req.params.boardId)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (!project) return res.status(404).json({ error: 'Board not found' });

  const { data, error } = await supabase
    .from('mc_tasks')
    .select('id,project_id,title,description,status,column_status,priority,assignee_agent,tags,created_at')
    .eq('project_id', req.params.boardId)
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  // Add board_id alias for frontend compatibility
  const tasks = (data || []).map(t => ({ ...t, board_id: t.project_id }));
  return res.json({ tasks });
});

router.post('/api/boards/:boardId/tasks', async (req, res) => {
  const supabase = getUserClient(req);
  const { title, description, status, column_status, priority, assignee_agent, tags } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', req.params.boardId)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (!project) return res.status(404).json({ error: 'Board not found' });

  const { data, error } = await supabase
    .from('mc_tasks')
    .insert({
      project_id: req.params.boardId,
      user_id: req.user.id,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      status: status || 'todo',
      column_status: column_status || 'inbox',
      priority: priority || 'medium',
      assignee_agent: assignee_agent ? String(assignee_agent).trim() : null,
      tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
    })
    .select('id,project_id,title,description,status,column_status,priority,assignee_agent,tags,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  emitAudit(supabase, { userId: req.user.id, eventType: 'task.created', actor: req.user.email || req.user.id, payload: { taskId: data.id, title: data.title, projectId: req.params.boardId } });
  return res.status(201).json({ task: { ...data, board_id: data.project_id } });
});

router.patch('/api/tasks/:id', async (req, res) => {
  const supabase = getUserClient(req);
  const { title, description, status, column_status, priority, assignee_agent, tags } = req.body || {};
  const updates = {};
  if (title != null) updates.title = String(title).trim();
  if (description != null) updates.description = String(description).trim();
  if (status != null) updates.status = String(status).trim();
  if (column_status != null) updates.column_status = String(column_status).trim();
  if (priority != null) updates.priority = String(priority).trim();
  if (assignee_agent != null) updates.assignee_agent = String(assignee_agent).trim() || null;
  if (tags != null) updates.tags = Array.isArray(tags) ? tags.filter(Boolean) : [];

  const { data, error } = await supabase
    .from('mc_tasks')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id,project_id,title,description,status,column_status,priority,assignee_agent,tags,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Task not found' });

  emitAudit(supabase, { userId: req.user.id, eventType: 'task.updated', actor: req.user.email || req.user.id, payload: { taskId: data.id, updates } });
  return res.json({ task: { ...data, board_id: data.project_id } });
});

router.delete('/api/tasks/:id', async (req, res) => {
  const supabase = getUserClient(req);
  const { error } = await supabase
    .from('mc_tasks')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });

  emitAudit(supabase, { userId: req.user.id, eventType: 'task.deleted', actor: req.user.email || req.user.id, payload: { taskId: req.params.id } });
  return res.json({ ok: true });
});

// ── Approvals ─────────────────────────────────────────────────────────────────

router.get('/api/approvals', async (req, res) => {
  const supabase = getUserClient(req);
  const { data, error } = await supabase
    .from('mc_approval_requests')
    .select('id,action_type,payload,status,decided_at,decided_by,created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ approvals: data || [] });
});

router.post('/api/approvals', async (req, res) => {
  const supabase = getUserClient(req);
  const { action_type, payload } = req.body || {};
  if (!action_type || !String(action_type).trim()) return res.status(400).json({ error: 'action_type is required' });

  const { data, error } = await supabase
    .from('mc_approval_requests')
    .insert({
      user_id: req.user.id,
      action_type: String(action_type).trim(),
      payload: payload && typeof payload === 'object' ? payload : {},
      status: 'pending',
    })
    .select('id,action_type,payload,status,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  emitAudit(supabase, { userId: req.user.id, eventType: 'approval.requested', actor: req.user.email || req.user.id, payload: { approvalId: data.id, action_type: data.action_type } });
  return res.status(201).json({ approval: data });
});

router.post('/api/approvals/:id/decide', async (req, res) => {
  const supabase = getUserClient(req);
  const { decision } = req.body || {};
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
  }

  const { data, error } = await supabase
    .from('mc_approval_requests')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: req.user.email || req.user.id,
    })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .eq('status', 'pending')
    .select('id,action_type,status,decided_at,decided_by')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Approval not found or already decided' });

  emitAudit(supabase, { userId: req.user.id, eventType: 'approval.decided', actor: req.user.email || req.user.id, payload: { approvalId: data.id, action_type: data.action_type, decision } });
  return res.json({ approval: data });
});

// ── Audit Trail ───────────────────────────────────────────────────────────────

router.get('/api/audit', async (req, res) => {
  const supabase = getUserClient(req);
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const eventType = req.query.event_type ? String(req.query.event_type) : null;

  let query = supabase
    .from('mc_audit_events')
    .select('id,event_type,actor,payload,instance_id,created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (eventType) query = query.eq('event_type', eventType);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ events: data || [] });
});

// ── Gateway (read-only proxy of /lite/api/status + recent logs) ───────────────

router.get('/api/gateway', (req, res) => {
  const gateway = {
    gatewayRunning: isGatewayRunning(),
    gatewayInfo: getGatewayInfo(),
    uptime: getGatewayUptime(),
  };
  const logsResult = getRecentLogs(0);
  const logs = Array.isArray(logsResult) ? logsResult.slice(-40) : (logsResult?.entries || []).slice(-40);
  return res.json({ gateway, logs });
});

// ── Channels (definitions for the Integrations > Channels tab) ───────────────
// Returns the static CHANNEL_GROUPS list (name, displayName, description, fields, etc.)
// so the MC page can render channel setup cards without needing SETUP_PASSWORD.

router.get('/api/channels', (req, res) => {
  return res.json({ channels: CHANNEL_GROUPS });
});

// ── Board Groups ───────────────────────────────────────────────────────────────

router.get('/api/board-groups', async (req, res) => {
  const supabase = getUserClient(req);
  const { data, error } = await supabase
    .from('mc_board_groups')
    .select('id,name,description,created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ groups: data || [] });
});

router.post('/api/board-groups', async (req, res) => {
  const supabase = getUserClient(req);
  const { name, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const { data, error } = await supabase
    .from('mc_board_groups')
    .insert({ user_id: req.user.id, name: name.trim(), description: description?.trim() || null })
    .select('id,name,description,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  emitAudit(supabase, { userId: req.user.id, eventType: 'board_group.created', actor: req.user.email || req.user.id, payload: { groupId: data.id, name: data.name } });
  return res.status(201).json({ group: data });
});

router.patch('/api/board-groups/:id', async (req, res) => {
  const supabase = getUserClient(req);
  const { name, description } = req.body || {};
  const updates = {};
  if (name != null) updates.name = name.trim();
  if (description != null) updates.description = description.trim();
  const { data, error } = await supabase
    .from('mc_board_groups')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id,name,description,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Group not found' });
  return res.json({ group: data });
});

router.delete('/api/board-groups/:id', async (req, res) => {
  const supabase = getUserClient(req);
  const { error } = await supabase
    .from('mc_board_groups')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// ── Tags ──────────────────────────────────────────────────────────────────────

router.get('/api/tags', async (req, res) => {
  const supabase = getUserClient(req);
  const { data, error } = await supabase
    .from('mc_tags')
    .select('id,name,slug,color,created_at')
    .eq('user_id', req.user.id)
    .order('name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  // Enrich with task counts
  const tags = data || [];
  if (tags.length > 0) {
    try {
      const { data: taskRows } = await supabase
        .from('mc_tasks')
        .select('tags')
        .eq('user_id', req.user.id);
      const counts = {};
      (taskRows || []).forEach(t => {
        (t.tags || []).forEach(slug => { counts[slug] = (counts[slug] || 0) + 1; });
      });
      tags.forEach(tag => { tag.task_count = counts[tag.slug] || 0; });
    } catch { /* non-fatal */ }
  }

  return res.json({ tags });
});

router.post('/api/tags', async (req, res) => {
  const supabase = getUserClient(req);
  const { name, color } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const { data, error } = await supabase
    .from('mc_tags')
    .insert({ user_id: req.user.id, name: name.trim(), slug, color: color || '#4587280' })
    .select('id,name,slug,color,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  emitAudit(supabase, { userId: req.user.id, eventType: 'tag.created', actor: req.user.email || req.user.id, payload: { tagId: data.id, name: data.name } });
  return res.status(201).json({ tag: data });
});

router.patch('/api/tags/:id', async (req, res) => {
  const supabase = getUserClient(req);
  const { name, color } = req.body || {};
  const updates = {};
  if (name != null) { updates.name = name.trim(); updates.slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }
  if (color != null) updates.color = color;
  const { data, error } = await supabase
    .from('mc_tags')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id,name,slug,color,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Tag not found' });
  return res.json({ tag: data });
});

router.delete('/api/tags/:id', async (req, res) => {
  const supabase = getUserClient(req);
  const { error } = await supabase
    .from('mc_tags')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// ── Agents ────────────────────────────────────────────────────────────────────

router.get('/api/agents', async (req, res) => {
  const supabase = getUserClient(req);
  const { data, error } = await supabase
    .from('mc_agents')
    .select('id,name,role,board_id,status,last_seen_at,metadata,sparti_agent_id,sparti_agent_source,created_at')
    .eq('user_id', req.user.id)
    .order('name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const agents = data || [];

  // Enrich with real Sparti agent data for linked agents
  const aiIds = agents.filter(a => a.sparti_agent_id && a.sparti_agent_source === 'ai_agents').map(a => a.sparti_agent_id);
  const customIds = agents.filter(a => a.sparti_agent_id && a.sparti_agent_source === 'custom_agents').map(a => a.sparti_agent_id);

  const [aiRows, customRows] = await Promise.all([
    aiIds.length > 0
      ? supabase.from('ai_agents').select('id,name,instructions,is_active,usage_count,last_used_at').in('id', aiIds)
      : { data: [] },
    customIds.length > 0
      ? supabase.from('custom_agents').select('id,name,description,icon,category,is_active,usage_count,last_used_at').in('id', customIds)
      : { data: [] },
  ]);

  const aiMap = Object.fromEntries((aiRows.data || []).map(r => [r.id, r]));
  const customMap = Object.fromEntries((customRows.data || []).map(r => [r.id, r]));

  const enriched = agents.map(a => {
    if (!a.sparti_agent_id) return a;
    const spartiData = a.sparti_agent_source === 'ai_agents' ? aiMap[a.sparti_agent_id] : customMap[a.sparti_agent_id];
    return spartiData ? { ...a, sparti_agent: spartiData } : a;
  });

  return res.json({ agents: enriched });
});

router.post('/api/agents', async (req, res) => {
  const supabase = getUserClient(req);
  const { name, role, board_id, metadata, sparti_agent_id, sparti_agent_source } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const { data, error } = await supabase
    .from('mc_agents')
    .insert({
      user_id: req.user.id,
      name: name.trim(),
      role: role?.trim() || 'General AI',
      board_id: board_id || null,
      status: 'offline',
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      sparti_agent_id: sparti_agent_id || null,
      sparti_agent_source: sparti_agent_source || null,
    })
    .select('id,name,role,board_id,status,last_seen_at,metadata,sparti_agent_id,sparti_agent_source,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  emitAudit(supabase, { userId: req.user.id, eventType: 'agent.created', actor: req.user.email || req.user.id, payload: { agentId: data.id, name: data.name } });
  return res.status(201).json({ agent: data });
});

router.patch('/api/agents/:id', async (req, res) => {
  const supabase = getUserClient(req);
  const { name, role, board_id, status, metadata, sparti_agent_id, sparti_agent_source } = req.body || {};
  const updates = {};
  if (name != null) updates.name = name.trim();
  if (role != null) updates.role = role.trim();
  if (board_id !== undefined) updates.board_id = board_id || null;
  if (status != null) updates.status = status;
  if (metadata != null) updates.metadata = metadata;
  if (sparti_agent_id !== undefined) updates.sparti_agent_id = sparti_agent_id || null;
  if (sparti_agent_source !== undefined) updates.sparti_agent_source = sparti_agent_source || null;
  const { data, error } = await supabase
    .from('mc_agents')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id,name,role,board_id,status,last_seen_at,metadata,sparti_agent_id,sparti_agent_source,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Agent not found' });
  return res.json({ agent: data });
});

router.delete('/api/agents/:id', async (req, res) => {
  const supabase = getUserClient(req);
  const { error } = await supabase
    .from('mc_agents')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// ── Prompts (/shortcode saved workflows) ──────────────────────────────────────

router.get('/api/prompts', async (req, res) => {
  const supabase = getUserClient(req);
  const { data, error } = await supabase
    .from('mc_prompts')
    .select('id,name,slug,description,type,payload,is_active,usage_count,last_used_at,created_at')
    .eq('user_id', req.user.id)
    .order('slug', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ prompts: data || [] });
});

router.get('/api/prompts/:slug', async (req, res) => {
  const supabase = getUserClient(req);
  const { data, error } = await supabase
    .from('mc_prompts')
    .select('id,name,slug,description,type,payload,is_active,usage_count,last_used_at,created_at,updated_at')
    .eq('user_id', req.user.id)
    .eq('slug', req.params.slug)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Prompt not found' });
  return res.json({ prompt: data });
});

router.post('/api/prompts', async (req, res) => {
  const supabase = getUserClient(req);
  const { name, slug, description, type, payload } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!slug?.trim()) return res.status(400).json({ error: 'slug is required' });

  const cleanSlug = String(slug).trim().toLowerCase().replace(/^\/+/, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!cleanSlug) return res.status(400).json({ error: 'slug must contain valid characters (a-z, 0-9, -)' });

  const validTypes = ['workflow', 'skill', 'agent_launch', 'edge_fn', 'chat', 'composite'];
  const resolvedType = validTypes.includes(type) ? type : 'workflow';

  const { data, error } = await supabase
    .from('mc_prompts')
    .insert({
      user_id: req.user.id,
      name: String(name).trim(),
      slug: cleanSlug,
      description: description ? String(description).trim() : null,
      type: resolvedType,
      payload: payload && typeof payload === 'object' ? payload : {},
      is_active: true,
    })
    .select('id,name,slug,description,type,payload,is_active,usage_count,created_at')
    .single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: `Slug "/${cleanSlug}" already exists. Choose a different name.` });
    return res.status(500).json({ error: error.message });
  }

  emitAudit(supabase, { userId: req.user.id, eventType: 'prompt.created', actor: req.user.email || req.user.id, payload: { promptId: data.id, slug: data.slug, type: data.type } });
  return res.status(201).json({ prompt: data });
});

router.patch('/api/prompts/:slug', async (req, res) => {
  const supabase = getUserClient(req);
  const { name, description, type, payload, is_active } = req.body || {};
  const updates = {};
  if (name != null) updates.name = String(name).trim();
  if (description != null) updates.description = String(description).trim();
  if (type != null) updates.type = type;
  if (payload != null) updates.payload = payload;
  if (is_active != null) updates.is_active = Boolean(is_active);

  const { data, error } = await supabase
    .from('mc_prompts')
    .update(updates)
    .eq('user_id', req.user.id)
    .eq('slug', req.params.slug)
    .select('id,name,slug,description,type,payload,is_active,usage_count,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Prompt not found' });

  emitAudit(supabase, { userId: req.user.id, eventType: 'prompt.updated', actor: req.user.email || req.user.id, payload: { promptId: data.id, slug: data.slug } });
  return res.json({ prompt: data });
});

router.delete('/api/prompts/:slug', async (req, res) => {
  const supabase = getUserClient(req);
  const { error } = await supabase
    .from('mc_prompts')
    .delete()
    .eq('user_id', req.user.id)
    .eq('slug', req.params.slug);
  if (error) return res.status(500).json({ error: error.message });

  emitAudit(supabase, { userId: req.user.id, eventType: 'prompt.deleted', actor: req.user.email || req.user.id, payload: { slug: req.params.slug } });
  return res.json({ ok: true });
});

/**
 * Execute a saved prompt by slug.
 * The server resolves the payload and dispatches to the appropriate handler:
 * - agent_launch / chat → POST /api/sparti/agents/:id/launch or /chat
 * - edge_fn → POST /api/sparti/edge/:slug
 * - workflow → POST /api/sparti/edge/workflow-ai with payload
 * - composite → runs steps in sequence and returns all results
 *
 * Body: optional overrides merged into payload (e.g. { message, brand_id })
 */
router.post('/api/prompts/:slug/run', async (req, res) => {
  const supabase = getUserClient(req);

  const { data: prompt, error } = await supabase
    .from('mc_prompts')
    .select('id,name,slug,type,payload,is_active')
    .eq('user_id', req.user.id)
    .eq('slug', req.params.slug)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!prompt) return res.status(404).json({ error: `Prompt /${req.params.slug} not found` });
  if (!prompt.is_active) return res.status(400).json({ error: `Prompt /${req.params.slug} is disabled` });

  // Merge runtime overrides into stored payload
  const mergedPayload = { ...prompt.payload, ...(req.body || {}) };

  // Increment usage counter (non-blocking)
  supabase.from('mc_prompts')
    .update({ usage_count: (prompt.usage_count || 0) + 1, last_used_at: new Date().toISOString() })
    .eq('id', prompt.id)
    .then(() => {});

  emitAudit(supabase, { userId: req.user.id, eventType: 'prompt.run', actor: req.user.email || req.user.id, payload: { promptId: prompt.id, slug: prompt.slug, type: prompt.type } });

  return res.json({
    prompt: { id: prompt.id, name: prompt.name, slug: prompt.slug, type: prompt.type },
    payload: mergedPayload,
    dispatch: buildDispatchInstructions(prompt.type, mergedPayload),
  });
});

/**
 * Returns the dispatch instructions so the bot skill knows exactly what API call to make.
 * The bot reads this and executes the actual call (agent launch, edge fn, etc.).
 */
function buildDispatchInstructions(type, payload) {
  switch (type) {
    case 'agent_launch':
      return {
        method: 'POST',
        path: `/api/sparti/agents/${payload.agent_id}/launch`,
        body: { message: payload.message, brand_id: payload.brand_id, project_id: payload.project_id, model: payload.model },
      };
    case 'chat':
      return {
        method: 'POST',
        path: `/api/sparti/agents/${payload.agent_id}/chat`,
        body: { message: payload.message, brand_id: payload.brand_id, project_id: payload.project_id, history: payload.history },
      };
    case 'edge_fn':
      return {
        method: 'POST',
        path: `/api/sparti/edge/${payload.edge_fn_slug || payload.slug}`,
        body: payload.body || payload,
      };
    case 'workflow':
      return {
        method: 'POST',
        path: `/api/sparti/edge/${payload.edge_fn_slug || 'workflow-ai'}`,
        body: payload,
      };
    case 'skill':
      return {
        action: 'enable_skill',
        skill_name: payload.skill_name,
        instructions: payload.instructions,
      };
    case 'composite':
      return {
        action: 'run_steps',
        steps: Array.isArray(payload.steps) ? payload.steps.map(s => buildDispatchInstructions(s.type, s)) : [],
      };
    default:
      return { action: 'unknown', payload };
  }
}

// ── Live Feed (recent audit events as activity stream) ────────────────────────

router.get('/api/live-feed', async (req, res) => {
  const supabase = getUserClient(req);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const { data, error } = await supabase
    .from('mc_audit_events')
    .select('id,event_type,actor,payload,created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ events: data || [] });
});

// ── History (bot sessions / chat history across all brands) ──────────────────

router.get('/api/history', async (req, res) => {
  const supabase = getUserClient(req);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const brandId = req.query.brand_id ? String(req.query.brand_id) : null;

  let query = supabase
    .from('bot_sessions')
    .select('id,platform,thread_id,brand_id,instance_id,metadata,last_message_at,message_count,created_at')
    .eq('user_id', req.user.id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (brandId) query = query.eq('brand_id', brandId);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ sessions: data || [] });
});

// ── Brands (list from Sparti brands table) ───────────────────────────────────

router.get('/api/brands', async (req, res) => {
  const supabase = getUserClient(req);
  const { data, error } = await supabase
    .from('brands')
    .select('id,name,description,logo_url,website,industry,created_at,is_active')
    .eq('user_id', req.user.id)
    .order('name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ brands: data || [] });
});

// ── Logs (token usage history from global_ai_token_usage) ────────────────────

router.get('/api/logs', async (req, res) => {
  const supabase = getUserClient(req);
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const { data, error } = await supabase
    .from('global_ai_token_usage')
    .select('id,model,provider,input_tokens,output_tokens,total_tokens,estimated_cost_usd,session_id,instance_id,metadata,created_at')
    .eq('user_id', req.user.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  // Aggregate totals for the summary row
  const rows = data || [];
  const totals = rows.reduce((acc, r) => {
    acc.input_tokens += r.input_tokens || 0;
    acc.output_tokens += r.output_tokens || 0;
    acc.total_tokens += r.total_tokens || 0;
    acc.estimated_cost_usd += Number(r.estimated_cost_usd) || 0;
    return acc;
  }, { input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: 0 });

  return res.json({ logs: rows, totals, days });
});

export default router;
