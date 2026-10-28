# ⚡ Dashboard de Control de Proyectos & Adopción de Herramientas (Cyber-Tactical HUD)

Un centro de comando diseñado específicamente para **monitorear cuántas personas utilizan tus herramientas**, estructurado bajo una metodología de **Control de Proyectos** (Project Governance & Tracking) con estética de **Telemetría Táctica de Alta Precisión**.

---

## 🎨 Estilo Visual: Cyber-Tactical / Telemetry HUD (Neones Atenuados)
- **Lienzo OLED de Telemetría Táctica**: Fondo oscuro absoluto (`#040608` a `#0f1420`) con patrón de retícula técnica de ingeniería de 28px.
- **Neones Suaves y Controlados**: Fósforo cian atenuado (`#00bcd4`), azul cobalto de telemetría (`#0284c7`), ámbar táctico (`#eab308`) y verde operativo (`#10b981`), calibrados para evitar la fatiga visual o sobre-saturación.
- **Monolito de Cristal Táctico**: Tarjetas translúcidas oscurecidas (`rgba(8, 12, 20, 0.82)`) con bordes técnicos de 1px (`rgba(0, 188, 212, 0.25)`) y halos de sombra suaves y focalizados.
- **Tipografía de Precisión**: Combinación de `Space Grotesk`, `Plus Jakarta Sans` y `JetBrains Mono` para lectura inmediata de identificadores y datos numéricos.

---

## 📖 Guía Básica: Cómo Añadir un Nuevo Proyecto y Monitorear Herramientas

El sistema arranca limpio (0 proyectos) para que puedas configurar tu portafolio desde cero. Sigue estos 3 pasos básicos:

### 1. Crear el Proyecto Base
1. Haz clic en el botón superior **`+ Nuevo Proyecto`** (o en la tarjeta de inicio rápido).
2. Completa los datos:
   - **Nombre del Proyecto**: Identifica la iniciativa (ej. *"Campaña Omnicanal Q4"*, *"Plataforma RAG de Conocimiento"*).
   - **Área / Departamento**: Selecciona el área responsable (*Publicidad*, *Bussiness Inteligent*, *Creatividad*, *Influencers*).
   - **Líder del Proyecto (PM)**: Nombre o iniciales de la persona responsable del control y adopción (ej. *"Valeria"*, *"Marcus & Rodrigo"*).
   - **Sprint / Ciclo**: Periodo de tiempo o fase operativa (ej. *"Sprint 01 • Q4 2026"*).
   - **Meta Estimada de Personas**: Estimación global de usuarios esperados.
3. Haz clic en **`Crear Proyecto`**.

### 2. Vincular Herramientas al Proyecto
1. Haz clic en **`+ Vincular Herramienta`** (desde el encabezado o dentro de la tarjeta del proyecto).
2. Selecciona el **Proyecto de Pertenencia** que acabas de crear.
3. Ingresa:
   - **Nombre de la Herramienta**: (ej. *"Calculadora de Curvas Hill"*, *"Generador de Medidas DAX"*).
   - **Categoría**: Clasificación técnica de la herramienta.
   - **Meta de Usuarios (Personas)**: Número de personas del equipo que deberían utilizar esta herramienta.
   - **Roles**: Tipos de usuarios que la operan (ej. *"Media Planners, Data Analysts"*).
4. Haz clic en **`Vincular Herramienta`**.

### 3. Supervisar la Adopción y Salud del Proyecto
- **Cálculo Automático**: El dashboard calculará el índice de adopción:
  $$\text{Tasa de Adopción} = \frac{\text{Personas Activas}}{\text{Meta de Personas}} \times 100$$
- **Semáforo de Gobernanza**:
  - 🟢 **Saludable**: Adopción $\ge 80\%$.
  - 🟡 **En Alerta**: Adopción entre $50\%$ y $79\%$.
  - 🔴 **Crítico**: Adopción $< 50\%$ (alerta para el PM; requiere capacitación o revisión).
- **Uso Real vía Telemetría**:
  - Las **Personas Activas** ya no se cargan a mano: salen de los usuarios únicos que reporta la **señal primaria** de cada herramienta (clicks / drags que manda la herramienta al backend).
  - El dashboard sincroniza las señales con el servidor cada 30 segundos (o al abrir el modal de Telemetría de una herramienta).
- **Consultar la Guía en Cualquier Momento**:
  - Siempre puedes hacer clic en el botón **`📖 Guía de Proyectos`** del encabezado para volver a consultar estas instrucciones.

---

## 📡 Telemetría Real (Backend)

