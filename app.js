/**
 * Sunset Glass Project Control & Tool Monitoring Dashboard
 * Telemetry Signals, Button Click Recognition, API Key / CLI / MCP Integration,
 * Primary Signal Summary Selection & Detailed Breakdown.
 */

// Initial Seed Data: Clean state with 0 initial projects
const INITIAL_DATA = {
  projects: [],
  tools: [],
  events: []
};

// Storage Controller
class Store {
  constructor() {
    this.storageKey = "sunset_glass_project_control_db_v3";
    try {
      localStorage.removeItem("sunset_glass_project_control_db_v1");
      localStorage.removeItem("sunset_glass_project_control_db_v2");
    } catch (e) {}
    this.data = this.load();
  }

  load() {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      this.save(INITIAL_DATA);
      return JSON.parse(JSON.stringify(INITIAL_DATA));
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error("Error loading localStorage, resetting to initial data", e);
      this.save(INITIAL_DATA);
      return JSON.parse(JSON.stringify(INITIAL_DATA));
    }
  }

  save(data = this.data) {
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }

  reset() {
    this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
    this.save();
  }

  getProjects() {
    return this.data.projects || [];
  }

  getTools() {
    return this.data.tools || [];
  }

  getEvents() {
    return this.data.events || [];
  }

  addProject(project) {
    if (!this.data.projects) this.data.projects = [];
    this.data.projects.unshift(project);
    this.save();
  }

  addTool(tool) {
    if (!this.data.tools) this.data.tools = [];
    this.data.tools.unshift(tool);
    this.save();
  }

  addEvent(event) {
    if (!this.data.events) this.data.events = [];
    this.data.events.unshift(event);
    if (this.data.events.length > 50) {
      this.data.events.pop();
    }
    this.save();
  }

  incrementToolUsage(toolId, additionalUsers = 1) {
    const tool = this.data.tools.find(t => t.id === toolId);
    if (tool) {
      // If tool has a primary signal, trigger that signal
      if (tool.signals && tool.signals.length > 0) {
        const primarySignal = tool.signals.find(s => s.id === tool.primarySignalId) || tool.signals[0];
        primarySignal.clicks = (primarySignal.clicks || 0) + 1;
        primarySignal.lastTriggered = "Hace unos segundos";
        if (!primarySignal.uniqueUsers) primarySignal.uniqueUsers = [];
        const userNames = ["Valeria C.", "Carlos M.", "Rodrigo V.", "Kath C.", "Julián C.", "Elena M."];
        const randomUser = userNames[Math.floor(Math.random() * userNames.length)];
        if (!primarySignal.uniqueUsers.includes(randomUser)) {
          primarySignal.uniqueUsers.push(randomUser);
        }
        tool.activeUsers = Math.max(primarySignal.uniqueUsers.length, tool.activeUsers + (additionalUsers > 0 ? 1 : 0));
      } else {
        tool.activeUsers = Math.min(tool.targetUsers + 15, tool.activeUsers + additionalUsers);
      }
      tool.weeklyInvocations = (tool.weeklyInvocations || 0) + 1;
      tool.lastUsed = "Hace unos segundos";
      this.save();
    }
    return tool;
  }
}

// Global App State
const store = new Store();
let currentView = "projects"; // 'projects' | 'tools' | 'stream'
let activeStatusFilter = "all";
let activeDeptFilter = "all";
let activeAdoptionFilter = "all";
let searchQuery = "";
let selectedProjectId = null;
let activeTelemetryToolId = null;
let activeSnippetTab = "js";

// Backend real de telemetría (mismo origen: server/index.js sirve el dashboard y la API).
const TELEMETRY_API_BASE = "/api/telemetry";

