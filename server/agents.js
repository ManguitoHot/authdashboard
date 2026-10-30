/**
 * server/agents.js
 * Rutas para consultar y actualizar el estado de los agentes del equipo.
 */

function mountAgentRoutes(app, db, requireApiKey) {
  // ── Prepared statements ──────────────────────────────────────────────
  const selectAll = db.prepare(`
    SELECT agent_id, name, role, last_action, last_action_at, source, updated_at
    FROM agent_status
    ORDER BY last_action_at DESC
  `);

  const upsert = db.prepare(`
    INSERT INTO agent_status (agent_id, name, role, last_action, last_action_at, source, updated_at)
    VALUES (@agent_id, @name, @role, @last_action, @last_action_at, @source, datetime('now'))
    ON CONFLICT(agent_id) DO UPDATE SET
      name            = excluded.name,
      role            = excluded.role,
      last_action     = excluded.last_action,
      last_action_at  = excluded.last_action_at,
      source          = excluded.source,
      updated_at      = datetime('now')
  `);

  // ── GET /api/agents/status  (requiere API Key) ────────────────────────────────
  app.get('/api/agents/status', requireApiKey, (req, res) => {
    try {
      const rows = selectAll.all();
      const now = Date.now();

      const agents = rows.map(r => {
        let status = 'offline';
        if (r.last_action_at) {
          const diffMs = now - new Date(r.last_action_at).getTime();
          const FIFTEEN_MIN = 15 * 60 * 1000;
          const TWO_HOURS   = 2 * 60 * 60 * 1000;
          if (diffMs <= FIFTEEN_MIN) status = 'live';
          else if (diffMs <= TWO_HOURS) status = 'idle';
        }
        return { ...r, status };
      });

      res.json(agents);
    } catch (err) {
      console.error('Error leyendo agent_status', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── POST /api/agents/status  (protegido) ─────────────────────────────
  app.post('/api/agents/status', requireApiKey, (req, res) => {
    const { agent_id, name, role, last_action, last_action_at, source } = req.body || {};

    if (!agent_id || !name) {
      return res.status(400).json({ error: 'missing_agent_id_or_name' });
    }

    try {
      upsert.run({
        agent_id:       String(agent_id),
        name:           String(name),
        role:           role ? String(role) : null,
        last_action:    last_action ? String(last_action) : null,
        last_action_at: last_action_at ? String(last_action_at) : new Date().toISOString(),
        source:         source ? String(source) : null,
      });
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('Error upserting agent_status', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });
}

module.exports = { mountAgentRoutes };
