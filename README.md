# TROQLY

*Tus noches de juegos, en una app · Your game nights, in one app*

App web instalable (PWA) para grupos de amigos que juegan a juegos de mesa. Incluye colección, Mesa en vivo con QR, podio, estadísticas, rivalidades, asistente de reglas con IA que cita la página del manual y podcasts conectados a tus juegos.

## Arrancar en local

Necesitas Node 20 o superior y un Postgres (sirve uno gratuito de Neon).

```bash
npm install
DATABASE_URL="postgresql://..." GEMINI_API_KEY="..." npm start
# abre http://localhost:3000
```

Al arrancar, la app crea las tablas y carga ~120 juegos semilla.

## Variables de entorno

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión de Postgres (Neon) |
| `GEMINI_API_KEY` | Para la IA | Asistente de reglas, lectura de fotos, resúmenes y enlace episodio ↔ juego |
| `PODCASTINDEX_KEY` / `PODCASTINDEX_SECRET` | Recomendado | Directorio de podcasts. Sin ellas se usa la búsqueda de iTunes |
| `GEMINI_MODEL` | No | Fuerza un modelo concreto. Por defecto se elige solo un modelo Flash gratuito |
| `AI_DAILY_RULES`, `AI_DAILY_SUMMARY`, `AI_DAILY_TAGGING`, `AI_DAILY_OCR` | No | Límites diarios para no pasarse del plan gratis |

Las claves solo se usan en el servidor. Nunca llegan al navegador ni van en el repositorio.

## Comprobaciones

- `npm test`: prueba de punta a punta con varios clientes a la vez y una IA simulada.
- `npm run check:i18n`: comprueba que todos los textos están traducidos y que no hay textos escritos en el código.
- `GET /healthz`: estado del servidor y de la base de datos.
- `GET /api/health/ai`: hace una llamada real a Gemini (el resultado se guarda 10 minutos).

## Añadir un idioma

1. Copia `public/locales/en.json` como `public/locales/fr.json` y tradúcelo.
2. Añade `{ "code": "fr", "name": "Français" }` a `public/locales/index.json`.
3. Añade `'fr'` a `SUPPORTED` en `server/api.js`.

## Publicar en Render

`render.yaml` define un Web Service gratuito. En el panel de Render: **New → Blueprint**, elige el repositorio y rellena las variables marcadas.
