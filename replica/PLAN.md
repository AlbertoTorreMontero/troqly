# TROQLY — Plan de construcción
*"Tus noches de juegos, en una app" · "Your game nights, in one app"*

> Estado: **pendiente de tu OK**. Es la única parada; con tu OK construyo y publico de un tirón.

---

## 0. Cómo se han analizado las referencias (y qué no se ha podido)

Las tres referencias son **apps nativas de iOS**. REA lee webs, apps JS/Electron, APKs de Android y binarios, pero **no puede abrir una app de la App Store** (no hay binario accesible ni versión web). Por eso el análisis sale de fuentes públicas: fichas de la App Store, documentación del desarrollador, notas de versión, reseñas y apps similares. No se ha mirado ni se usará código de nadie.

| Etiqueta | Significado |
|---|---|
| **[O] Observado** | Lo dice la ficha, la documentación o una reseña |
| **[D] Deducido** | Razonado a partir de lo observado |
| **[?] Incógnita** | No se puede saber sin la app; se decide por diseño propio |

---

## 1. Qué hacen las referencias y qué piden sus usuarios

### 1.1 Registro de colección, partidas y estadísticas (referencia 1)
- **[O]** App iOS de pago (5,99 $) con compras dentro: un paquete "Power" (rachas, heatmaps, coste por hora, filtros avanzados), "Deep Stats", etiquetas, retos y sincronización en la nube por suscripción. Valoración 4,9 con 460 opiniones.
- **[O]** Colección con estados (lo tengo, lista de deseos, quiero jugarlo…), varias copias, precio pagado, fecha de compra y filtros como "jugado pero no lo tengo" o "lo tengo y sin jugar".
- **[O]** Partidas con reglas de puntuación, modo cooperativo y por equipos, expansiones, jugadores anónimos, lugares, roles, temporizador y más de 3.300 hojas de puntuación por juego.
- **[O]** Estadísticas: % de victorias, H-index, "fives/dimes/quarters/centuries", coste por partida, gráficos por periodo, imagen resumen 3x3 para compartir.
- **[O]** Para no apuntar dos veces, se pueden **enviar** partidas a otros usuarios: lo apunta **una sola persona**.
- **[O] Lo que piden en las reseñas:** tableros/variantes y roles por expansión, elegir el color de la interfaz (no solo el verde oscuro), rediseño del logo y de los gráficos, y **clasificación por mecánicas con gráficos**.
- **[D]** Las funciones de estadística "buenas" están detrás de varios pagos sueltos → en TROQLY van todas incluidas.

### 1.2 Asistentes de reglas con IA (referencia 2 y similares)
- **[O]** La referencia 2 es gratuita: chat de reglas con memoria de la conversación, guía de preparación por número de jugadores, marcador simple, dado, ruleta de turno, equipos aleatorios y temporizador. Sin registro.
- **[O]** La ficha **no explica de dónde salen las respuestas** ni lo fiables que son.
- **[O]** Otras apps del mismo tipo: escanear el manual con la cámara y preguntar (también por voz) con 3 días de prueba y luego Premium; otra da la página exacta del manual en cada respuesta (1,49 $/mes o 4,99 $ de por vida).
- **[O] El gran problema del sector:** los modelos de IA genéricos se inventan reglas. Un caso documentado: explicó un juego con ~80 % de acierto y se inventó habilidades que no existen. Los creadores de apps nuevas lo citan como el motivo para hacerlas: mezclan ediciones o se inventan mecánicas.
- **[D]** El valor diferencial es **"solo lo que dice TU manual, con página, y si no está, lo dice"**.

### 1.3 Apps de podcasts
- **[D]** Recorrido estándar: buscar → ficha del podcast → episodios → reproductor (velocidad, ±30 s, segundo plano, seguir donde lo dejé) → seguir → cola.
- **[O]** Podcast Index ofrece búsqueda por término, episodios por feed y tendencias; **no aloja audio ni reproduce**: solo metadatos. Necesita clave + secreto gratuitos.
- **[O]** La búsqueda de iTunes es gratuita, **sin clave**, y devuelve la URL del feed RSS.
- **[D]** Ninguna app de podcasts conecta episodios con tu colección de juegos → hueco claro.

### 1.4 Señal de mercado
- **[O]** Ya hay quien trabaja en la idea de que **todos apuntan la misma partida en tiempo real**, en vez de una persona al final. Confirma que la Mesa en vivo es lo que más se echa en falta.

---

## 2. Qué tiene TROQLY que no tienen los originales

