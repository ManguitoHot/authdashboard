const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// DB_PATH debe apuntar dentro del volumen persistente que montes en
// EasyPanel (pestaña "Almacenamiento" -> "Agregar montaje de volumen"),
// si no, el archivo se pierde en cada redeploy.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'telemetry.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      signal_label TEXT NOT NULL,
      user_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telemetry_events_tool_id ON telemetry_events(tool_id);`);
}

// Se corre acá, al cargar el módulo, para garantizar que la tabla ya existe
// antes de que index.js prepare cualquier consulta contra ella.
initSchema();

module.exports = { db, initSchema, DB_PATH };
