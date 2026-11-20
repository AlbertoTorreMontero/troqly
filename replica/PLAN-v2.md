# TROQLY v2 — Plan corregido

> Base: la app de registro de partidas y estadísticas, replicada en funciones, pantallas y cálculos.
> Encima: el asistente de reglas con IA. Fuera de momento: logros con jerga (Kingmaker, Sandbagger…), podcasts y extras.
> Nombre, textos, iconos y diseño siguen siendo propios: se copia cómo funciona, no su marca.

## 1. Cómo es la app de referencia (lo investigado)

**Modelo de datos** (sacado de su propio archivo de exportación de ejemplo):
- `games`: nombre, `highestWins` (gana el que más / el que menos), `noPoints` (sin puntos), `cooperative`, `usesTeams`, `bggId`, `bggYear`, `designers`, imagen.
- `players`: nombre, `isAnonymous`, `bggUsername`. Un jugador es "yo" (`userInfo.meRefId`).
- `locations`: nombre.
- `plays`: `gameRefId`, `locationRefId`, `playDate`, `durationMin`, `rounds`, `rating`, `ignored` (no cuenta en estadísticas), `manualWinner`, `usesTeams`, imágenes y una lista `playerScores`.
- `playerScores`: `playerRefId`, `score` (texto), `winner`, `rank`, `seatOrder`, `startPlayer`, `newPlayer`, `role`.
- Además: `challenges`, `uuid` y `modificationDate` en todo (para no duplicar al reimportar).

**Pantallas:**
- **Inicio / resumen**: totales de partidas, juegos, jugadores y lugares; periodo de 7 días / 365 días / todo; gráfico de partidas de la última semana y de las últimas 26 semanas; tartas por día de la semana y por número de jugadores.
- **Partidas**: lista por fecha, ficha de partida, "añadir partida" copiando una anterior.
- **Juegos**: colección con estados (lo tengo, deseado, quiero jugarlo…), filtros y filtros guardados; ficha de juego con partidas únicas, filtro por expansión y pestaña de estadísticas (récords, % de victorias por jugador, puntuaciones, duraciones, por número de jugadores).
- **Jugadores**: lista ordenable por más partidas o más recientes; ficha con % de victorias, H-index personal, juegos más jugados y con quién juega.
- **Lugares**.
- **Insights** (análisis por periodo: mes, año, todo): H-index, juegos con 5, 10, 25 y 100+ partidas (fives, dimes, quarters, centuries), juegos nuevos para mí, más jugados, imagen 3x3 para compartir, mapa de calor mensual de partidas y duración, coste por partida y por hora.
- **Estadísticas avanzadas** (en el original son de pago): rachas de victorias, desempates, jugadores nuevos y jugador inicial, combinaciones de jugadores, estadísticas por rol, filtros por jugadores, lugares, periodo y número de jugadores.
- **Retos**: "juega X juegos Y veces", "llega a tu siguiente H-index", con periodo y juegos elegidos.
- **Ajustes**: exportar e importar, idioma.

**Reglas de cálculo que replico:**
- En los empates, cuentan todos los ganadores.
- Las partidas sin ganador ni perdedor y las ignoradas cuentan como partida, pero no como victoria ni derrota.
- El solitario se marca como "nadie ganó o perdió".
- En el ranking de "mejor % de victorias por juego" solo entran jugadores con un mínimo de partidas que sube con el volumen: 2, 3 a partir de 10, 5 a partir de 50 y 10 a partir de 100.

## 2. Importar los datos de la otra app (captar a sus usuarios)

- Ellos exportan todo a un `.json` desde Ajustes → Exportar. **TROQLY importa ese archivo tal cual**: juegos, jugadores, lugares, partidas con puntos, ganadores, roles, jugador inicial, jugadores nuevos y duraciones.
- **Pantalla de emparejado**: "¿quién eres tú?" (se toma `meRefId`) y "estos jugadores son tus amigos del grupo". Los jugadores sin cuenta quedan como invitados y se reclaman al registrarse.
- **Sin duplicados**: se usa su `uuid`, así se puede reimportar cuando quieras.
- **Exportación compatible**: TROQLY exporta en el mismo formato, para que nadie se sienta atrapado. Eso da confianza para cambiarse.
- Importación desde BGG por nombre de usuario: a valorar; su API ahora pide registro. Fase 2.
- Mensaje en la bienvenida: «¿Vienes de otra app de partidas? Trae tu historial en 1 minuto».