| Mejora | Por qué |
|---|---|
| **Mesa en vivo compartida** (QR, sin instalar ni registrarse, todos apuntan a la vez) | Hoy apunta una sola persona |
| **IA que no se inventa reglas**: solo tu manual, cita la página y el servidor **comprueba que la cita existe** antes de enseñarla | El gran fallo del sector |
| **Estadísticas por mecánica con gráficos** | Lo piden en las reseñas |
| **Todo incluido y gratis** (rachas, heatmap, coste por partida) | En el original van en paquetes de pago |
| **Grupos de amigos y rivalidades** ("Ana te gana 7–3 en Catan") | El original es individual |
| **Podcasts conectados a tus juegos** | No lo hace nadie |
| **Multiidioma de verdad** (la IA responde en tu idioma citando la página original) | Las referencias están en inglés |
| **Logros con la jerga jugona** (AP, Kingmaker, Sandbagger, Pile of Shame) | Pique sano entre amigos |
| **Modo claro/oscuro con la marca** y aspecto moderno | Piden colores propios y gráficos nuevos |
| **Web instalable (PWA)**, iPhone y Android | La referencia 1 es solo iOS |

---

## 3. Mapa de pantallas

```
Bienvenida ─┬─ Entrar / Crear cuenta (email + contraseña)
            └─ Unirme a una mesa (código/QR, sin cuenta) ──► Mesa en vivo (móvil invitado)

Inicio (tab bar: Inicio · Colección · Mesa · Reglas · Podcasts)
├─ Inicio: grupo activo, última partida, racha del momento, "¿A qué jugamos?"
├─ Grupos: lista · crear · enlace de invitación · miembros · ranking · rivalidades
├─ Colección
│   ├─ Lista con filtros (estado, jugadores, duración, mecánica) + Pile of Shame
│   ├─ Añadir juego (buscar en la lista semilla o a mano)
│   └─ Ficha del juego: datos · mis partidas · estadísticas · manual (IA) · "Escuchar sobre este juego"
├─ Mesa en vivo
│   ├─ Anfitrión: elegir juego → código grande + QR → sala de espera
│   ├─ Marcador en vivo (pantalla grande) · temporizador por turno · dado · "¿Quién empieza?"
│   ├─ Móvil del jugador: apodo → sumar/restar puntos → ver marcador
│   └─ Fin: podio (top 3) → tarjeta para compartir → guardado en el historial
├─ Estadísticas: % victorias · H-index · más jugados · rachas · coste por partida · heatmap · por mecánica · logros
├─ Reglas (IA): elegir juego → subir manual (PDF/fotos) → chat con citas → "Respuesta incorrecta"
├─ Podcasts: directorio (idioma + búsqueda) · ficha · episodio (resumen IA) · seguidos · "Más tarde" · novedades · recomendados
│   └─ Mini-reproductor fijo abajo + reproductor completo
└─ Ajustes: idioma · tema claro/oscuro · moneda · perfil · cerrar sesión
```

**Recorrido principal (lo primero que se construye y se prueba):**
crear cuenta → crear grupo → invitar → añadir juegos → **abrir Mesa en vivo con QR** → 3 móviles entran y apuntan → fin → **podio + tarjeta** → aparece en estadísticas de todos.

---

## 4. Modelo de datos (Postgres)

Preparado para el futuro **modo cafés/tiendas** con una entidad `venues` (sin construir pantallas).

