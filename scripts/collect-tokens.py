#!/usr/bin/env python3
"""scripts/collect-tokens.py

Recolector de consumo de tokens (Anthropic/Hermes + Antigravity). CERO LLM
en el ciclo: solo corre comandos locales, parsea texto/JSON y hace un POST
HTTP. Pensado para correr cada 2 minutos vía cron DESDE ESTE HOST WINDOWS
(no vive en el servidor del dashboard: usa `hermes insights` por perfil y
profiles/edith/ops/agy-usage.jsonl, que solo existen en esta máquina).

Reutiliza la lógica de profiles/edith/ops/build_token_dashboard.py (ya
construida por Edith para el archivo HTML estático), adaptada al patrón
cliente-servidor: en vez de escribir un .html, arma el mismo snapshot como
JSON y lo sube con POST /api/tokens/snapshot al dashboard, que lo cachea en
SQLite y lo sirve en GET /api/tokens/usage.

Uso:
  python collect-tokens.py              # una corrida
  python collect-tokens.py --loop       # corre cada 2 min (Ctrl+C para salir)
  python collect-tokens.py --days 1     # ventana de "hermes insights" (default 1)

Env vars:
  TOKENS_API_URL     - default http://localhost:3000/api/tokens/snapshot
  TELEMETRY_API_KEY  - si está seteada, se envía como header X-API-KEY
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

OPS_DIR = r"C:\Users\elias\AppData\Local\hermes\profiles\edith\ops"
AGY_LOG = os.path.join(OPS_DIR, "agy-usage.jsonl")
BOTS = ["edith", "merlin", "hernan"]
INTERVAL_SECONDS = 120  # cada 2 minutos, por encargo del Jefe


def run_insights(bot, days):
    """Corre `hermes -p <bot> insights --days N` y parsea la salida de texto.
    No invoca ningún LLM: es el mismo comando de analítica local que ya corre
    el Jefe a mano.

    IMPORTANTE: siempre con -p <bot> explícito, nunca el comando "pelado"
    (`hermes insights` sin -p). Sin -p, el CLI usa el perfil default de la
    SHELL que lo invoca (en una sesión de hernan, "pelado" == hernan; en una
    de edith, == edith), lo que duplicaba los números de hernan bajo "edith"
    cuando este script corría desde una shell de hernan. Con -p explícito el
    resultado no depende de qué perfil lanzó el recolector."""
    cmd = ["hermes", "-p", bot, "insights", "--days", str(days)]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60,
                              shell=(os.name == "nt")).stdout
    except Exception as e:
        return {"bot": bot, "error": str(e), "input_tokens": 0, "output_tokens": 0,
                "total_tokens": 0, "sessions": 0, "cost_usd": 0.0, "models": []}

    def num(pat, s, default=0):
        m = re.search(pat, s)
        return int(m.group(1).replace(",", "")) if m else default

    def cost(s):
        m = re.search(r"Estimated:\s*~?\$([0-9.]+)", s)
        return float(m.group(1)) if m else 0.0

    models = []
    in_models = False
    for line in out.splitlines():
        if "Models Used" in line:
            in_models = True
            continue
        if in_models:
            if "Platforms" in line:
                break
            m = re.match(r"\s*([\w.\-]+)\s+(\d+)\s+([\d,]+)", line)
            if m:
                models.append({"model": m.group(1), "sessions": int(m.group(2)),
                               "tokens": int(m.group(3).replace(",", ""))})

    return {
        "bot": bot,
        "input_tokens": num(r"Input tokens:\s*([\d,]+)", out),
        "output_tokens": num(r"Output tokens:\s*([\d,]+)", out),
        "total_tokens": num(r"Total tokens:\s*([\d,]+)", out),
        "sessions": num(r"Sessions:\s*(\d+)", out),
        "cost_usd": cost(out),
        "models": models,
    }


def read_agy_usage():
    """Lee agy-usage.jsonl (log de llamadas a Antigravity CLI, una línea JSON
    por llamada) y agrega por bot + por modelo. Puro parseo, sin red ni LLM."""
    rows = []
    if os.path.exists(AGY_LOG):
        with open(AGY_LOG, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except Exception:
                    pass

    by_bot = {}
    for r in rows:
        b = r.get("bot", "unknown")
        entry = by_bot.setdefault(b, {"bot": b, "calls": 0, "total_tokens": 0,
                                       "cache_read_tokens": 0, "models": {}})
        entry["calls"] += 1
        entry["total_tokens"] += r.get("total_tokens", 0)
        entry["cache_read_tokens"] += r.get("cache_read_tokens", 0)
        model_name = r.get("model", "desconocido")
        entry["models"][model_name] = entry["models"].get(model_name, 0) + r.get("total_tokens", 0)

    return list(by_bot.values())


def build_snapshot(days):
    anthropic_by_bot = [run_insights(b, days) for b in BOTS]
    antigravity_by_bot = read_agy_usage()

    anthropic_total_tokens = sum(a.get("total_tokens", 0) for a in anthropic_by_bot)
    anthropic_total_cost = round(sum(a.get("cost_usd", 0) for a in anthropic_by_bot), 4)
    antigravity_total_tokens = sum(b["total_tokens"] for b in antigravity_by_bot)
    antigravity_total_calls = sum(b["calls"] for b in antigravity_by_bot)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "days": days,
        "anthropic": {
            "total_tokens": anthropic_total_tokens,
            "total_cost_usd": anthropic_total_cost,
            "by_bot": anthropic_by_bot,
        },
        "antigravity": {
            "total_tokens": antigravity_total_tokens,
            "total_calls": antigravity_total_calls,
            "by_bot": antigravity_by_bot,
        },
    }


def post_snapshot(snapshot, api_url, api_key):
    body = json.dumps(snapshot).encode("utf-8")
    req = urllib.request.Request(api_url, data=body, method="POST",
                                  headers={"Content-Type": "application/json"})
    if api_key:
        req.add_header("X-API-KEY", api_key)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def run_once(days, api_url, api_key, dry_run=False):
    snapshot = build_snapshot(days)
    if dry_run:
        print(json.dumps(snapshot, indent=2, ensure_ascii=False))
        return snapshot
    try:
        status, body = post_snapshot(snapshot, api_url, api_key)
        print(f"[{snapshot['generated_at']}] POST {api_url} -> {status} {body}")
    except urllib.error.URLError as e:
        print(f"[{snapshot['generated_at']}] ERROR posteando snapshot: {e}", file=sys.stderr)
    return snapshot


def main():
    parser = argparse.ArgumentParser(description="Recolector de consumo de tokens (cero LLM).")
    parser.add_argument("--days", type=int, default=1, help="ventana para hermes insights (default 1)")
    parser.add_argument("--loop", action="store_true", help="corre cada 2 minutos en vez de una sola vez")
    parser.add_argument("--dry-run", action="store_true", help="imprime el snapshot, no hace POST")
    parser.add_argument("--api-url", default=os.environ.get("TOKENS_API_URL", "http://localhost:3000/api/tokens/snapshot"))
    args = parser.parse_args()

    api_key = os.environ.get("TELEMETRY_API_KEY", "")

    if not args.loop:
        run_once(args.days, args.api_url, api_key, dry_run=args.dry_run)
        return

    print(f"Recolector en loop cada {INTERVAL_SECONDS}s. Ctrl+C para salir.")
    while True:
        run_once(args.days, args.api_url, api_key, dry_run=args.dry_run)
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