## 3. Qué tiene TROQLY además del original

- **Grupo compartido**: cada partida se apunta una vez y aparece a todos los del grupo. En el original hay que enviársela a cada uno.
- **Asistente de reglas** dentro de la ficha de cada juego.
- **Todas las estadísticas gratis**, incluidas las que en el original son de pago.
- **Web/PWA** para iPhone y Android, en español e inglés.

## 3b. Base de datos de juegos, hojas de puntuación y facciones

**Base de datos de juegos (todos los juegos)**
- La otra app la saca de BoardGameGeek (BGG). Desde finales de 2025 la API de BGG exige registrar la aplicación y usar un token. BGG revisa cada solicitud a mano, lo que puede tardar más de una semana.
- El uso gratuito solo se permite para fines **no comerciales**. Si TROQLY cobra o pone anuncios, hace falta una licencia comercial de BGG. Hay que citar a BGG y no se pueden modificar sus datos.
- Plan:
  1. Registras TROQLY en boardgamegeek.com/applications como no comercial. Te dejo el texto de la solicitud preparado.
  2. El servidor busca juegos en BGG y guarda una ficha básica: nombre, año, jugadores, duración, mecánicas, imagen y expansiones.
  3. Hasta que llegue el token, se usan los 120 juegos semilla y el alta manual.

**Hojas de puntuación por juego**
- La otra app tiene unas 3.400 hojas hechas por ellos. **Esas no se pueden copiar**: son su trabajo. Hacemos las nuestras:
  - **Hechas a mano** para los ~60 juegos más jugados. Las categorías de puntuación y las facciones son reglas del juego, no textos de nadie. Ejemplo: Root → Marquesa de Gato, Dinastías del Águila, Alianza del Bosque, Vagabundo…
  - **Con IA**: subes el manual y Gemini propone las categorías de puntuación y las facciones o roles, citando la página. Tú lo revisas y queda guardado para todos.
  - **Editor propio**: crear y editar categorías, rondas, facciones, puntuación automática y desempates.
- Tipos de hoja: genérica, por categorías y por rondas. Total y ganador automáticos, con desempate configurable.

**Estadísticas por facción o rol y por categoría** (en la ficha de cada juego):
- Por facción: % de victorias, puntuación media, veces elegida y victorias por número de jugadores.
- Por jugador y facción: con qué facción gana más cada uno.
- Por categoría de puntuación: media, máximo y en qué categoría saca más cada jugador (por ejemplo, en Wingspan, quién hace más puntos con pájaros).
- Filtros combinables en todas las estadísticas: facción, jugadores, lugar, periodo, número de jugadores y expansiones.
- Importación: los roles de la otra app (`role` en cada puntuación) se convierten en facciones del juego.

## 4. Lo que se quita por ahora

Logros con jerga, podcasts, "¿A qué jugamos?" y el tono de pique en los textos. El código queda guardado para recuperarlo más adelante.

## 5. Diseño

Se rehace entero con el estilo **hoja de puntuación** (elegido):
- Fondo de papel crema con cuadrícula suave, tinta casi negra y coral para las acciones. Modo noche en gris noche con "papel" oscuro.
- Números en tipografía monoespaciada, como apuntados a mano en una hoja: líneas de puntos entre nombre y puntos, columnas alineadas, separadores de regla.
- Pantallas densas tipo libreta, sin tarjetas redondeadas ni botones tipo píldora.
- Gráficas finas a tinta: barras, tartas y mapa de calor.

**Mesa en vivo**: se mantiene como opción al registrar una partida (botón «Mesa en vivo»). El registro clásico es el principal.

## 6. Orden de construcción

1. Nuevo modelo de datos y migración desde la v1.
2. Registrar partida completa.
3. Partidas, juegos, jugadores y lugares.
4. Resumen e Insights.
5. Estadísticas avanzadas.
6. Importar y exportar en su formato.
7. Asistente de reglas.
8. Retos.
9. Pruebas con un archivo de exportación real o generado con su formato, en ES y EN, y publicación.