```
users            id, email (único), password_hash, display_name, locale, currency, theme, created_at
sessions         sid, sess, expire                       (sesiones en BD, sobreviven a reinicios)
groups           id, name, invite_code (único), owner_id, venue_id NULL, created_at
group_members    group_id, user_id, role (owner|member), joined_at
games            id, slug, name, year, min_players, max_players, min_minutes, max_minutes,
                 weight, cooperative bool, source (seed|manual), created_by NULL
mechanics        id, key (p. ej. "deck_building")        → nombre traducido en los archivos de idioma
game_mechanics   game_id, mechanic_id
collection_items id, group_id NULL, user_id NULL, game_id, status (owned|wishlist|want_to_play|unplayed),
                 price_paid, currency, acquired_at, notes
plays            id, group_id, game_id, venue_id NULL, started_at, ended_at, duration_s,
                 cooperative bool, coop_won NULL, notes, created_by
play_players     id, play_id, user_id NULL, guest_name NULL, score, rank, is_winner, is_first_player,
                 turn_time_s (para el logro AP), started_behind bool (Sandbagger)
live_tables      id, code (6 letras), host_user_id, group_id, game_id, state JSONB, status (lobby|playing|ended),
                 play_id NULL, expires_at
achievements     id, user_id, group_id, key (ap|kingmaker|sandbagger|pile_of_shame|...), play_id NULL, earned_at
rulebooks        id, game_id, group_id, title, language, pages int, uploaded_by, created_at
rule_chunks      id, rulebook_id, page int, text, tsv tsvector, embedding vector(768) NULL
rule_questions   id, rulebook_id, user_id, question, answer, citations JSONB, found bool, flagged bool, locale
podcasts         id, feed_url (único), itunes_id NULL, title, author, language, image_url, last_checked_at
episodes         id, podcast_id, guid, title, description, audio_url, published_at, duration_s
episode_games    episode_id, game_id, confidence, method (name_match|ai)
episode_summaries episode_id, locale, summary
podcast_follows  user_id, podcast_id
listen_queue     user_id, episode_id, added_at
listen_progress  user_id, episode_id, position_s, completed bool, updated_at
shares           id, group_id, user_id, episode_id, message, created_at
venues           id, name, kind (cafe|store), country, owner_user_id  ← solo la tabla, sin pantallas
```

**Cosas importantes por el plan gratuito de Render** (el disco se borra en cada reinicio):
- Los manuales **no se guardan como archivo**: se extrae el texto por página y se guarda en Postgres. Las fotos se procesan y se descartan.
- Los audios de podcast **nunca** pasan por el servidor: se reproducen desde la URL original.

---

## 5. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Servidor | **Node 22 + Express + Socket.IO** | Lo que pediste; tiempo real nativo |
| Base de datos | **Neon Postgres (gratis)** | Gratis permanente, 1 GB por proyecto, admite pgvector. Supabase también vale |
| Frontend | **HTML + CSS + JS con módulos ES, sin build** | Despliegue simple, carga rápida en móvil |
| PWA | manifest + service worker (caché de la interfaz, modo offline básico) | Instalable en iPhone y Android |
| Tiempo real | Socket.IO con salas por código de mesa; reconexión automática | Varios móviles a la vez |
| Auth | email + contraseña (bcrypt), cookie httpOnly, sesiones en Postgres; invitados con token local | Los amigos de la mesa no necesitan cuenta |
| PDF | `pdfjs-dist` en el servidor (texto por página); fotos/PDF escaneado → OCR con Gemini | Página exacta para citar |
| QR | `qrcode` (generado en el servidor) | |
| Tarjeta para compartir | Canvas en el navegador → PNG + `navigator.share` | Sin coste de servidor |
| Gráficos | SVG propio (heatmap, barras, donut por mecánica) | Ligero, con los colores de la marca |
| Idiomas | `/locales/es.json`, `/locales/en.json` + `Intl` (fechas, números, monedas, plurales) | Añadir idioma = añadir un archivo |
| IA | **Gemini API, plan gratis**, solo desde el servidor (`GEMINI_API_KEY`) | Lo que pediste |
| Podcasts | Búsqueda de iTunes (sin clave) + lectura de RSS (`rss-parser`); Podcast Index opcional | Gratis, sin copiar audio |
| Hosting | **Render Web Service** + `render.yaml` | Lo que pediste |

---

## 6. Mesa en vivo — cómo funciona

1. El anfitrión elige juego → el servidor crea `live_tables` con un código de 6 letras (sin letras confusas) y un QR con `https://…/m/CODIGO`.
2. Los amigos escanean → eligen apodo (y emoji) → entran como **invitados** (token en el móvil, sin registro). Si alguien tiene cuenta y está en el grupo, se le enlaza solo.
3. Cada cambio de puntos va al servidor, que es **la única fuente de verdad**: valida, guarda el estado en Postgres (JSONB) y lo reparte a toda la sala. Si alguien pierde la conexión, al volver recibe el estado completo.
4. Herramientas: temporizador por turno (mide el tiempo de cada uno para el logro **AP**), dado animado, "¿Quién empieza?" con ruleta.
5. Fin → ranking → **podio** (menta para el ganador, ámbar si bate récord) → **tarjeta para compartir** en el idioma de cada uno → se crea la partida en `plays` y aparece en el historial y las estadísticas de todos los miembros.
6. Los invitados se pueden "reclamar" más tarde: si un invitado crea cuenta, sus partidas pasan a su perfil.

---

## 7. Asistente de reglas con IA (sin inventarse nada)

