# Desplegar el Dashboard + Telemetría en tu Contabo (EasyPanel)

Esto deja el dashboard accesible por URL (no solo en tu máquina) y agrega un
backend real (Node + SQLite) que recibe las señales de click/drag que manda
el Wizard. Antes solo existía el mockup visual; ahora los números que ves en
"Telemetría de Señales" son datos reales.

## 0. Qué vas a terminar teniendo

- Un solo servicio **App** en EasyPanel, construido desde el repo
  `https://github.com/ManguitoHot/dashboard_auth`, que:
  - sirve el dashboard (`index.html`/`app.js`/`styles.css`) en la raíz `/`.
  - expone la API en `/api/telemetry/...`.
  - guarda los eventos en un archivo **SQLite** (`/app/data/telemetry.db`)
    dentro de un volumen persistente — no hace falta un servicio de base de
    datos aparte.
- El Wizard (en tu máquina y en la de quien lo abra) mandando señales reales
  a esa URL.

## 1. Subir el código a GitHub

Yo ya dejé el código listo en `C:\Users\elias\Desktop\Agentes\dashboard`.
Falta el `git init` + push. Te aviso antes de hacer el push real — solo
decime "dale, sube" cuando quieras que lo haga, o corré esto vos mismo:

```bash
cd "C:\Users\elias\Desktop\Agentes\dashboard"
git init
git add .
git commit -m "Backend de telemetría real (Node + SQLite) para el dashboard"
git branch -M main
git remote add origin https://github.com/ManguitoHot/dashboard_auth.git
git push -u origin main
```

## 2. Crear la app del dashboard

1. **+ Service → App**.
2. **Source**: GitHub → conectá/seleccioná el repo
   `ManguitoHot/dashboard_auth`, rama `main`.
3. **Build**: EasyPanel va a detectar el `Dockerfile` del repo (no hace
   falta configurar buildpack manual).
4. **Environment Variables**, agregá:
   - `TELEMETRY_API_KEY` = una clave larga y random que vos inventes (ej.
     generála con `openssl rand -hex 20` en una terminal, o cualquier string
     largo tipo contraseña). Esta es la que va a viajar desde el Wizard.
   - `DB_PATH` (opcional) = `/app/data/telemetry.db` — ya es el valor por
     default del Dockerfile, solo hace falta si querés otra ruta.
5. **Puerto del contenedor**: `3000` (coincide con el `EXPOSE 3000` del
   Dockerfile).
6. **Dominio**: asigná el dominio o subdominio que quieras (ej.
   `dashboard.tudominio.com`), o usá el subdominio gratuito que te ofrece
   EasyPanel. Activá HTTPS (Let's Encrypt, un click).

## 3. Montar el volumen persistente (importante — sin esto se pierde todo en cada redeploy)

1. Andá a la pestaña **"Almacenamiento"** del servicio de la app.
2. **"Agregar montaje de volumen"**.
3. Ruta dentro del contenedor: `/app/data` (ahí es donde vive
   `telemetry.db`, según `DB_PATH`).
4. Guardá.
5. **Implementar** (deploy). Cuando termine, abrí `https://tu-dominio/` —
   deberías ver el dashboard tal cual lo ves hoy local, y
   `https://tu-dominio/api/health` debería responder
   `{"ok":true,"db":"/app/data/telemetry.db"}`.

## 4. Crear la herramienta "Wizard Curvas Starcom" en el dashboard

El `tool_id` que usa el Wizard **ya no lo genera el dashboard al azar** —
sale directo del nombre que le pongas (ej. "Wizard Curvas Starcom" ->
`wizard_curvas_starcom`). El Wizard ya trae ese id fijo hardcodeado, así que
lo único que tenés que hacer es que el nombre matchee:

1. Abrí el dashboard ya desplegado, creá el proyecto si no existe.
2. **+ Vincular Herramienta** → nombre **exactamente** "Wizard Curvas
   Starcom" (así el id que arma el dashboard es `wizard_curvas_starcom`,
   igual al que ya está en el Wizard). La herramienta se vincula limpia, sin señales por default.
3. Guardá. No hace falta copiar ningún id — ya coincide solo.
4. Si el día de mañana vinculás **otra** herramienta (otro Wizard, otra
   calculadora, etc.), dale un nombre distinto, y en esa herramienta
   cambiá el `TELEMETRY_TOOL_ID` de su propio HTML para que matchee su
   propio nombre/slug — así el dashboard las distingue a todas por
   separado, aunque compartan la misma `TELEMETRY_API_KEY`.

## 5. Conectar el Wizard al backend real

Abrí `Wizard_Curvas_Starcom.html` y buscá este bloque cerca del final
(ya está en el archivo, el `TELEMETRY_TOOL_ID` ya viene puesto — solo
hay que completar la URL y la API Key):

```js
const TELEMETRY_ENDPOINT = ''; // ej: 'https://dashboard.tudominio.com/api/telemetry/signal'
const TELEMETRY_API_KEY = '';  // la TELEMETRY_API_KEY que pusiste en EasyPanel (paso 2)
const TELEMETRY_TOOL_ID = 'wizard_curvas_starcom'; // ya viene así, no lo toques
```

Completá la URL y la API Key, guardá el archivo, y listo — así queda para
todos los que usen ese mismo `Wizard_Curvas_Starcom.html` (si lo
compartís por archivo, cada copia ya sale con esto configurado).

## 6. Probar

1. Abrí el Wizard, soltá un archivo Digital → debería sumar 1 a
   "Elementos arrastrados Digital" en el dashboard (puede tardar hasta 30s
   en reflejarse ahí, o al instante si abrís/cerrás el modal de
   Telemetría de esa herramienta).
2. Hacé click en "Exportar a Excel" → suma 1 a "Botón descargar excel".
3. Si algo no aparece: abrí las DevTools del Wizard (F12 → pestaña Network)
   y fijate si el POST a `/api/telemetry/signal` devuelve 201 (ok) o un
   error (401 = API Key mal copiada, CORS/red = revisar dominio/HTTPS).

## 7. Ver los datos crudos y descargar la base

En el dashboard, pestaña **"Base de Datos de Señales"** (al lado de
"Auditoría de Uso en Vivo") — tabla con cada evento real tal cual llegó
(fecha, herramienta, señal, usuario), filtro por herramienta, y dos botones:
- **Descargar CSV** — abre directo en Excel.
- **Descargar Base de Datos (.db)** — el archivo SQLite completo, por si
  querés inspeccionarlo con algo como [DB Browser for SQLite](https://sqlitebrowser.org/).

## Notas

- Como el Wizard se abre como archivo local (`file://`) en la máquina de
  cada persona, no hay login — el backend identifica "usuarios únicos" por
  un id anónimo que cada navegador genera una sola vez (no son nombres
  reales, son "navegadores distintos que usaron el Wizard").
- Las rutas `/api/*` aceptan requests desde cualquier origen (CORS abierto)
  porque no hay un dominio único conocido del lado del Wizard. El único
  candado es la `TELEMETRY_API_KEY` para poder escribir (`POST`); leer
  (`GET`) queda público — si más adelante te preocupa esto, se puede exigir
  la key también para lectura.
