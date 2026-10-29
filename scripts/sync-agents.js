#!/usr/bin/env node
/**
 * scripts/sync-agents.js
 *
 * Lee bitacora.md y heartbeats para sincronizar el estado de los agentes
 * hacia POST /api/agents/status.  Diseñado para correr cada 5-10 min vía cron.
 *
 * Env vars:
 *   BITACORA_PATH      – ruta al bitacora.md
 *   AGENTS_API_URL     – (default http://localhost:3000/api/agents/status)
 *   TELEMETRY_API_KEY  – si se fija, se envía como X-API-KEY
 *   HEARTBEAT_HERNAN   – ruta a heartbeat file de hernan
 *   HEARTBEAT_MERLIN   – ruta a heartbeat file de merlin
 *   HEARTBEAT_EDITH    – ruta a heartbeat file de edith
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── Configuración ──────────────────────────────────────────────────────
const BITACORA_PATH = process.env.BITACORA_PATH;
const API_URL       = process.env.AGENTS_API_URL || 'http://localhost:3000/api/agents/status';
const API_KEY       = process.env.TELEMETRY_API_KEY || '';

const AGENTS = [
  { id: 'hernan', name: 'Hernán',  role: 'Sub-agente operativo' },
  { id: 'merlin', name: 'Merlín',  role: 'Sub-agente operativo' },
  { id: 'edith',  name: 'Edith',   role: 'Jefe de proyecto (autora de bitácora)' },
];

// ── Parseo de bitácora ─────────────────────────────────────────────────

/**
 * Regex para líneas con el formato:
 *   - YYYY-MM-DD HH:MM · tipo · detalle
 * Captura: fecha (1), hora opcional (2), tipo (3), detalle (4)
 */
const LINE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s*(\d{2}:\d{2})?\s*·\s*(.+?)\s*·\s*(.+)$/;

function parseBitacora(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines   = content.split(/\r?\n/);

  // Para cada agente guardamos la ÚLTIMA línea que le menciona.
  const last = {}; // agent_id -> { action, datetime }

  for (const raw of lines) {
    const m = raw.match(LINE_RE);
    if (!m) continue;

    const [, date, time, tipo, detalle] = m;
    const tipoLower   = tipo.toLowerCase();
    const fullAction   = `${tipo} · ${detalle}`;
    const isoDatetime  = time ? `${date}T${time}:00Z` : `${date}T00:00:00Z`;

    for (const agent of AGENTS) {
      let matches = false;

      // 'respuesta hernan', 'delegación→hernan', etc.
      if (tipoLower.includes(agent.id)) {
        matches = true;
      }
      // 'decisión Jefe' lines count as edith's own log
      if (agent.id === 'edith' && (tipoLower.includes('decisión') || tipoLower.includes('decision') || tipoLower.includes('jefe'))) {
        matches = true;
      }
      // Detalle mentioning the agent name
      if (detalle.toLowerCase().includes(agent.id)) {
        matches = true;
      }

      if (matches) {
        // Siempre sobreescribimos: como iteramos en orden de archivo,
        // al terminar tenemos la ÚLTIMA línea.
        last[agent.id] = { action: fullAction, datetime: isoDatetime };
      }
    }
  }
  return last;
}

// ── Heartbeat ──────────────────────────────────────────────────────────

function readHeartbeat(agentId) {
  const envKey  = `HEARTBEAT_${agentId.toUpperCase()}`;
  const hbPath  = process.env[envKey];
  if (!hbPath || !fs.existsSync(hbPath)) return null;

  const content = fs.readFileSync(hbPath, 'utf-8').trim();
  const parts   = content.split(/\s+/);
  if (!parts[0]) return null;

  const epochSec = parseFloat(parts[0]);
  if (isNaN(epochSec)) return null;

  return {
    datetime: new Date(epochSec * 1000).toISOString(),
    action:   'Activo (heartbeat de cron), sin detalle de accion especifica',
    source:   'ticker_heartbeat',
  };
}

// ── POST helper ────────────────────────────────────────────────────────

function postAgent(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(API_URL);

    const headers = {
      'Content-Type':   'application/json',
      'Content-Length':  Buffer.byteLength(body),
    };
    if (API_KEY) headers['X-API-KEY'] = API_KEY;

    const req = http.request(
      {
        hostname: parsed.hostname,
        port:     parsed.port || 80,
        path:     parsed.pathname,
        method:   'POST',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const bitacoraData = parseBitacora(BITACORA_PATH);

  for (const agent of AGENTS) {
    let entry = bitacoraData[agent.id];
    let source = 'bitacora.md';

    // Si la bitácora no tiene línea para este agente, intentar heartbeat.
    if (!entry) {
      const hb = readHeartbeat(agent.id);
      if (!hb) {
        console.log(`[sync-agents] Sin datos para ${agent.id}, omitiendo.`);
        continue;
      }
      entry  = { action: hb.action, datetime: hb.datetime };
      source = hb.source;
    }

    const payload = {
      agent_id:       agent.id,
      name:           agent.name,
      role:           agent.role,
      last_action:    entry.action,
      last_action_at: entry.datetime,
      source,
    };

    try {
      await postAgent(payload);
      console.log(`[sync-agents] ✔ ${agent.id} actualizado (source: ${source})`);
    } catch (err) {
      console.error(`[sync-agents] ✘ ${agent.id}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error('[sync-agents] Error fatal:', err);
  process.exit(1);
});