1. **Subida**: PDF → texto por página. Si es escaneado o son fotos → Gemini transcribe cada página (OCR). Se guarda por fragmentos con su número de página.
2. **Búsqueda**: búsqueda de texto completo en Postgres + embeddings de Gemini (si el plan gratis lo permite) → los ~6 fragmentos más relevantes.
3. **Respuesta**: Gemini recibe **solo esos fragmentos** con reglas estrictas: responder solo con eso, en el idioma del usuario, y devolver JSON `{found, answer, citations:[{page, quote}]}`.
4. **Comprobación en el servidor (la clave)**: cada cita textual se busca en la página indicada. Si una cita no existe → se descarta; si no queda ninguna → la respuesta es **"No aparece en el manual"**. Así la IA no puede colar reglas inventadas.
5. Se muestra la respuesta con chips "p. 12" que abren el texto original de esa página (en el idioma del manual).
6. Botón **"Respuesta incorrecta"** → se guarda marcada; las respuestas marcadas se ven en la ficha del juego para que el grupo lo sepa.

---

## 8. Podcasts

- **Directorio**: lista inicial de podcasts de juegos de mesa (ES/EN y otros idiomas) buscados en iTunes por términos como "board games", "juegos de mesa", "jeux de société", "Brettspiele"… Filtro por idioma y búsqueda libre.
- **Episodios**: se leen del RSS de cada podcast; se refrescan cada pocas horas (solo de los podcasts seguidos o vistos) para no gastar.
- **Reproductor**: `<audio>` con la URL original, velocidad 0,8×–2×, ±30 s, controles en la pantalla de bloqueo (Media Session API), posición guardada cada 10 s → "seguir donde lo dejé".
- **Seguir, "Más tarde" y novedades**: aviso dentro de la app (punto en la pestaña) y notificación web push opcional.
- **Episodios ↔ juegos**: primero coincidencia por nombre (gratis); en los dudosos, Gemini clasifica título + descripción contra la lista de juegos. Resultado en la ficha del juego: **"Escuchar sobre este juego"**.
- **Recomendaciones**: episodios de los juegos de la colección del grupo y de los más jugados.
- **Compartir con el grupo**: aparece en el inicio del grupo con un mensaje ("escuchad esta reseña antes de comprarlo").
- **Resumen con IA** de la descripción, en el idioma del usuario, generado una vez y guardado.

---

## 9. Marca TROQLY (aplicada en todos los idiomas)

| Token | Valor | Uso |
|---|---|---|
| Noche | `#15131F` | Fondo modo oscuro (por defecto) |
| Coral | `#FF6B4A` | Acciones, botones principales |
| Menta | `#3DDC97` | Victorias, podio |
| Ámbar | `#FFC845` | Récords, logros |
| Crema | `#F6F1E7` | Fondo modo claro |
| Titulares | Space Grotesk | |
| Texto | Inter | |

- **Icono**: una pieza de cartón recién destroquelada (forma irregular con las "pestañitas" del troquel), coral sobre noche. SVG propio + PNG para la PWA.
- **Tono**: cercano y de pique. Ej.: "Marta lleva 4 seguidas. Alguien tendrá que pararla." / "Marta has won 4 in a row. Someone has to stop her."
- **Logros con jerga**: **AP** (quien más tarda por turno), **Kingmaker** (el que, sin ganar, decide quién gana; se deduce de las puntuaciones finales y se puede marcar a mano), **Sandbagger** (gana viniendo de atrás), **Pile of Shame** (sección de juegos sin estrenar), más: racha de victorias, H-index nuevo, "Destroquelado" (primera partida a un juego).
- **Candado de marca**: antes de publicar se busca en todo el código cualquier nombre, logo, texto o color de las referencias.

---

## 10. Idiomas

- Todos los textos en `/locales/<idioma>.json`; ni un texto en el código (se comprueba con un script que falla si hay claves sin traducir o textos sueltos).
- **Al lanzar: español e inglés completos.** Añadir francés, alemán, italiano o portugués = copiar un archivo y traducirlo; aparece solo en Ajustes.
- Detecta el idioma del móvil (`navigator.language`), se cambia en Ajustes y se guarda en el perfil.
- Fechas, números, monedas y plurales con `Intl`.
- IA (reglas, resúmenes, tarjetas) en el idioma del usuario; las citas mantienen la página original.
- Los nombres de mecánicas y logros son claves traducidas, no texto en la BD.

---

## 11. Lista semilla de juegos

