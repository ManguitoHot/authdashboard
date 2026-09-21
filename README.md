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
- **Registrar Nuevos Usos**:
  - En la vista de **Matriz de Herramientas** o dentro del **Expediente de Proyecto**, haz clic en `+1 Uso` para registrar una nueva persona activa e invocar el log de auditoría en vivo.
- **Consultar la Guía en Cualquier Momento**:
  - Siempre puedes hacer clic en el botón **`📖 Guía de Proyectos`** del encabezado para volver a consultar estas instrucciones.

---

## 🚀 Cómo Abrir y Usar el Dashboard

### Opción 1: Abrir directamente en tu Navegador
Solo haz doble clic en el archivo:
```text
c:\Users\elias\Desktop\Agentes\dashboard\index.html
```
O ábrelo desde PowerShell / Terminal:
```powershell
Start-Process "c:\Users\elias\Desktop\Agentes\dashboard\index.html"
```

### Opción 2: Servir con un servidor local ligero
Si deseas ejecutarlo mediante un servidor HTTP local:
```powershell
cd c:\Users\elias\Desktop\Agentes\dashboard
python -m http.server 8080
```
Y luego abre en tu navegador: [http://localhost:8080](http://localhost:8080)

---

## 🛠️ Interacciones Incluidas
- `+ Nuevo Proyecto`: Crea un proyecto con su departamento, responsable (PM), fechas y objetivos.
- `+ Vincular Herramienta`: Asocia una herramienta a cualquier proyecto existente con su meta de adopción.
- `+1 Uso`: Incrementa los usuarios activos y registra un evento de auditoría en tiempo real.
- `Filtros de Salud, Área y Adopción`: Segmenta al instante los proyectos por su nivel de cumplimiento.
- `Búsqueda Global`: Filtra proyectos, herramientas o responsables en tiempo real.
- `Persistencia Local`: Todos los cambios y registros se guardan en el almacenamiento local del navegador (`localStorage`), con opción de restaurar a los valores iniciales en cualquier momento.
