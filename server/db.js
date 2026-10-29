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
  // Portafolio del dashboard (proyectos, herramientas y bitácora) como un único
  // documento JSON. Antes vivía en el localStorage de cada navegador, que está
  // atado al dominio: al cambiar de URL se "perdía".
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Estado de los agentes del equipo (Hernan, Merlin, Edith, etc.).
  // Cada agente tiene un único registro que se sobre-escribe con cada heartbeat.
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_status (
      agent_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT,
      last_action TEXT,
      last_action_at TEXT,
      source TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_status_last_action_at ON agent_status(last_action_at);`);
}

// Se corre acá, al cargar el módulo, para garantizar que la tabla ya existe
// antes de que index.js prepare cualquier consulta contra ella.
initSchema();

module.exports = { db, initSchema, DB_PATH };