~100 juegos populares con **solo datos objetivos** (nombre, año, jugadores, duración, peso aproximado, mecánicas). **Sin imágenes ni descripciones copiadas** de ninguna web: cada juego tiene una portada generada con la marca (iniciales + color). Se puede añadir cualquier juego a mano.

---

## 12. Qué se construye y en qué orden

| # | Bloque | Contenido |
|---|---|---|
| 1 | Base | Servidor, BD, migraciones, i18n, marca, PWA, auth |
| 2 | **Recorrido principal** | Grupos + invitación → colección + filtros + semilla → **Mesa en vivo con QR** → podio + tarjeta → historial → estadísticas |
| 3 | Rivalidades y logros | Ranking del grupo, cara a cara, AP/Kingmaker/Sandbagger/Pile of Shame |
| 4 | Asistente de reglas | Subida PDF/fotos, OCR, búsqueda, respuesta verificada, "incorrecta" |
| 5 | Podcasts | Directorio, RSS, reproductor, seguir/más tarde/novedades, enlace con juegos, recomendaciones, compartir, resúmenes |
| 6 | Resto | "¿A qué jugamos?", coste por partida, heatmap, ajustes |
| 7 | Pruebas | Local con 4 pestañas como móviles distintos (anfitrión + 3 jugadores), en ES y en EN, IA con respuesta real, % de funciones cubiertas, candado de marca |
| 8 | Publicación | `render.yaml`, Neon, variables en Render, verificación de la URL con HTTPS |

**Tiempo estimado (mío, trabajando de un tirón):** varias horas de construcción en esta sesión. Por tu parte: ~15 min para crear la base de datos en Neon, sacar la clave de Gemini y pegar las variables en Render (te lo dejo paso a paso).

---

## 13. Cuánto cuesta

| Servicio | Plan | Coste | Límite a tener en cuenta |
|---|---|---|---|
| Render Web Service | Free | **0 €** | Se duerme tras 15 min sin uso y tarda ~1 min en despertar. Para uso real con amigos, **Starter 7 $/mes** lo elimina |
| Neon Postgres | Free | **0 €** | 1 GB por proyecto; de sobra para miles de partidas y bastantes manuales en texto |
| Gemini API | Free | **0 €** | Límites diarios bajos y cambiantes (se ven en AI Studio). En el plan gratis Google puede usar lo que envías para mejorar sus productos → no se envían datos personales, solo texto del manual y preguntas |
| iTunes Search + RSS | — | **0 €** | Sin clave |
| Podcast Index (opcional) | Free | **0 €** | Clave + secreto gratuitos |
| Dominio propio (opcional) | — | ~10 €/año | Funciona sin él con `troqly.onrender.com` (si está libre) |

**Total para empezar: 0 €.** Recomendado si lo usáis de verdad: 7 $/mes (Render Starter).

Para no pasarse del límite de Gemini: cachear resúmenes y clasificaciones, usar primero coincidencia de nombres, limitar preguntas por grupo y día, y mensaje claro si se agota ("La IA descansa hasta mañana").

---

## 14. Lo que no se sabe / riesgos

- **[?]** Pantallas exactas de las referencias (sin acceso a las apps): el diseño de TROQLY es propio, no una calca.
- **[?]** Modelo exacto de Gemini disponible gratis hoy: el nombre va en una variable (`GEMINI_MODEL`) y se comprueba al arrancar con una llamada real.
- **[D]** iPhone: la reproducción en segundo plano en una PWA funciona en la mayoría de casos, pero iOS puede cortarla con la pantalla bloqueada en algunas versiones. Las notificaciones web push en iPhone solo funcionan con la app **instalada** en la pantalla de inicio (iOS 16.4+).
- **[D]** Render gratis: si la app está dormida, el primero que escanee el QR espera ~1 min. Se muestra una pantalla de carga con la marca.
- **[D]** Kingmaker es difícil de detectar automáticamente: se propone por puntuaciones y se confirma a mano.

---

## 15. Lo que necesito de ti (en un solo mensaje)

1. **OK al plan** (o cambios).
2. **Base de datos**: ¿Neon (recomendado) o Supabase?
3. **Podcasts**: ¿empiezo solo con iTunes + RSS (sin clave, recomendado) o también Podcast Index (tendrías que darme de alta una clave gratis)?
4. **Render**: ¿plan Free (0 €, se duerme) o Starter (7 $/mes, siempre despierto)?

Publicación (Render) e IA (Gemini gratis) ya están decididas en tu encargo.
