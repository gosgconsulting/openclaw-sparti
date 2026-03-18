/**
 * Mission Control router
 *
 * Mounted at /mission-control in server.js.
 * All routes require Supabase auth via requireUser().
 * No secrets are exposed to the browser.
 */

import { Router } from 'express';
import { requireUser } from '../auth-supabase.js';
import { createSupabaseClient } from '../supabase.js';
import { getMissionControlPageHTML } from '../mission-control-page.js';
import { emitAudit } from '../audit.js';
import { isGatewayRunning, getGatewayInfo, getGatewayUptime, getRecentLogs } from '../gateway.js';
import { gatewayRPC } from '../gateway-rpc.js';

const router = Router();

// All Mission Control routes require a logged-in Supabase user.
router.use(requireUser());

// ── Page ─────────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.send(getMissionControlPageHTML({ userEmail: req.user?.email }));
});

// ── Overview ──────────────────────────────────────────────────────────────────

router.get('/api/overview', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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

// ── Boards ────────────────────────────────────────────────────────────────────

router.get('/api/boards', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
  const { data, error } = await supabase
    .from('mc_boards')
    .select('id,name,description,status,created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ boards: data || [] });
});

router.post('/api/boards', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
  const { name, description } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await supabase
    .from('mc_boards')
    .insert({ user_id: req.user.id, name: String(name).trim(), description: description ? String(description).trim() : null, status: 'active' })
    .select('id,name,description,status,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  emitAudit(supabase, { userId: req.user.id, eventType: 'board.created', actor: req.user.email || req.user.id, payload: { boardId: data.id, name: data.name } });
  return res.status(201).json({ board: data });
});

router.patch('/api/boards/:id', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
  const { name, description, status } = req.body || {};
  const updates = {};
  if (name != null) updates.name = String(name).trim();
  if (description != null) updates.description = String(description).trim();
  if (status != null) updates.status = String(status).trim();

  const { data, error } = await supabase
    .from('mc_boards')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id,name,description,status,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Board not found' });

  emitAudit(supabase, { userId: req.user.id, eventType: 'board.updated', actor: req.user.email || req.user.id, payload: { boardId: data.id, updates } });
  return res.json({ board: data });
});

router.delete('/api/boards/:id', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
  const { error } = await supabase
    .from('mc_boards')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });

  emitAudit(supabase, { userId: req.user.id, eventType: 'board.deleted', actor: req.user.email || req.user.id, payload: { boardId: req.params.id } });
  return res.json({ ok: true });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

router.get('/api/boards/:boardId/tasks', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });

  // Verify board belongs to user
  const { data: board } = await supabase
    .from('mc_boards')
    .select('id')
    .eq('id', req.params.boardId)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const { data, error } = await supabase
    .from('mc_tasks')
    .select('id,board_id,title,description,status,column_status,priority,assignee_agent,tags,created_at')
    .eq('board_id', req.params.boardId)
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ tasks: data || [] });
});

router.post('/api/boards/:boardId/tasks', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
  const { title, description, status, column_status, priority, assignee_agent, tags } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });

  // Verify board belongs to user
  const { data: board } = await supabase
    .from('mc_boards')
    .select('id')
    .eq('id', req.params.boardId)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const { data, error } = await supabase
    .from('mc_tasks')
    .insert({
      board_id: req.params.boardId,
      user_id: req.user.id,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      status: status || 'todo',
      column_status: column_status || 'inbox',
      priority: priority || 'medium',
      assignee_agent: assignee_agent ? String(assignee_agent).trim() : null,
      tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
    })
    .select('id,board_id,title,description,status,column_status,priority,assignee_agent,tags,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  emitAudit(supabase, { userId: req.user.id, eventType: 'task.created', actor: req.user.email || req.user.id, payload: { taskId: data.id, title: data.title, boardId: req.params.boardId } });
  return res.status(201).json({ task: data });
});

router.patch('/api/tasks/:id', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
    .select('id,board_id,title,description,status,column_status,priority,assignee_agent,tags,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Task not found' });

  emitAudit(supabase, { userId: req.user.id, eventType: 'task.updated', actor: req.user.email || req.user.id, payload: { taskId: data.id, updates } });
  return res.json({ task: data });
});

router.delete('/api/tasks/:id', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const logs = getRecentLogs(0).slice(-40);
  return res.json({ gateway, logs });
});

// ── Board Groups ───────────────────────────────────────────────────────────────

router.get('/api/board-groups', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
  const { data, error } = await supabase
    .from('mc_board_groups')
    .select('id,name,description,created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ groups: data || [] });
});

router.post('/api/board-groups', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
  const { data, error } = await supabase
    .from('mc_agents')
    .select('id,name,role,board_id,status,last_seen_at,metadata,created_at')
    .eq('user_id', req.user.id)
    .order('name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ agents: data || [] });
});

router.post('/api/agents', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
  const { name, role, board_id, metadata } = req.body || {};
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
    })
    .select('id,name,role,board_id,status,last_seen_at,metadata,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  emitAudit(supabase, { userId: req.user.id, eventType: 'agent.created', actor: req.user.email || req.user.id, payload: { agentId: data.id, name: data.name } });
  return res.status(201).json({ agent: data });
});

router.patch('/api/agents/:id', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
  const { name, role, board_id, status, metadata } = req.body || {};
  const updates = {};
  if (name != null) updates.name = name.trim();
  if (role != null) updates.role = role.trim();
  if (board_id !== undefined) updates.board_id = board_id || null;
  if (status != null) updates.status = status;
  if (metadata != null) updates.metadata = metadata;
  const { data, error } = await supabase
    .from('mc_agents')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id,name,role,board_id,status,last_seen_at,metadata,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Agent not found' });
  return res.json({ agent: data });
});

router.delete('/api/agents/:id', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
  const { error } = await supabase
    .from('mc_agents')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// ── Live Feed (recent audit events as activity stream) ────────────────────────

router.get('/api/live-feed', async (req, res) => {
  const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
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

export default router;
