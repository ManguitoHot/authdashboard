const express = require('express');
const path = require('path');
const { db, initSchema, DB_PATH } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.TELEMETRY_API_KEY;

app.use(express.json());

// El Wizard se abre como file:// en la máquina de cada persona (no hay un
// solo origen conocido), así que las rutas /api quedan abiertas a cualquier
// origen. El riesgo es bajo: solo se puede sumar clicks/drags, no leer ni
// modificar nada sensible.
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // sin TELEMETRY_API_KEY configurada -> abierto (solo para probar local)
  if (req.header('X-API-KEY') !== API_KEY) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  next();
}

const insertEvent = db.prepare(`
  INSERT INTO telemetry_events (tool_id, signal_id, signal_label, user_name)
  VALUES (?, ?, ?, ?)
`);

// Recibe una señal (click o drag) desde el Wizard u otra herramienta.
app.post('/api/telemetry/signal', requireApiKey, (req, res) => {
  const { tool_id, signal_id, signal_label, user } = req.body || {};
  if (!tool_id || !signal_id) {
    return res.status(400).json({ error: 'missing_tool_id_or_signal_id' });
  }
  try {
    insertEvent.run(
      String(tool_id),
      String(signal_id),
      String(signal_label || signal_id),
      user ? String(user) : null
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Error insertando evento de telemetría', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

const selectAggregated = db.prepare(`
  SELECT signal_id, signal_label,
         COUNT(*) AS clicks,
         GROUP_CONCAT(DISTINCT user_name) AS users_concat,
         MAX(created_at) AS last_triggered
  FROM telemetry_events
  WHERE tool_id = ?
  GROUP BY signal_id, signal_label
  ORDER BY clicks DESC
`);

// Devuelve las señales agregadas de una herramienta (lo que consume el dashboard).
app.get('/api/telemetry/tool/:toolId', (req, res) => {
  try {
    const rows = selectAggregated.all(req.params.toolId);
    res.json({
      tool_id: req.params.toolId,
      signals: rows.map(r => ({
        id: r.signal_id,
        label: r.signal_label,
        clicks: r.clicks,
        uniqueUsers: r.users_concat ? r.users_concat.split(',').filter(Boolean) : [],
        lastTriggered: r.last_triggered ? r.last_triggered.replace(' ', 'T') + 'Z' : null,
      })),
    });
  } catch (err) {
    console.error('Error leyendo telemetría', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, db: DB_PATH }));

// Sirve el dashboard (index.html/app.js/styles.css) desde el mismo servicio.
app.use(express.static(path.join(__dirname, '..')));

try {
  initSchema();
  app.listen(PORT, () => console.log(`Dashboard + telemetría escuchando en :${PORT} (db: ${DB_PATH})`));
} catch (err) {
  console.error('No se pudo inicializar la base de datos', err);
  process.exit(1);
}
