/**
 * server/tokens.js
 *
 * Rutas de "Consumo de Tokens". El servidor NO calcula nada: solo cachea el
 * último snapshot que le sube un recolector externo (script puro, cero LLM
 * en el ciclo) y lo sirve. Mismo patrón que server/agents.js.
 *
 *   POST /api/tokens/snapshot  (protegido con TELEMETRY_API_KEY) - sube un
 *     snapshot nuevo (JSON libre, lo arma el recolector). Se guarda tal cual.
 *   GET  /api/tokens/usage     (público) - devuelve { data, updated_at } con
 *     el último snapshot subido, o { data: null, updated_at: null } si
 *     todavía no corrió el recolector.
 */

function mountTokenRoutes(app, db, requireApiKey) {
  const insertSnapshot = db.prepare(`
    INSERT INTO token_usage_snapshot (payload, created_at)
    VALUES (?, datetime('now'))
  `);

  const selectLatest = db.prepare(`
    SELECT payload, created_at
    FROM token_usage_snapshot
    ORDER BY id DESC
    LIMIT 1
  `);

  // Conserva solo los últimos 500 snapshots (a 2 min/snapshot son ~16h de
  // historial corto) para que la tabla no crezca sin límite.
  const pruneOld = db.prepare(`
    DELETE FROM token_usage_snapshot
    WHERE id NOT IN (SELECT id FROM token_usage_snapshot ORDER BY id DESC LIMIT 500)
  `);

  // ── POST /api/tokens/snapshot  (protegido) ───────────────────────────
  app.post('/api/tokens/snapshot', requireApiKey, (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
    try {
      insertSnapshot.run(JSON.stringify(payload));
      pruneOld.run();
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('Error guardando snapshot de tokens', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── GET /api/tokens/usage  (requiere API Key) ─────────────────────────────────
  app.get('/api/tokens/usage', requireApiKey, (req, res) => {
    try {
      const row = selectLatest.get();
      if (!row) return res.json({ data: null, updated_at: null });
      // SQLite guarda UTC sin zona: sin la "Z" el navegador lo leería como hora local.
      const updatedAt = row.created_at.replace(' ', 'T') + 'Z';
      res.json({ data: JSON.parse(row.payload), updated_at: updatedAt });
    } catch (err) {
      console.error('Error leyendo snapshot de tokens', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });
}

module.exports = { mountTokenRoutes };
