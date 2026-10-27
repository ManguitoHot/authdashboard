/**
 * Vista "Red": el portafolio como un átomo / red neuronal.
 * Centro (Automation Lead) -> proyectos -> herramientas -> señales.
 * Solo dibuja lo que ya existe en `store` (proyectos, herramientas, señales
 * reales de telemetría). No inventa nodos ni números.
 */
(function () {
  const canvas = document.getElementById("networkCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const tip = document.getElementById("networkTooltip");
  const emptyMsg = document.getElementById("networkEmpty");

  const css = getComputedStyle(document.documentElement);
  const COLOR = {
    root: css.getPropertyValue("--sunset-peach").trim() || "#38bdf8",
    optimal: css.getPropertyValue("--status-optimal-text").trim() || "#10b981",
    warning: css.getPropertyValue("--status-warning-text").trim() || "#eab308",
    danger: css.getPropertyValue("--status-danger-text").trim() || "#f43f5e",
    planned: css.getPropertyValue("--status-planned-text").trim() || "#38bdf8",
    tool: css.getPropertyValue("--sunset-orange").trim() || "#00bcd4",
    signal: "#94a3b8",
    text: css.getPropertyValue("--text-primary").trim() || "#f1f5f9",
  };

  let nodes = [];
  let links = [];
  let byId = new Map();
  let width = 0;
  let height = 0;
  let U = 180; // radio útil del lienzo; los anillos y resortes se miden en fracciones de U
  let hover = null;
  let drag = null;
  let moved = false;
  let running = false;
  let raf = 0;
  let alpha = 1; // "temperatura" de la simulación: baja sola y se reaviva al interactuar
  const lastClicks = new Map(); // id de señal -> clicks vistos, para detectar señales nuevas
  const pulses = []; // { id, t }
  const RING = { root: 0, project: 0.38, tool: 0.66, signal: 0.9 }; // órbita de cada nivel, como capas de un átomo

  function fmtDate(v) {
    if (!v) return "Sin señales aún";
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  // Reconstruye nodos y enlaces desde el store, conservando la posición de los que ya existían.
  function build() {
    const old = byId;
    const next = [];
    const nextLinks = [];
    const add = (n) => {
      const prev = old.get(n.id);
      if (prev) { n.x = prev.x; n.y = prev.y; n.vx = prev.vx; n.vy = prev.vy; }
      else {
        const a = Math.random() * Math.PI * 2;
        const r = RING[n.kind] * U;
        n.x = width / 2 + Math.cos(a) * r;
        n.y = height / 2 + Math.sin(a) * r;
        n.vx = 0; n.vy = 0;
      }
      next.push(n);
      return n;
    };

    add({ id: "root", kind: "root", label: "Automation Lead", r: 30, color: COLOR.root });

    const projects = store.getProjects();
    const tools = store.getTools();
    projects.forEach((p) => {
      const m = getProjectControlMetrics(p, tools);
      add({ id: "p:" + p.id, kind: "project", ref: p, metrics: m, label: p.name, r: 20 + Math.min(m.toolCount, 5) * 1.5, color: COLOR[m.health] || COLOR.planned });
      nextLinks.push({ a: "root", b: "p:" + p.id });
    });
    tools.forEach((t) => {
      const parent = projects.find((p) => p.id === t.projectId);
      add({ id: "t:" + t.id, kind: "tool", ref: t, label: t.name, r: 13, color: COLOR.tool });
      nextLinks.push({ a: parent ? "p:" + parent.id : "root", b: "t:" + t.id });
      (t.signals || []).forEach((s) => {
        const sid = "s:" + t.id + ":" + s.id;
        const clicks = s.clicks || 0;
        add({ id: sid, kind: "signal", ref: s, tool: t, label: s.label, r: 6 + Math.min(Math.sqrt(clicks), 10), color: COLOR.signal });
        nextLinks.push({ a: "t:" + t.id, b: sid });
        // Pulso cuando entran clicks nuevos desde la última lectura (no en la carga inicial).
        if (lastClicks.has(sid) && clicks > lastClicks.get(sid)) pulses.push({ id: sid, t: 0 });
        lastClicks.set(sid, clicks);
      });
    });

    nodes = next;
    byId = new Map(nodes.map((n) => [n.id, n]));
    links = nextLinks.map((l) => ({ ...l, source: byId.get(l.a), target: byId.get(l.b) })).filter((l) => l.source && l.target);
    emptyMsg.style.display = projects.length === 0 ? "block" : "none";
    alpha = Math.max(alpha, 0.6);
  }

  function step() {
    const cx = width / 2, cy = height / 2;
    // Repulsión entre todos los nodos (como cargas del mismo signo).
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy || 0.01;
        const d = Math.sqrt(d2);
        const f = (7000 * (U / 310) * (U / 310) * alpha) / d2;
        dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f;
        b.vx += dx * f; b.vy += dy * f;
      }
    }
    // Resortes a lo largo de los enlaces: cada nivel tiene su distancia natural.
    links.forEach((l) => {
      const rest = (l.source.kind === "root" ? 0.38 : l.source.kind === "project" ? 0.28 : 0.24) * U;
      const dx = l.target.x - l.source.x, dy = l.target.y - l.source.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - rest) * 0.02 * Math.max(alpha, 0.15);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      l.source.vx += fx; l.source.vy += fy;
      l.target.vx -= fx; l.target.vy -= fy;
    });
    nodes.forEach((n) => {
      if (n.kind === "root") { n.vx += (cx - n.x) * 0.05; n.vy += (cy - n.y) * 0.05; }
      else {
        const root = byId.get("root");
        const dx = n.x - root.x, dy = n.y - root.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - RING[n.kind] * U) * 0.07 * Math.max(alpha, 0.4);
        n.vx -= (dx / d) * f; n.vy -= (dy / d) * f;
      }
      // Deriva suave para que "respire" aunque la simulación esté fría.
      n.vx += (Math.random() - 0.5) * 0.03; n.vy += (Math.random() - 0.5) * 0.03;
      if (n === drag) { n.vx = 0; n.vy = 0; return; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.min(width - n.r, Math.max(n.r, n.x));
      n.y = Math.min(height - n.r, Math.max(n.r, n.y));
    });
    alpha = Math.max(alpha * 0.985, 0.08);
  }

  function neighborsOf(n) {
    const set = new Set([n.id]);
    links.forEach((l) => {
      if (l.source === n) set.add(l.target.id);
      if (l.target === n) set.add(l.source.id);
    });
    return set;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const focus = hover ? neighborsOf(hover) : null;

    links.forEach((l) => {
      const on = !focus || (focus.has(l.source.id) && focus.has(l.target.id));
      ctx.strokeStyle = on ? "rgba(125,211,252,0.35)" : "rgba(148,163,184,0.08)";
      ctx.lineWidth = on && focus ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y); ctx.stroke();
    });

    // Pulsos: un punto de luz que viaja por el enlace hacia la señal cuando llega un click real.
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += 0.018;
      if (p.t >= 1) { pulses.splice(i, 1); continue; }
      const l = links.find((x) => x.target.id === p.id);
      if (!l) continue;
      const x = l.source.x + (l.target.x - l.source.x) * p.t;
      const y = l.source.y + (l.target.y - l.source.y) * p.t;
      ctx.fillStyle = "#ffffff"; ctx.shadowColor = COLOR.root; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    const time = performance.now() / 1000;
    nodes.forEach((n) => {
      const dim = focus && !focus.has(n.id);
      const breathe = n.kind === "root" ? Math.sin(time * 1.6) * 1.5 : 0;
      ctx.globalAlpha = dim ? 0.18 : 1;
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.4);
      g.addColorStop(0, n.color + "55"); g.addColorStop(1, n.color + "00");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0a0e16"; ctx.strokeStyle = n.color; ctx.lineWidth = n === hover ? 3 : 2;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + breathe, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (n.kind !== "signal" || n === hover || (focus && focus.has(n.id))) {
        ctx.fillStyle = COLOR.text;
        ctx.font = (n.kind === "root" ? "600 12px " : "500 11px ") + "'Plus Jakarta Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(n.label, n.x, n.y + n.r + 15);
      }
      ctx.globalAlpha = 1;
    });
  }

  function loop() {
    if (!running) return;
    step(); draw();
    raf = requestAnimationFrame(loop);
  }

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = Math.max(320, box.width);
    height = Math.max(480, Math.min(720, window.innerHeight - 140));
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = width + "px"; canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    U = Math.max(120, Math.min(width / 2, height / 2) - 30);
  }

  function pick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if ((n.x - x) ** 2 + (n.y - y) ** 2 <= (n.r + 4) ** 2) return { n, x, y };
    }
    return { n: null, x, y };
  }

  function tooltipHtml(n) {
    if (n.kind === "root") return `<strong>Automation Lead</strong><br>${store.getProjects().length} proyectos · ${store.getTools().length} herramientas`;
    if (n.kind === "project") {
      const m = n.metrics;
      return `<strong>${n.label}</strong><br>${n.ref.department || ""} · PM ${n.ref.lead || "N/A"}<br>Adopción: ${m.adoptionPercent}% · ${m.toolCount} herramienta(s)`;
    }
    if (n.kind === "tool") {
      const sig = n.ref.signals || [];
      const clicks = sig.reduce((s, x) => s + (x.clicks || 0), 0);
      return `<strong>${n.label}</strong><br>${sig.length} señal(es) · ${clicks} clicks en total`;
    }
    const s = n.ref;
    const users = (s.uniqueUsers || []).length ? s.uniqueUsers.join(", ") : "sin usuarios registrados";
    return `<strong>${n.label}</strong><br>Clicks: ${s.clicks || 0}<br>Última vez: ${fmtDate(s.lastTriggered)}<br>Usuario: ${users}`;
  }

  canvas.addEventListener("pointermove", (e) => {
    const { n, x, y } = pick(e);
    if (drag) { drag.x = x; drag.y = y; moved = true; alpha = Math.max(alpha, 0.5); }
    hover = drag || n;
    canvas.style.cursor = hover ? (drag ? "grabbing" : "pointer") : "default";
    if (hover) {
      tip.innerHTML = tooltipHtml(hover);
      tip.style.display = "block";
      tip.style.left = Math.max(8, Math.min(x + 16, width - tip.offsetWidth - 8)) + "px";
      tip.style.top = Math.max(8, Math.min(y + 16, height - tip.offsetHeight - 8)) + "px";
    } else tip.style.display = "none";
  });
  canvas.addEventListener("pointerdown", (e) => {
    const { n } = pick(e);
    if (n) { drag = n; moved = false; canvas.setPointerCapture(e.pointerId); }
  });
  canvas.addEventListener("pointerup", () => {
    const n = drag; drag = null;
    if (!n || moved) return;
    // Clic sin arrastre: abre la ficha que ya existe en el dashboard.
    if (n.kind === "project") openProjectDrawer(n.ref.id);
    else if (n.kind === "tool") openToolSignalsModal(n.ref.id);
    else if (n.kind === "signal") openToolSignalsModal(n.tool.id);
  });
  canvas.addEventListener("pointerleave", () => { if (!drag) { hover = null; tip.style.display = "none"; } });

  // API para app.js: se llama al entrar y salir de la pestaña.
  window.networkView = {
    start() { resize(); build(); if (!running) { running = true; loop(); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    // Avanza la simulación n pasos de golpe (útil en pruebas, donde los fotogramas van lento).
    settle(n = 300) { for (let i = 0; i < n; i++) step(); draw(); },
  };

  window.addEventListener("resize", () => { if (running) resize(); });
  // El store se actualiza con la telemetría cada 30 s; revisamos más seguido para que el pulso llegue a tiempo.
  setInterval(() => { if (running && !drag) build(); }, 5000);
})();