// Helper: Generate secure API Key
function generateApiKey() {
  const chars = "abcdef0123456789";
  let rand = "";
  for (let i = 0; i < 20; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ak_live_${rand}`;
}

function regenerateModalApiKey() {
  const el = document.getElementById("linkToolApiKey");
  if (el) el.value = generateApiKey();
}

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Id determin\u00edstico a partir del nombre de la herramienta (ej. "Wizard
// Curvas Starcom" -> "wizard_curvas_starcom"), en vez de un id random con
// timestamp. As\u00ed, quien arma una herramienta externa (ej. el Wizard) puede
// dejar el tool_id "hardcodeado" de antemano con solo ponerle a la
// herramienta el mismo nombre ac\u00e1 al vincularla \u2014 sin tener que crearla
// primero en el dashboard y copiar/pegar un id generado despu\u00e9s.
function generateToolId(name) {
  const base = slugify(name) || "herramienta";
  const existingIds = new Set(store.getTools().map(t => t.id));
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

// Helper: Calculate Project Metrics & Health Status
function getProjectControlMetrics(project, tools) {
  const linkedTools = tools.filter(t => t.projectId === project.id);
  const toolCount = linkedTools.length;

  let totalActive = 0;
  let totalTarget = 0;
  let totalInvocations = 0;

  linkedTools.forEach(t => {
    // Determine effective active users: derived from primary signal if available
    let effectiveActive = t.activeUsers || 0;
    if (t.signals && t.signals.length > 0) {
      const primarySignal = t.signals.find(s => s.id === t.primarySignalId) || t.signals[0];
      if (primarySignal) {
        effectiveActive = (primarySignal.uniqueUsers && primarySignal.uniqueUsers.length > 0)
          ? primarySignal.uniqueUsers.length
          : Math.min(primarySignal.clicks, t.targetUsers);
      }
    }
    totalActive += effectiveActive;
    totalTarget += (t.targetUsers || 0);
    totalInvocations += (t.weeklyInvocations || 0);
  });

  const adoptionPercent = totalTarget > 0 ? Math.round((totalActive / totalTarget) * 100) : 0;

  // Compute Project Health Status based on adoption and milestones
  let health = "optimal";
  if (project.status === "planned") {
    health = "planned";
  } else if (toolCount === 0) {
    health = "planned"; // Without tools yet, project is in planning
  } else if (adoptionPercent < 50) {
    health = "danger";
  } else if (adoptionPercent < 80) {
    health = "warning";
  } else {
    health = "optimal";
  }

  return {
    linkedTools,
    toolCount,
    totalActive,
    totalTarget,
    totalInvocations,
    adoptionPercent,
    health
  };
}

// Render Executive KPI Ribbons
function renderExecutiveKPIs() {
  const projects = store.getProjects();
  const tools = store.getTools();

  let globalActiveUsers = 0;
  let globalTargetUsers = 0;
  let optimalProjects = 0;
  let riskProjects = 0;

  projects.forEach(p => {
    const metrics = getProjectControlMetrics(p, tools);
    globalActiveUsers += metrics.totalActive;
    globalTargetUsers += metrics.totalTarget;
    if (metrics.health === "optimal") optimalProjects++;
    if (metrics.health === "warning" || metrics.health === "danger") riskProjects++;
  });

  const globalAdoptionRatio = globalTargetUsers > 0 ? Math.round((globalActiveUsers / globalTargetUsers) * 100) : 0;

  // Total Projects Card
  document.getElementById("kpiTotalProjects").textContent = projects.length;
  document.getElementById("kpiProjectsOptimal").textContent = projects.length > 0 ? `${optimalProjects} en meta` : "Sin proyectos";
  document.getElementById("kpiProjectsOptimalBar").style.width = projects.length > 0 ? `${(optimalProjects / projects.length) * 100}%` : "0%";

  // Monitored Tools Card
  document.getElementById("kpiTotalTools").textContent = tools.length;
  document.getElementById("kpiToolsProduction").textContent = tools.length > 0 ? `${tools.filter(t => t.status === 'production').length} en producción` : "Sin herramientas";
  document.getElementById("kpiToolsBar").style.width = tools.length > 0 ? `${(tools.filter(t => t.status === 'production').length / tools.length) * 100}%` : "0%";

  // Total Active Users Card
  document.getElementById("kpiActiveUsers").textContent = globalActiveUsers;
  document.getElementById("kpiTargetUsersRatio").textContent = `Meta: ${globalTargetUsers} personas`;
  document.getElementById("kpiUsersBar").style.width = `${Math.min(100, globalAdoptionRatio)}%`;

  // Global Adoption Rate Card
  document.getElementById("kpiGlobalAdoption").textContent = `${globalAdoptionRatio}%`;
  document.getElementById("kpiAdoptionStatus").textContent = projects.length > 0 ? (riskProjects > 0 ? `${riskProjects} en riesgo/alerta` : "Todo saludable") : "Sin proyectos activos";
  document.getElementById("kpiAdoptionBar").style.width = `${Math.min(100, globalAdoptionRatio)}%`;
}

// Render Projects Portfolio View
function renderProjectsView() {
  const container = document.getElementById("projectsGrid");
  const projects = store.getProjects();
  const tools = store.getTools();

  // If there are 0 projects in the system, show the Onboarding & Quick Guide Card
  if (projects.length === 0) {
    container.innerHTML = `
      <div class="onboarding-guide-card">
        <div class="guide-badge-row">
          <span class="department-tag" style="border-color: var(--sunset-orange); color: var(--sunset-peach);">
            Centro de Gobernanza
          </span>
          <span class="status-badge optimal">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
            Listo para Iniciar
          </span>
        </div>

        <div>
          <h3 style="font-family: var(--font-display); font-size: 1.65rem; color: #ffffff; margin-bottom: 0.4rem; letter-spacing: -0.01em;">
            Guía de Inicio: Cómo crear y controlar tus proyectos con telemetría
          </h3>
          <p style="font-size: 0.92rem; color: var(--text-secondary); max-width: 880px; line-height: 1.55;">
            Esta plataforma está diseñada con una filosofía de <strong>Control de Proyectos (Project Governance)</strong>: vincula herramientas mediante <strong>API Key, CLI o MCP</strong> para medir clicks en botones específicos (ej. <em>Botón descarga excel</em>) y supervisar el cumplimiento de adopción en tiempo real.
          </p>
        </div>

        <div class="guide-step-grid">
          <!-- Step 1 -->
          <div class="guide-step-card">
            <div class="guide-step-header">
              <div class="guide-step-number">1</div>
              <h4 class="guide-step-title">Crear el Proyecto</h4>
            </div>
            <p class="guide-step-body">
              Haz clic en <strong>"+ Nuevo Proyecto"</strong>. Asigna el nombre de la iniciativa (ej. <em>"Starcom - Gloria"</em>), su área (<em>Publicidad</em>, <em>Bussiness Inteligent</em>, <em>Creatividad</em> o <em>Influencers</em>), el PM o líder responsable y el Sprint o ciclo.
            </p>
            <div class="guide-step-tip">
              💡 <strong>Tip:</strong> El proyecto actúa como el contenedor de gobernanza para todas sus herramientas asociadas.
            </div>
          </div>

          <!-- Step 2 -->
          <div class="guide-step-card">
            <div class="guide-step-header">
              <div class="guide-step-number">2</div>
              <h4 class="guide-step-title">Vincular Herramientas & API Key</h4>
            </div>
            <p class="guide-step-body">
              Haz clic en <strong>"+ Vincular Herramienta"</strong>. Se generará una <strong>API Key única</strong> y podrás registrar los botones a medir (ej. <em>Botón descarga excel</em>), integrándolos vía Webhook, CLI o MCP.
            </p>
            <div class="guide-step-tip">
              💡 <strong>Tip:</strong> Tu herramienta enviará señales de clicks cada vez que un usuario interactúe.
            </div>
          </div>

          <!-- Step 3 -->
          <div class="guide-step-card">
            <div class="guide-step-header">
              <div class="guide-step-number">3</div>
              <h4 class="guide-step-title">Elegir Señal Resumen & Monitorear</h4>
            </div>
            <p class="guide-step-body">
              Escoge cuál de todas las señales recibidas será el <strong>registro de uso oficial (resumen)</strong> del proyecto. El semáforo de gobernanza calculará el avance:
              <br><span style="color: var(--status-optimal-text); font-weight: 600;">🟢 Saludable:</span> &ge;80% adopción
              <br><span style="color: var(--status-warning-text); font-weight: 600;">🟡 En Alerta:</span> 50% - 79%
              <br><span style="color: var(--status-danger-text); font-weight: 600;">🔴 Crítico:</span> &lt;50%
            </p>
            <div class="guide-step-tip">
              💡 <strong>Tip:</strong> Entra al detalle de la herramienta para ver el desglose completo de todos los botones tocados.
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 1.4rem;">
          <div style="font-size: 0.86rem; color: var(--text-muted);">
            Comienza ahora dando de alta tu primer proyecto:
          </div>
          <button class="btn btn-sunset-primary" onclick="openNewProjectModal()" style="padding: 0.75rem 1.6rem; font-size: 0.95rem;">
            <svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            + Crear mi Primer Proyecto
          </button>
        </div>
      </div>
    `;
    return;
  }

  // Filter projects if they exist
  const filtered = projects.filter(project => {
    const metrics = getProjectControlMetrics(project, tools);

    // Search query match
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchName = (project.name || "").toLowerCase().includes(q);
      const matchLead = (project.lead || "").toLowerCase().includes(q);
      const matchDept = (project.department || "").toLowerCase().includes(q);
      const matchTools = metrics.linkedTools.some(t => (t.name || "").toLowerCase().includes(q));
      if (!matchName && !matchLead && !matchDept && !matchTools) return false;
    }

    // Status filter
    if (activeStatusFilter !== "all" && metrics.health !== activeStatusFilter) {
      return false;
    }

    // Department filter
    if (activeDeptFilter !== "all" && project.department !== activeDeptFilter) {
      return false;
    }

    // Adoption filter
    if (activeAdoptionFilter === "critical" && metrics.adoptionPercent >= 50) return false;
    if (activeAdoptionFilter === "warning" && (metrics.adoptionPercent < 50 || metrics.adoptionPercent >= 80)) return false;
    if (activeAdoptionFilter === "optimal" && metrics.adoptionPercent < 80) return false;

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 4rem 2rem; text-align: center; color: var(--text-muted);">
        <p style="font-size: 1.1rem; font-weight: 600; color: #ffffff;">No se encontraron proyectos con los filtros actuales.</p>
        <p style="font-size: 0.85rem; margin-top: 0.5rem;">Prueba ajustando los filtros o el término de búsqueda.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(project => {
    const metrics = getProjectControlMetrics(project, tools);

    let statusText = "Saludable";
    let statusClass = "optimal";
    if (metrics.health === "warning") {
      statusText = "En Alerta";
      statusClass = "warning";
    } else if (metrics.health === "danger") {
      statusText = "Adopción Crítica";
      statusClass = "danger";
    } else if (metrics.health === "planned") {
      statusText = "En Planificación";
      statusClass = "planned";
    }

    const toolsPreviewHtml = metrics.linkedTools.slice(0, 3).map(tool => {
      const primarySignal = (tool.signals || []).find(s => s.id === tool.primarySignalId) || (tool.signals && tool.signals[0]);
      const signalLabel = primarySignal ? primarySignal.label : "Uso general";
      const clicksCount = primarySignal ? primarySignal.clicks : (tool.activeUsers || 0);

      return `
        <div class="tool-chip" onclick="event.stopPropagation(); openToolSignalsModal('${tool.id}')" title="Ver desglose detallado de señales para ${tool.name}">
          <div class="tool-chip-name">
            <svg style="width: 13px; height: 13px; color: var(--sunset-peach);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            ${tool.name}
            <span style="font-size: 0.7rem; color: var(--sunset-peach); background: rgba(255, 107, 74, 0.12); padding: 0.1rem 0.35rem; border-radius: 4px;">
              ${signalLabel}
            </span>
          </div>
          <div class="tool-chip-users">
            <strong>${clicksCount}</strong> clicks
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="project-card" onclick="openProjectDrawer('${project.id}')">
        <div class="project-card-badge-row">
          <span class="department-tag">${project.department}</span>
          <span class="status-badge ${statusClass}">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
            ${statusText}
          </span>
        </div>

        <div class="project-info-header">
          <h3>${project.name}</h3>
          <p>${project.description || 'Sin descripción detallada.'}</p>
        </div>

        <div class="project-meta-strip">
          <div class="lead-info">
            <div class="avatar-pill">${project.leadAvatar || 'PM'}</div>
            <span>${project.lead}</span>
          </div>
          <div class="sprint-timeline">${project.sprint || 'Sprint Activo'}</div>
        </div>

        <div class="project-adoption-block">
          <div class="adoption-label-row">
            <span class="adoption-label">Cumplimiento de Adopción (${metrics.totalActive} / ${metrics.totalTarget} personas)</span>
            <span class="adoption-percent">${metrics.adoptionPercent}%</span>
          </div>
          <div class="adoption-bar-track">
            <div class="adoption-bar-fill" style="width: ${Math.min(100, metrics.adoptionPercent)}%;"></div>
          </div>
        </div>

        <div class="linked-tools-preview">
          <div class="linked-tools-title">
            <span>Herramientas Vinculadas (${metrics.toolCount})</span>
            <span style="color: var(--sunset-peach); cursor: pointer;" onclick="event.stopPropagation(); openLinkToolModal('${project.id}')">+ Vincular</span>
          </div>
          <div class="tool-chip-list">
            ${toolsPreviewHtml || '<div style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;">Sin herramientas vinculadas aún. Haz clic en + Vincular.</div>'}
          </div>
        </div>

        <div class="project-card-footer">
          <span>${metrics.totalInvocations} clicks/usos registrados</span>
          <span class="control-cta">
            Ver Expediente
            <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    `;
  }).join("");
}

// Render Tools Matrix View (Project Control Perspective)
function renderToolsMatrixView() {
  const tbody = document.getElementById("toolsTableBody");
  const tools = store.getTools();
  const projects = store.getProjects();

  if (tools.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 4rem 1.5rem; color: var(--text-muted);">
          <div style="font-size: 1.1rem; font-weight: 600; color: #ffffff; margin-bottom: 0.4rem;">No hay herramientas vinculadas todavía</div>
          <p style="font-size: 0.85rem; margin-bottom: 1.2rem; max-width: 500px; margin-left: auto; margin-right: auto;">
            Para medir cuántas personas usan una herramienta mediante clicks telemétricos, vincúlala a un proyecto.
          </p>
          <button class="btn btn-sunset-primary" onclick="openLinkToolModal()" style="display: inline-flex; margin: 0 auto;">
            + Vincular mi Primera Herramienta
          </button>
        </td>
      </tr>
    `;
    return;
  }

  const projectMap = {};
  projects.forEach(p => { projectMap[p.id] = p; });

  const filtered = tools.filter(tool => {
    const project = projectMap[tool.projectId];
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchTool = (tool.name || "").toLowerCase().includes(q) || (tool.category || "").toLowerCase().includes(q);
      const matchProj = project && (project.name || "").toLowerCase().includes(q);
      if (!matchTool && !matchProj) return false;
    }
    if (activeDeptFilter !== "all" && project && project.department !== activeDeptFilter) {
      return false;
    }
    return true;
  });

  tbody.innerHTML = filtered.map(tool => {
    const project = projectMap[tool.projectId] || { id: "", name: "Sin Proyecto", department: "General", lead: "N/A" };
    const primarySignal = (tool.signals || []).find(s => s.id === tool.primarySignalId) || (tool.signals && tool.signals[0]);
    const signalLabel = primarySignal ? primarySignal.label : "General";
    const clicksCount = primarySignal ? primarySignal.clicks : 0;
    const effectiveActive = (primarySignal && primarySignal.uniqueUsers) ? primarySignal.uniqueUsers.length : (tool.activeUsers || 0);
    const ratio = tool.targetUsers > 0 ? Math.round((effectiveActive / tool.targetUsers) * 100) : 0;

    let statusBadge = `<span class="status-badge optimal">Producción</span>`;
    if (tool.status === 'beta') statusBadge = `<span class="status-badge warning">Fase Beta</span>`;
    if (tool.status === 'maintenance') statusBadge = `<span class="status-badge danger">Mantenimiento</span>`;

    const rolesList = Array.isArray(tool.userRoles) ? tool.userRoles : ["Equipo General"];
    const rolesHtml = rolesList.map(r => `
      <div class="role-avatar" title="${r}">${r.charAt(0)}</div>
    `).join("");

    return `
      <tr>
        <td>
          <div class="tool-name-cell">
            <span class="tool-title-link">${tool.name}</span>
            <span class="tool-category-subtitle">${tool.category} • ${tool.version || 'v1.0'}</span>
            <div style="margin-top: 0.2rem; font-size: 0.72rem; color: var(--sunset-peach); display: flex; align-items: center; gap: 0.3rem;">
              <span>⭐ Resumen:</span>
              <strong>${signalLabel}</strong> (${clicksCount} clicks)
            </div>
          </div>
        </td>
        <td>
          <span class="project-pill-link" ${project.id ? `onclick="openProjectDrawer('${project.id}')"` : ''} style="cursor: pointer;">
            <svg style="width: 12px; height: 12px; color: var(--sunset-orange);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            ${project.name}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: baseline;">
            <span class="metric-number">${effectiveActive}</span>
            <span class="metric-target-denom">/ ${tool.targetUsers} meta</span>
          </div>
          <div class="adoption-bar-track" style="height: 5px; margin-top: 5px; width: 120px;">
            <div class="adoption-bar-fill" style="width: ${Math.min(100, ratio)}%;"></div>
          </div>
        </td>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 700; color: ${ratio >= 80 ? 'var(--status-optimal-text)' : ratio >= 50 ? 'var(--status-warning-text)' : 'var(--status-danger-text)'};">
            ${ratio}%
          </span>
        </td>
        <td>
          <div class="user-avatars-stack" title="${rolesList.join(', ')}">
            ${rolesHtml}
          </div>
        </td>
        <td>
          <span style="font-family: var(--font-mono); color: #ffffff;">${tool.weeklyInvocations || 0}</span>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${tool.lastUsed || 'Sin registros'}</div>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; gap: 0.4rem;">
            <button class="btn btn-sunset-primary" style="padding: 0.35rem 0.65rem; font-size: 0.76rem;" onclick="simulateToolUse('${tool.id}')" title="Registrar click en señal primaria">
              +1 Click
            </button>
            <button class="btn btn-sunset-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.76rem;" onclick="openToolSignalsModal('${tool.id}')" title="Ver desglose detallado de botones y telemetría">
              ⚡ Señales
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Render Real-time Audit Activity Stream
function renderActivityStream() {
  const container = document.getElementById("activityEventList");
  const events = store.getEvents();

  if (events.length === 0) {
    container.innerHTML = `
      <div style="padding: 3.5rem 1.5rem; text-align: center; color: var(--text-muted);">
        <div style="font-size: 1rem; font-weight: 600; color: #ffffff; margin-bottom: 0.35rem;">Sin registros de actividad todavía</div>
        <p style="font-size: 0.84rem; max-width: 440px; margin: 0 auto;">
          Cada vez que los usuarios interactúen con una herramienta o envíes señales telemétricas (ej. <em>Botón descarga excel</em>), se registrará aquí un evento cronológico con su proyecto y persona asociada.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = events.map(evt => {
    return `
      <div class="audit-event-item">
        <div class="audit-icon-badge">
          <svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="audit-content">
          <div class="audit-header-line">
            <span class="audit-user">${evt.user} <span style="font-weight: 400; color: var(--text-muted);">(${evt.role})</span></span>
            <span class="audit-time">${evt.timestamp}</span>
          </div>
          <p class="audit-desc">${evt.action}</p>
          <div class="audit-tags">
            <span class="audit-tag-pill">⚙️ ${evt.toolName}</span>
            <span class="audit-tag-pill" style="color: var(--text-muted);">📁 ${evt.projectName}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// Switch Active View
function switchView(viewName) {
  currentView = viewName;
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.view === viewName);
  });
  document.querySelectorAll(".dashboard-view").forEach(view => {
    view.classList.toggle("active", view.id === `view-${viewName}`);
  });

  if (viewName === "projects") renderProjectsView();
  if (viewName === "tools") renderToolsMatrixView();
  if (viewName === "stream") renderActivityStream();
  if (viewName === "telemetry") renderTelemetryView();
}

// ---------- Vista "Base de Datos de Señales" (eventos reales, sin agregar) ----------

function renderTelemetryView() {
  const select = document.getElementById("telemetryToolFilter");
  const currentValue = select.value;
  const tools = store.getTools();
  select.innerHTML = '<option value="">Todas las herramientas</option>' +
    tools.map(t => `<option value="${t.id}">${t.name} (${t.id})</option>`).join("");
  select.value = tools.some(t => t.id === currentValue) ? currentValue : "";
  refreshTelemetryEvents();
}

async function refreshTelemetryEvents() {
  const toolId = document.getElementById("telemetryToolFilter").value;
  const tbody = document.getElementById("telemetryEventsTableBody");
  const empty = document.getElementById("telemetryEventsEmpty");
  try {
    const url = new URL(`${TELEMETRY_API_BASE}/events`, window.location.origin);
    url.searchParams.set("limit", "200");
    if (toolId) url.searchParams.set("tool_id", toolId);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const events = data.events || [];

    if (events.length === 0) {
      tbody.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    tbody.innerHTML = events.map(ev => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 0.55rem 0.5rem; color: var(--text-secondary); font-family: var(--font-mono); font-size: 0.76rem;">${ev.created_at}</td>
        <td style="padding: 0.55rem 0.5rem; color: #ffffff;">${ev.tool_id}</td>
        <td style="padding: 0.55rem 0.5rem;"><span style="color: var(--sunset-peach); font-weight: 600;">${ev.signal_label}</span></td>
        <td style="padding: 0.55rem 0.5rem; color: var(--text-secondary);">${ev.user_name || "—"}</td>
      </tr>
    `).join("");
  } catch (err) {
    console.warn("No se pudo cargar la base de datos de señales real", err);
    tbody.innerHTML = "";
    empty.textContent = "No se pudo conectar con el backend de telemetría (¿está caído o sin internet?).";
    empty.style.display = "block";
  }
}

function downloadTelemetryCsv() {
  const toolId = document.getElementById("telemetryToolFilter").value;
  const url = new URL(`${TELEMETRY_API_BASE}/export.csv`, window.location.origin);
  if (toolId) url.searchParams.set("tool_id", toolId);
  window.location.href = url.toString();
}

function downloadTelemetryDb() {
  window.location.href = `${TELEMETRY_API_BASE}/export/db`;
}

// Project Detail Drawer
function openProjectDrawer(projectId) {
  selectedProjectId = projectId;
  const project = store.getProjects().find(p => p.id === projectId);
  if (!project) return;

  const tools = store.getTools();
  const metrics = getProjectControlMetrics(project, tools);

  document.getElementById("drawerProjectName").textContent = project.name;
  document.getElementById("drawerProjectDept").textContent = project.department;
  document.getElementById("drawerProjectLead").textContent = project.lead;
  document.getElementById("drawerProjectDesc").textContent = project.description || "Sin descripción proporcionada.";
  document.getElementById("drawerProjectSprint").textContent = project.sprint || "Sprint Activo";
  document.getElementById("drawerAdoptionPercent").textContent = `${metrics.adoptionPercent}%`;
  document.getElementById("drawerAdoptionBar").style.width = `${Math.min(100, metrics.adoptionPercent)}%`;
  document.getElementById("drawerUsersCount").textContent = `${metrics.totalActive} de ${metrics.totalTarget} personas objetivo`;

  // Render Milestones
  const milestonesList = document.getElementById("drawerMilestonesList");
  const milestones = project.milestones || [
    { name: "Aprobación de alcance y herramientas", completed: true },
    { name: "Despliegue de telemetría y credenciales API", completed: true },
    { name: "Capacitación y adopción de usuarios", completed: false }
  ];

  milestonesList.innerHTML = milestones.map(m => `
    <div style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.84rem; padding: 0.4rem 0;">
      <span style="color: ${m.completed ? 'var(--status-optimal-text)' : 'var(--text-muted)'}; font-size: 1rem;">
        ${m.completed ? '✔' : '○'}
      </span>
      <span style="color: ${m.completed ? '#ffffff' : 'var(--text-secondary)'};">
        ${m.name}
      </span>
    </div>
  `).join("");

  // Render Linked Tools in Drawer
  const toolsList = document.getElementById("drawerLinkedToolsList");
  if (metrics.linkedTools.length === 0) {
    toolsList.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); background: rgba(15, 11, 29, 0.4); border-radius: var(--radius-md);">
        No hay herramientas vinculadas a este proyecto todavía.
        <br><button class="btn btn-sunset-secondary" style="margin-top: 0.6rem; font-size: 0.76rem;" onclick="openLinkToolModal('${project.id}')">+ Vincular Herramienta</button>
      </div>
    `;
  } else {
    toolsList.innerHTML = metrics.linkedTools.map(t => {
      const primarySignal = (t.signals || []).find(s => s.id === t.primarySignalId) || (t.signals && t.signals[0]);
      const signalLabel = primarySignal ? primarySignal.label : "General";
      const clicksCount = primarySignal ? primarySignal.clicks : 0;
      const effectiveActive = (primarySignal && primarySignal.uniqueUsers) ? primarySignal.uniqueUsers.length : (t.activeUsers || 0);
      const ratio = t.targetUsers > 0 ? Math.round((effectiveActive / t.targetUsers) * 100) : 0;
      const rolesList = Array.isArray(t.userRoles) ? t.userRoles : ["General"];
      const signalsCount = (t.signals || []).length;

      return `
        <div style="background: rgba(15, 11, 29, 0.55); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--radius-md); padding: 1.1rem; display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #ffffff; font-size: 1.05rem;">${t.name}</strong>
            <span class="status-badge ${t.status === 'production' ? 'optimal' : 'warning'}" style="font-size: 0.68rem;">
              ${(t.status || 'PROD').toUpperCase()}
            </span>
          </div>

          <p style="font-size: 0.82rem; color: var(--text-muted);">${t.description || ''}</p>

          <!-- Primary Signal Summary Strip -->
          <div style="background: rgba(255, 107, 74, 0.09); border: 1px dashed rgba(255, 107, 74, 0.35); border-radius: var(--radius-sm); padding: 0.5rem 0.8rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; font-size: 0.8rem;">
            <div style="display: flex; align-items: center; gap: 0.4rem; color: var(--sunset-peach);">
              <span>⭐ Señal Resumen:</span>
              <strong style="color: #ffffff;">${signalLabel}</strong>
              <span style="font-family: var(--font-mono); color: var(--sunset-bright); font-weight: 700;">(${clicksCount} clicks)</span>
            </div>
            <span style="font-size: 0.74rem; color: var(--text-muted);">${signalsCount} señales reconocidas</span>
          </div>

          <!-- Progress Bar of Active People -->
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; margin-top: 0.1rem;">
            <span style="color: var(--text-secondary);">Personas Activas: <strong style="color: var(--sunset-peach);">${effectiveActive}</strong> / ${t.targetUsers}</span>
            <span style="font-family: var(--font-mono); font-weight: 700; color: #ffffff;">${ratio}%</span>
          </div>
          <div class="adoption-bar-track" style="height: 6px;">
            <div class="adoption-bar-fill" style="width: ${Math.min(100, ratio)}%;"></div>
          </div>

          <!-- Card Actions -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.4rem; padding-top: 0.6rem; border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <span style="color: var(--text-muted);">Roles: ${rolesList.join(', ')}</span>
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn btn-sunset-primary" style="padding: 0.3rem 0.7rem; font-size: 0.75rem;" onclick="simulateToolUse('${t.id}')">
                +1 Registrar Uso
              </button>
              <button class="btn btn-sunset-secondary" style="padding: 0.3rem 0.75rem; font-size: 0.75rem;" onclick="openToolSignalsModal('${t.id}')">
                ⚡ Desglose de Señales
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  document.getElementById("projectDrawer").classList.add("open");
}

function closeProjectDrawer() {
  document.getElementById("projectDrawer").classList.remove("open");
}

// Modal: Create New Project
function openNewProjectModal() {
  document.getElementById("newProjectModal").classList.add("open");
}

function closeNewProjectModal() {
  document.getElementById("newProjectModal").classList.remove("open");
}

function handleCreateProject(e) {
  e.preventDefault();
  const name = document.getElementById("newProjName").value.trim();
  const dept = document.getElementById("newProjDept").value;
  const lead = document.getElementById("newProjLead").value.trim();
  const desc = document.getElementById("newProjDesc").value.trim();
  const sprint = document.getElementById("newProjSprint").value.trim() || "Sprint Q4 2026";

  if (!name || !lead) return;

  const initials = lead.split(" ").map(w => w.charAt(0)).join("").toUpperCase().slice(0, 2);

  const newProject = {
    id: `proj-${Date.now()}`,
    name,
    department: dept,
    lead,
    leadAvatar: initials || 'PM',
    description: desc,
    status: "optimal",
    sprint,
    startDate: new Date().toISOString().split("T")[0],
    endDate: "2026-12-31",
    milestones: [
      { name: "Aprobación de arquitectura y herramientas requeridas", completed: true },
      { name: "Capacitación a usuarios clave del área", completed: false },
      { name: "Evaluación de adopción mensual", completed: false }
    ]
  };

  store.addProject(newProject);
  closeNewProjectModal();
  document.getElementById("formNewProject").reset();
  renderExecutiveKPIs();
  renderProjectsView();
  renderToolsMatrixView();
}

// Modal: Link Tool to Project
function openLinkToolModal(preselectedProjectId = null) {
  const projects = store.getProjects();

  if (projects.length === 0) {
    alert("Para vincular una herramienta, primero debes tener al menos un proyecto registrado. ¡Creemos tu primer proyecto ahora!");
    openNewProjectModal();
    return;
  }

  const projectSelect = document.getElementById("linkToolProject");
  projectSelect.innerHTML = projects.map(p => `
    <option value="${p.id}" ${preselectedProjectId === p.id ? 'selected' : ''}>${p.name} (${p.department})</option>
  `).join("");

  // Initialize API Key if empty
  const apiKeyInput = document.getElementById("linkToolApiKey");
  if (apiKeyInput && !apiKeyInput.value) {
    apiKeyInput.value = generateApiKey();
  }

  document.getElementById("linkToolModal").classList.add("open");
}

function closeLinkToolModal() {
  document.getElementById("linkToolModal").classList.remove("open");
}

function handleLinkTool(e) {
  e.preventDefault();
  const projectId = document.getElementById("linkToolProject").value;
  const name = document.getElementById("linkToolName").value.trim();
  const category = document.getElementById("linkToolCategory").value;
  const targetUsers = parseInt(document.getElementById("linkToolTarget").value, 10) || 20;
  const initialUsers = parseInt(document.getElementById("linkToolInitialUsers").value, 10) || 0;
  const desc = document.getElementById("linkToolDesc").value.trim();
  const rolesRaw = document.getElementById("linkToolRoles").value.trim() || "Usuarios de Negocio";
  const apiKey = document.getElementById("linkToolApiKey").value.trim() || generateApiKey();
  const integrationType = document.getElementById("linkToolIntegration").value || "api";
  const initialSignalName = document.getElementById("linkToolInitialSignal").value.trim() || "Botón descarga excel";

  if (!name || !projectId) return;

  // Sin datos inventados: la señal inicial arranca en 0 clicks y sin
  // usuarios hasta que lleguen eventos reales (desde el backend de
  // telemetría, o manualmente con "+1 Click" en el modal de Señales).
  const initialSignalId = slugify(initialSignalName) || "btn_descarga_excel";
  const initialSignals = [
    {
      id: initialSignalId,
      label: initialSignalName,
      clicks: 0,
      uniqueUsers: [],
      lastTriggered: "Sin señales aún"
    }
  ];

  const newTool = {
    id: generateToolId(name),
    projectId,
    name,
    category,
    description: desc,
    activeUsers: initialUsers,
    targetUsers,
    weeklyInvocations: 0,
    status: "production",
    version: "v1.0.0",
    lastUsed: "Recién vinculada",
    apiKey,
    integrationType,
    primarySignalId: initialSignalId,
    signals: initialSignals,
    userRoles: rolesRaw.split(",").map(r => r.trim())
  };

  store.addTool(newTool);

  // Log link event
  const project = store.getProjects().find(p => p.id === projectId);
  store.addEvent({
    id: `evt-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    user: "PM / Administrador",
    role: "Control de Proyectos",
    toolId: newTool.id,
    toolName: newTool.name,
    projectId: project ? project.id : "N/A",
    projectName: project ? project.name : "N/A",
    action: `Vinculó "${newTool.name}" con API Key y monitoreo de señal "${initialSignalName}"`,
    badgeType: "optimal"
  });

  closeLinkToolModal();
  document.getElementById("formLinkTool").reset();
  // Reset API key for next link
  document.getElementById("linkToolApiKey").value = generateApiKey();

  renderExecutiveKPIs();
  renderProjectsView();
  renderToolsMatrixView();
  renderActivityStream();

  if (selectedProjectId) {
    openProjectDrawer(selectedProjectId);
  }
}

// Dedicated Signals & Telemetry Modal Logic
async function openToolSignalsModal(toolId) {
  activeTelemetryToolId = toolId;
  const tool = store.getTools().find(t => t.id === toolId);
  if (!tool) return;

  const project = store.getProjects().find(p => p.id === tool.projectId) || { name: "General" };

  document.getElementById("signalsModalToolTitle").textContent = `Telemetría de Señales: ${tool.name}`;
  document.getElementById("signalsModalToolStatus").textContent = (tool.status || "PRODUCTION").toUpperCase();
  document.getElementById("signalsModalToolProject").textContent = `Proyecto: ${project.name}`;

  if (!tool.signals) tool.signals = [];

  // Trae las señales reales del backend (clicks/drags que mandó la herramienta
  // conectada, ej. el Wizard) y las mezcla con lo que ya había localmente.
  await syncToolTelemetry(tool);

  // If no primary signal is set, set first
  if (!tool.primarySignalId && tool.signals.length > 0) {
    tool.primarySignalId = tool.signals[0].id;
    store.save();
  }

  renderToolSignalsList(tool);
  renderToolQuickButtons(tool);
  updateSnippetView(tool);

  document.getElementById("toolSignalsModal").classList.add("open");
}

// Trae de /api/telemetry/tool/:id las señales reales (POST enviados por el
// Wizard u otra herramienta conectada) y las combina con tool.signals local.
// No inventa datos: si el backend no tiene eventos para esta herramienta,
// deja tal cual lo que ya había (sin fabricar clicks ni usuarios).
async function syncToolTelemetry(tool) {
  if (!tool) return;
  try {
    const res = await fetch(`${TELEMETRY_API_BASE}/tool/${encodeURIComponent(tool.id)}`, {
      headers: tool.apiKey ? { "X-API-KEY": tool.apiKey } : {}
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.signals || data.signals.length === 0) return;

    if (!tool.signals) tool.signals = [];
    data.signals.forEach(serverSignal => {
      let local = tool.signals.find(s => s.id === serverSignal.id);
      if (!local) {
        local = { id: serverSignal.id, label: serverSignal.label, clicks: 0, uniqueUsers: [] };
        tool.signals.push(local);
      }
      local.label = serverSignal.label || local.label;
      local.clicks = serverSignal.clicks;
      local.uniqueUsers = serverSignal.uniqueUsers || [];
      local.lastTriggered = serverSignal.lastTriggered
        ? new Date(serverSignal.lastTriggered).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : local.lastTriggered;
    });

    if (!tool.primarySignalId && tool.signals.length > 0) {
      tool.primarySignalId = tool.signals[0].id;
    }
    const primary = tool.signals.find(s => s.id === tool.primarySignalId);
    if (primary) {
      tool.activeUsers = (primary.uniqueUsers || []).length;
    }
    tool.weeklyInvocations = tool.signals.reduce((sum, s) => sum + (s.clicks || 0), 0);

    store.save();
  } catch (err) {
    console.warn(`No se pudo sincronizar telemetría real para "${tool.name}" (¿backend caído o sin internet?)`, err);
  }
}

// Sincroniza todas las herramientas contra el backend real y refresca la UI.
async function syncAllToolsTelemetry() {
  const tools = store.getTools();
  if (tools.length === 0) return;
  await Promise.all(tools.map(t => syncToolTelemetry(t)));
  renderExecutiveKPIs();
  renderProjectsView();
  renderToolsMatrixView();
  renderActivityStream();
  if (selectedProjectId) openProjectDrawer(selectedProjectId);
}

function closeToolSignalsModal() {
  document.getElementById("toolSignalsModal").classList.remove("open");
  activeTelemetryToolId = null;
}

function renderToolSignalsList(tool) {
  const container = document.getElementById("signalsModalList");
  const primarySignal = (tool.signals || []).find(s => s.id === tool.primarySignalId) || tool.signals[0];

  // Update Primary Highlight Card
  document.getElementById("signalsPrimaryName").textContent = `Botón: ${primarySignal ? primarySignal.label : 'General'}`;
  document.getElementById("signalsPrimaryCount").textContent = primarySignal ? primarySignal.clicks : 0;
  const primaryUsersCount = (primarySignal && primarySignal.uniqueUsers) ? primarySignal.uniqueUsers.length : 0;
  document.getElementById("signalsPrimaryExplanation").textContent =
    `Esta señal define las ${primaryUsersCount} personas activas y la tasa de adopción mostrada en el resumen del proyecto.`;

  document.getElementById("signalsTotalCountLabel").textContent = `${tool.signals.length} señales registradas`;

  // Render list of signals exactly formatted as requested:
  // Botón - Botón descarga excel
  // Clicks - 37
  container.innerHTML = tool.signals.map(s => {
    const isPrimary = s.id === tool.primarySignalId;
    const usersCount = (s.uniqueUsers || []).length;
    const usersPreview = s.uniqueUsers && s.uniqueUsers.length > 0 ? s.uniqueUsers.join(", ") : "Sin usuarios";

    return `
      <div class="signal-row-card ${isPrimary ? 'is-primary' : ''}">
        <div class="signal-info-group">
          <div class="signal-button-line">
            <span style="color: var(--sunset-peach); font-size: 0.95rem;">🔘 Botón:</span>
            <span style="color: #ffffff; font-size: 1.05rem; font-weight: 700;">${s.label}</span>
            ${isPrimary ? '<span class="primary-signal-badge">⭐ Registro de Uso Resumen</span>' : ''}
          </div>
          <div class="signal-meta-line" style="margin-top: 0.35rem;">
            <span style="color: var(--sunset-peach); font-weight: 700; font-family: var(--font-mono); font-size: 0.92rem;">Clicks: ${s.clicks}</span>
            <span>•</span>
            <span title="Usuarios que presionaron este botón: ${usersPreview}">${usersCount} personas únicas</span>
            <span>•</span>
            <span>Último click: ${s.lastTriggered || 'Reciente'}</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 0.6rem;">
          ${!isPrimary ? `
            <button class="btn btn-sunset-secondary" style="padding: 0.38rem 0.8rem; font-size: 0.75rem;" onclick="setPrimarySignal('${tool.id}', '${s.id}')" title="Hacer que este botón determine las personas activas en el resumen del proyecto">
              ⭐ Fijar como Resumen
            </button>
          ` : `
            <span style="font-size: 0.76rem; color: #fbbf24; font-weight: 700; display: flex; align-items: center; gap: 0.3rem;">
              ✔ Señal Principal
            </span>
          `}

          <button class="btn btn-sunset-primary" style="padding: 0.38rem 0.8rem; font-size: 0.75rem;" onclick="sendSignalClick('${tool.id}', '${s.id}')" title="Simular click en este botón">
            +1 Click
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function renderToolQuickButtons(tool) {
  const container = document.getElementById("signalsQuickButtonsContainer");
  container.innerHTML = tool.signals.map(s => `
    <button class="btn btn-glass" style="font-size: 0.78rem; padding: 0.35rem 0.75rem;" onclick="sendSignalClick('${tool.id}', '${s.id}')">
      🔘 ${s.label} (+1)
    </button>
  `).join("");
}

// Change Primary Signal (Registro de Uso Resumen)
function setPrimarySignal(toolId, signalId) {
  const tool = store.getTools().find(t => t.id === toolId);
  if (!tool) return;

  tool.primarySignalId = signalId;
  const primarySignal = (tool.signals || []).find(s => s.id === signalId);
  if (primarySignal && primarySignal.uniqueUsers) {
    tool.activeUsers = primarySignal.uniqueUsers.length;
  }
  store.save();

  // Log switch event
  const project = store.getProjects().find(p => p.id === tool.projectId);
  store.addEvent({
    id: `evt-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    user: "PM / Administrador",
    role: "Control de Proyectos",
    toolId: tool.id,
    toolName: tool.name,
    projectId: project ? project.id : "N/A",
    projectName: project ? project.name : "N/A",
    action: `Cambió la señal oficial de resumen a "${primarySignal ? primarySignal.label : signalId}"`,
    badgeType: "optimal"
  });

  renderToolSignalsList(tool);
  renderExecutiveKPIs();
  renderProjectsView();
  renderToolsMatrixView();
  renderActivityStream();

  if (selectedProjectId) {
    openProjectDrawer(selectedProjectId);
  }
}

// Receive or Simulate Button Click Signal
function sendSignalClick(toolId, signalId, customUserName = null) {
  const tool = store.getTools().find(t => t.id === toolId);
  if (!tool) return;

  if (!tool.signals) tool.signals = [];
  let signal = tool.signals.find(s => s.id === signalId);

  if (!signal) {
    signal = {
      id: signalId,
      label: signalId,
      clicks: 0,
      uniqueUsers: [],
      lastTriggered: "Ahora"
    };
    tool.signals.push(signal);
  }

  signal.clicks = (signal.clicks || 0) + 1;
  signal.lastTriggered = "Hace unos segundos";

  // Assign user to unique users list
  const userNames = ["Valeria C.", "Carlos M.", "Rodrigo V.", "Kath C.", "Julián C.", "Elena M.", "Mateo S."];
  const user = customUserName || userNames[Math.floor(Math.random() * userNames.length)];
  if (!signal.uniqueUsers) signal.uniqueUsers = [];
  if (!signal.uniqueUsers.includes(user)) {
    signal.uniqueUsers.push(user);
  }

  tool.weeklyInvocations = (tool.weeklyInvocations || 0) + 1;
  tool.lastUsed = "Hace unos segundos";

  // If this signal is primary, update tool active users count
  if (tool.primarySignalId === signal.id) {
    tool.activeUsers = signal.uniqueUsers.length;
  }

  store.save();

  // Audit event
  const project = store.getProjects().find(p => p.id === tool.projectId);
  store.addEvent({
    id: `evt-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    user: user,
    role: "Usuario de Herramienta",
    toolId: tool.id,
    toolName: tool.name,
    projectId: project ? project.id : "N/A",
    projectName: project ? project.name : "N/A",
    action: `Presionó "${signal.label}" (Total: ${signal.clicks} clicks) en ${tool.name}`,
    badgeType: "optimal"
  });

  // Re-render
  if (activeTelemetryToolId === toolId) {
    renderToolSignalsList(tool);
    renderToolQuickButtons(tool);
  }

  renderExecutiveKPIs();
  renderProjectsView();
  renderToolsMatrixView();
  renderActivityStream();

  if (selectedProjectId) {
    openProjectDrawer(selectedProjectId);
  }
}

// Add and Send Custom Signal
function handleSendCustomSignal() {
  if (!activeTelemetryToolId) return;
  const input = document.getElementById("inputNewSignalName");
  const signalName = input.value.trim();
  if (!signalName) return;

  const signalId = slugify(signalName);
  const tool = store.getTools().find(t => t.id === activeTelemetryToolId);
  if (!tool) return;

  let existing = tool.signals.find(s => s.id === signalId);
  if (!existing) {
    tool.signals.push({
      id: signalId,
      label: signalName,
      clicks: 0,
      uniqueUsers: [],
      lastTriggered: "Recién creada"
    });
  }

  sendSignalClick(activeTelemetryToolId, signalId);
  input.value = "";
}

// Code Snippet Generator (API, CLI, MCP)
function updateSnippetView(tool) {
  const apiKey = tool.apiKey || generateApiKey();
  document.getElementById("signalsModalApiKeyPreview").textContent = apiKey;

  const primarySignal = (tool.signals || []).find(s => s.id === tool.primarySignalId) || { label: "Botón descarga excel" };
  const signalLabel = primarySignal.label;
  const snippetBox = document.getElementById("signalsCodeSnippet");

  const endpoint = `${window.location.origin}${TELEMETRY_API_BASE}/signal`;

  if (activeSnippetTab === "js") {
    snippetBox.textContent = `// JavaScript / Webhook: Envía señal al hacer click en tu botón
document.getElementById('btn-accion').addEventListener('click', async () => {
  await fetch('${endpoint}', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': '${apiKey}'
    },
    body: JSON.stringify({
      tool_id: '${tool.id}',
      signal_id: '${(tool.signals[0] && tool.signals[0].id) || slugify(signalLabel)}',
      signal_label: '${signalLabel}',
      user: 'nombre_o_correo_del_usuario'
    })
  });
});`;
  } else if (activeSnippetTab === "python") {
    snippetBox.textContent = `# Python CLI: Disparar evento de click desde tu script o app
import requests

def track_button_click(signal_id="${(tool.signals[0] && tool.signals[0].id) || slugify(signalLabel)}", signal_label="${signalLabel}", user="analyst_1"):
    url = "${endpoint}"
    headers = {"X-API-KEY": "${apiKey}"}
    payload = {
        "tool_id": "${tool.id}",
        "signal_id": signal_id,
        "signal_label": signal_label,
        "user": user
    }
    resp = requests.post(url, json=payload, headers=headers)
    print("Señal telemétrica registrada:", resp.status_code)

# Invocar al presionar el botón:
track_button_click()`;
  } else if (activeSnippetTab === "curl") {
    snippetBox.textContent = `# cURL: Enviar señal telemétrica por terminal
curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: ${apiKey}" \\
  -d '{"tool_id": "${tool.id}", "signal_id": "${(tool.signals[0] && tool.signals[0].id) || slugify(signalLabel)}", "signal_label": "${signalLabel}", "user": "usuario_cli"}'`;
  } else if (activeSnippetTab === "mcp") {
    snippetBox.textContent = `// MCP Protocol Tool Definition (para agentes de IA Claude / Gemini)
{
  "name": "log_button_click",
  "description": "Registra el click en un botón de la herramienta ${tool.name}",
  "parameters": {
    "type": "object",
    "properties": {
      "apiKey": { "type": "string", "default": "${apiKey}" },
      "toolId": { "type": "string", "default": "${tool.id}" },
      "button": { "type": "string", "enum": ["${(tool.signals || []).map(s => s.label).join('", "')}"] },
      "user": { "type": "string", "description": "Nombre del usuario" }
    },
    "required": ["apiKey", "toolId", "button"]
  }
}`;
  }
}

function switchSnippetTab(type) {
  activeSnippetTab = type;
  document.querySelectorAll(".integration-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.snippet === type);
  });
  if (activeTelemetryToolId) {
    const tool = store.getTools().find(t => t.id === activeTelemetryToolId);
    if (tool) updateSnippetView(tool);
  }
}

function copyCurrentToolApiKey() {
  if (!activeTelemetryToolId) return;
  const tool = store.getTools().find(t => t.id === activeTelemetryToolId);
  if (tool && tool.apiKey) {
    navigator.clipboard.writeText(tool.apiKey);
    alert("API Key copiada al portapapeles: " + tool.apiKey);
  }
}

// Guide Modal functions
function openGuideModal() {
  document.getElementById("guideModal").classList.add("open");
}

function closeGuideModal() {
  document.getElementById("guideModal").classList.remove("open");
}

// Simulate / Register Tool Usage Action
function simulateToolUse(toolId) {
  const tool = store.incrementToolUsage(toolId, 1);
  if (!tool) return;

  const project = store.getProjects().find(p => p.id === tool.projectId);
  const userNames = ["Valeria C.", "Carlos M.", "Rodrigo V.", "Kath C.", "Julián C.", "Elena M.", "Mateo S."];
  const randomUser = userNames[Math.floor(Math.random() * userNames.length)];
  const primarySignal = (tool.signals || []).find(s => s.id === tool.primarySignalId) || { label: "Uso general" };

  store.addEvent({
    id: `evt-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    user: randomUser,
    role: "Usuario de Herramienta",
    toolId: tool.id,
    toolName: tool.name,
    projectId: project ? project.id : "N/A",
    projectName: project ? project.name : "N/A",
    action: `Presionó "${primarySignal.label}" (+1 click telemétrico) en ${tool.name}`,
    badgeType: "optimal"
  });

  // Re-render UI
  renderExecutiveKPIs();
  renderProjectsView();
  renderToolsMatrixView();
  renderActivityStream();

  if (activeTelemetryToolId === toolId) {
    renderToolSignalsList(tool);
    renderToolQuickButtons(tool);
  }

  if (selectedProjectId) {
    openProjectDrawer(selectedProjectId);
  }
}

// Random Live Simulator Trigger
function triggerRandomSimulator() {
  const tools = store.getTools();
  if (tools.length === 0) {
    alert("No hay herramientas registradas para simular. Crea un proyecto y vincula tu primera herramienta para habilitar el simulador.");
    return;
  }
  const randomTool = tools[Math.floor(Math.random() * tools.length)];
  simulateToolUse(randomTool.id);
}

// Setup Event Listeners
function setupListeners() {
  // Navigation Tabs
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  // Search input
  const searchInput = document.getElementById("globalSearchInput");
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    if (currentView === "projects") renderProjectsView();
    if (currentView === "tools") renderToolsMatrixView();
  });

  // Status Filter Pills
  document.querySelectorAll("[data-filter-status]").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("[data-filter-status]").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      activeStatusFilter = pill.dataset.filterStatus;
      renderProjectsView();
    });
  });

  // Dept Filter Pills
  document.querySelectorAll("[data-filter-dept]").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("[data-filter-dept]").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      activeDeptFilter = pill.dataset.filterDept;
      renderProjectsView();
      renderToolsMatrixView();
    });
  });

  // Adoption Bracket Pills
  document.querySelectorAll("[data-filter-adoption]").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("[data-filter-adoption]").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      activeAdoptionFilter = pill.dataset.filterAdoption;
      renderProjectsView();
    });
  });

  // Forms
  document.getElementById("formNewProject").addEventListener("submit", handleCreateProject);
  document.getElementById("formLinkTool").addEventListener("submit", handleLinkTool);

  // Quick Action in Drawer to link tool
  document.getElementById("btnDrawerLinkTool").addEventListener("click", () => {
    openLinkToolModal(selectedProjectId);
  });

  // Reset demo data button
  document.getElementById("btnResetData").addEventListener("click", () => {
    if (confirm("¿Deseas reiniciar el panel de control a 0 proyectos?")) {
      store.reset();
      renderExecutiveKPIs();
      renderProjectsView();
      renderToolsMatrixView();
      renderActivityStream();
      if (selectedProjectId) closeProjectDrawer();
      if (activeTelemetryToolId) closeToolSignalsModal();
    }
  });
}

// Initialization on DOM load
document.addEventListener("DOMContentLoaded", () => {
  setupListeners();
  renderExecutiveKPIs();
  renderProjectsView();
  renderToolsMatrixView();
  renderActivityStream();

  // Primer refresco con datos reales de telemetría, y luego cada 30s.
  syncAllToolsTelemetry();
  setInterval(syncAllToolsTelemetry, 30000);
});
