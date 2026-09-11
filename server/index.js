const express = require('express');
const path = require('path');
const { db, DB_PATH } = require('./db'); // requerir db.js ya crea la tabla (ver db.js)

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

// Solo protege ESCRITURA (POST /signal) -> evita que cualquiera infle los
// contadores. Los GET (ver señales, eventos crudos, exportar CSV/DB) quedan
// públicos a propósito, para que el propio dashboard los pueda mostrar sin
// tener que llevar la key de escritura en el código del cliente.
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

const selectRawEvents = db.prepare(`
  SELECT id, tool_id, signal_id, signal_label, user_name, created_at
  FROM telemetry_events
  ORDER BY id DESC
  LIMIT ?
`);
const selectRawEventsByTool = db.prepare(`
  SELECT id, tool_id, signal_id, signal_label, user_name, created_at
  FROM telemetry_events
  WHERE tool_id = ?
  ORDER BY id DESC
  LIMIT ?
`);

// Debug/auditoría: eventos crudos (uno por fila), no agregados. Igual que
// /api/telemetry/tool/:id, queda de lectura pública (sin API Key) para que
// el propio dashboard pueda mostrarlo sin tener que exponer la key de
// escritura en el código del cliente. Uso: GET /api/telemetry/events?limit=100
// o ?tool_id=wizard_curvas_starcom
app.get('/api/telemetry/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  try {
    const rows = req.query.tool_id
      ? selectRawEventsByTool.all(req.query.tool_id, limit)
      : selectRawEvents.all(limit);
    res.json({ count: rows.length, events: rows });
  } catch (err) {
    console.error('Error leyendo eventos crudos', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Exporta todos los eventos (o filtrados por herramienta) como CSV, listo
// para abrir en Excel.
app.get('/api/telemetry/export.csv', (req, res) => {
  try {
    const rows = req.query.tool_id
      ? selectRawEventsByTool.all(req.query.tool_id, 100000)
      : selectRawEvents.all(100000);
    const header = 'id,tool_id,signal_id,signal_label,user_name,created_at';
    const lines = rows.map(r =>
      [r.id, r.tool_id, r.signal_id, r.signal_label, r.user_name, r.created_at].map(csvEscape).join(',')
    );
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="telemetria_eventos_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Error exportando CSV', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Descarga el archivo SQLite completo, tal cual está en el servidor.
app.get('/api/telemetry/export/db', (req, res) => {
  try {
    db.pragma('wal_checkpoint(FULL)'); // vuelca lo pendiente del WAL al .db antes de servirlo
    res.download(DB_PATH, `telemetry_${new Date().toISOString().slice(0, 10)}.db`);
  } catch (err) {
    console.error('Error exportando la base de datos', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, db: DB_PATH }));

// Sirve el dashboard (index.html/app.js/styles.css) desde el mismo servicio.
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => console.log(`Dashboard + telemetría escuchando en :${PORT} (db: ${DB_PATH})`));