El dashboard incluye un backend **Node + Express + SQLite** (`server/`) que recibe las señales de uso de cada herramienta (ej. el *Wizard Curvas Starcom*) y las guarda en la tabla `telemetry_events`.

- El `tool_id` sale del nombre de la herramienta: *"Wizard Curvas Starcom"* → `wizard_curvas_starcom`.
- Los "usuarios únicos" son ids anónimos que genera cada navegador (no nombres reales).
- La guía completa para desplegarlo en Contabo / EasyPanel y conectar el Wizard está en [`DEPLOY.md`](DEPLOY.md).

| Método | Ruta | Requiere `X-API-KEY` | Uso |
|---|---|---|---|
| `POST` | `/api/telemetry/signal` | ✅ | Registrar una señal (click / drag) |
| `DELETE` | `/api/telemetry/tool/:toolId/signal/:signalId` | ✅ | Eliminar una señal de una herramienta |
| `GET` | `/api/telemetry/tool/:toolId` | — | Señales agregadas de una herramienta |
| `GET` | `/api/telemetry/events?limit=&tool_id=` | — | Eventos crudos (uno por fila) |
| `GET` | `/api/telemetry/export.csv` | — | Descargar todos los eventos en CSV |
| `GET` | `/api/telemetry/export/db` | — | Descargar el archivo SQLite completo |
| `GET` | `/api/portfolio` | — | Portafolio (proyectos, herramientas y bitácora) |
| `PUT` | `/api/portfolio` | ✅ | Reemplazar el portafolio completo |
| `GET` | `/api/health` | — | Estado del servicio |

> 🔐 La key es la variable de entorno `TELEMETRY_API_KEY` del servidor. Al eliminar una señal o guardar cambios del portafolio desde el dashboard se pide una vez y queda guardada en ese navegador. Si el servidor no tiene `TELEMETRY_API_KEY` configurada, las escrituras quedan abiertas (solo para pruebas locales). Las lecturas (`GET`) son públicas.

---

## 🚀 Cómo Abrir y Usar el Dashboard

### Opción 1: Local con el backend (recomendado)
Requiere **Node 20** (el mismo del `Dockerfile`; con Node 24 `better-sqlite3@11` intenta compilar y falla sin herramientas de build):
```powershell
cd "C:\Users\elias\Desktop\Proyectos PUBLICIS PERSONALES\dashboard"
npm install
$env:TELEMETRY_API_KEY = "una_clave_larga"   # opcional en local
npm start
```
Luego abre en tu navegador: [http://localhost:3000](http://localhost:3000). La base se crea en `data/telemetry.db`.

### Opción 2: Solo la interfaz (sin telemetría)
Doble clic en `index.html`. Proyectos y herramientas funcionan, pero sin backend no hay señales reales.

### Opción 3: Producción (Docker / EasyPanel)
Ver [`DEPLOY.md`](DEPLOY.md). Variables en [`.env.example`](.env.example).

---

## 🗂️ Vistas del Dashboard
- **Portafolio de Proyectos**: Tarjetas por proyecto con adopción, semáforo y filtros.
- **Matriz de Herramientas**: Todas las herramientas con su meta, usuarios activos y estado.
- **Auditoría de Uso en Vivo**: Log de acciones (proyectos creados, herramientas vinculadas, señales eliminadas).
- **Base de Datos de Señales**: Eventos crudos del servidor, filtro por herramienta y descarga en CSV o `.db`.

## 🛠️ Interacciones Incluidas
- `+ Nuevo Proyecto`: Crea un proyecto con su departamento, responsable (PM), fechas y objetivos.
- `+ Vincular Herramienta`: Asocia una herramienta a un proyecto con su meta de adopción (se vincula limpia, sin señales por default).
- `Telemetría de la Herramienta`: Ver señales, elegir la señal primaria, eliminar señales y copiar el snippet de integración (JS / Python / cURL).
- `Filtros de Salud, Área y Adopción`: Segmenta al instante los proyectos por su nivel de cumplimiento.
- `Búsqueda Global`: Filtra proyectos, herramientas o responsables en tiempo real.
- `Persistencia`: Proyectos, herramientas y señales de uso viven en el servidor (SQLite, tablas `portfolio_state` y `telemetry_events`). El `localStorage` del navegador es solo caché; si el servidor no tiene portafolio, el primer navegador que lo tenga en caché lo sube.

## 📁 Estructura
```text
index.html · app.js · styles.css   → interfaz del dashboard
server/index.js                    → API Express + archivos estáticos
server/db.js                       → conexión SQLite y esquema
Dockerfile · DEPLOY.md · .env.example → despliegue
```
