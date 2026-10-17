# 🎾 Bandeja · Torneos de pádel para clubes

Plataforma web para que los clubes de pádel de España creen y gestionen **torneos amateur**: inscripciones sin registro, lista de espera, cuadros con cabezas de serie y byes, horarios sin solapes y resultados en directo. Todo en castellano y pensado primero para móvil (el enlace se comparte por WhatsApp).

**▶ Demo pública:** https://christianvr57-jpg.github.io/bandeja-padel/
**Acceso del club demo:** `demo@example.com` / `padeldemo` (en la demo también hay un botón «Entrar como club demo»).

> La demo de GitHub Pages ejecuta la API y una base de datos PostgreSQL (PGlite) **dentro de tu navegador**: no necesita servidor ni cuentas, cada visitante tiene su propia copia de los datos y los emails «enviados» se ven en *Emails enviados*. Para un uso real (varios dispositivos, emails de verdad) se despliega el servidor: ver [Despliegue](#despliegue).

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/christianvr57-jpg/bandeja-padel)

---

## Qué hace

### Club (con cuenta)
- Registro e inicio de sesión del club.
- **Torneos**: nombre, fechas, sede y dirección (enlace a Maps), pistas, precio, fecha límite de inscripción, reglamento, imagen de portada, contacto, zona horaria (península/Canarias). Borrador → publicado → finalizado.
- **Categorías**: masculina, femenina o mixta; niveles 1ª–5ª, iniciación/medio/avanzado u open; límite de parejas.
- **Formatos**: eliminatoria directa, eliminatoria con **consolación**, **fase de grupos + eliminatoria** y **americano** por parejas (liguilla por juegos). Partidos al mejor de 3 sets, con super tie-break, a un set o por juegos.
- **Inscritos**: listado por categoría con DNI/teléfono/email, **lista de espera automática**, marcar pagado, editar, dar de baja, mover de categoría, añadir parejas a mano, notas internas y **exportación a Excel (CSV)**.
- **Cuadros**: sorteo automático con **cabezas de serie** opcionales, **byes** para las mejores parejas cuando no cuadra la potencia de 2, y **ajuste manual** (intercambiar posiciones o mover parejas entre grupos) mientras no haya resultados.
- **Horarios**: asignar pista y hora a mano o **programación automática** por franjas, con **detección de solapes** (misma pista, misma pareja, mismo jugador inscrito en dos categorías, o partido antes que su previo). Vista lista y vista por pistas.
- **Resultados** por sets con validación (6-4, 7-5, 7-6, super tie-break a 10 con diferencia de 2, W.O., retirada) y **avance automático** en el cuadro, consolación y clasificaciones de grupo.
- Página pública con **enlace para compartir** (WhatsApp, copiar, compartir nativo).
- **RGPD**: anonimizar los datos personales de un torneo finalizado con un clic.

### Jugador (sin cuenta)
- Inscripción por pareja: nombre, email, teléfono y DNI/NIE de ambos.
- Validación de **DNI/NIE con letra de control**, email y **teléfono español**.
- No se puede inscribir el mismo DNI dos veces en una categoría (garantizado en base de datos).
- **Email de confirmación con enlace privado** para consultar, modificar o cancelar la inscripción sin cuenta. Si la categoría está llena, entra en lista de espera y sube sola (con aviso por email) cuando se libera una plaza.
- Casilla obligatoria de aceptación de la política de privacidad (se guarda fecha y versión).

### Público
- Información, categorías y plazas libres, inscritos, cuadros (vista de cuadro o por rondas), grupos con clasificación, horarios por día y resultados, búsqueda por jugador. Se refresca solo cada minuto.
- **Solo se muestran nombres**: DNI, email y teléfono nunca salen en las páginas públicas.

---

## Decisiones técnicas

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Lenguaje | **TypeScript** en todo | Un único lenguaje y los mismos tipos/validaciones en servidor y cliente (`src/shared`). |
| Lógica de dominio | Funciones puras en `src/shared` | Cuadros, byes, consolación, grupos, marcadores, solapes y DNI se testean sin base de datos ni HTTP. |
| Modelo de cuadro | Cada hueco declara su **origen** (pareja, bye, ganador/perdedor de otro partido, puesto de grupo…) | Los participantes de cada ronda se **derivan** de los resultados: editar un resultado propaga los cambios sin estado duplicado y se puede saber qué partidos dependen de cuál (para bloquear ediciones incoherentes). |
| API | **Hono** | Ligera y basada en `fetch`: la misma API corre en Node, en los tests y **dentro del navegador** (demo). |
| Base de datos | **PostgreSQL + Drizzle ORM** | Relacional, transacciones e índices parciales (DNI único por categoría entre inscripciones activas). En local, tests y demo se usa **PGlite** (Postgres en WebAssembly): cero instalación. |
| Frontend | **React + Vite + Tailwind CSS**, React Router, TanStack Query | SPA rápida y mobile-first; el panel del club se carga bajo demanda para que los jugadores que llegan por WhatsApp descarguen lo mínimo. Sin librería de componentes: menos peso, diseño propio. |
| Despliegue | **GitHub Pages** (demo) + **Render** (real) | Pages permite probarlo *ya*, sin crear cuentas. Render ofrece web + PostgreSQL gratis con un *blueprint* (`render.yaml`) de un clic. |
| Emails | SMTP opcional (nodemailer) | Funciona con Gmail, Brevo, Resend… Sin SMTP, la app sigue funcionando: el enlace privado se muestra al inscribirse. |

### Seguridad y privacidad
- Contraseñas con **PBKDF2-SHA256 (600.000 iteraciones)** y sal aleatoria; comparación en tiempo constante.
- Sesiones con token aleatorio de 256 bits en **cookie httpOnly, Secure, SameSite=Lax**; en BD solo se guarda su SHA-256.
- Enlaces privados de inscripción de 256 bits, guardados como hash (rotan al salir de la lista de espera).
- **Control de acceso**: todo recurso del panel se comprueba contra el club de la sesión; si es de otro club se responde 404.
- **Anti-CSRF**: toda escritura exige una cabecera propia que otra web no puede añadir.
- **Rate limiting** en base de datos (funciona con varias instancias) para inscripciones, login, alta de clubes y enlaces privados; las IPs se guardan solo como hash.
- **Anti-spam** en el formulario: campo trampa invisible y tiempo mínimo de rellenado.
- Validación de todas las entradas con **zod**; CSV protegido contra inyección de fórmulas; CSP y cabeceras de seguridad.
- **Datos mínimos**: las respuestas públicas se construyen solo con nombres; el cuerpo de los emails (que contiene enlaces privados) no se guarda; fuentes servidas desde el propio dominio (sin Google Fonts); sin cookies de terceros ni analítica.
- Política de privacidad de plantilla (RGPD/LOPDGDD) y botón para **anonimizar** torneos finalizados.

---

## Estructura

```
src/
  shared/            Lógica de dominio pura y tipos compartidos
    draw/            Generación y resolución de cuadros, marcadores, clasificaciones
    validation/      DNI/NIE, teléfono, email
    schedule.ts      Solapes y programación automática
    time.ts          Zonas horarias sin dependencias
  server/            API (Hono) + base de datos (Drizzle)
    app.ts           Montaje de la API (agnóstico del entorno)
    node.ts          Servidor Node: API + web compilada
    routes/          auth, admin (panel del club), public
    services/        Inscripciones, cuadros, vistas, horarios…
    db/              Esquema y migraciones embebidas
    seed.ts          Datos de demostración
  web/               SPA React
    demo/backend.ts  La API ejecutándose en el navegador sobre PGlite (modo demo)
tests/               Vitest: dominio + integración de la API
drizzle/             Migraciones SQL generadas
```

---

## Ejecutar en local

Requisitos: **Node 20.19+** (probado con Node 22 y 24). No hace falta instalar PostgreSQL.

```bash
npm install
npm run dev
```

- Web: http://localhost:5173 (con recarga en caliente) · API: http://localhost:3000
- Sin `DATABASE_URL` se usa PGlite en `./.data`. La primera vez se crean los datos de demostración.
- Para usar un PostgreSQL propio: copia `.env.example` a `.env` y define `DATABASE_URL` (o expórtala en la terminal).

Otros comandos:

```bash
npm test               # tests (dominio + API)
npm run typecheck      # comprobación de tipos
npm run build && npm start   # versión de producción en http://localhost:3000
npm run dev:demo       # la demo "todo en el navegador"
npm run deploy:pages   # publica la demo en GitHub Pages (rama gh-pages)
```

Si cambias el esquema (`src/server/db/schema.ts`): `npm run db:generate` crea la migración y la embebe en el código.

---

## Despliegue

### Demo estática (GitHub Pages) — ya publicada
`npm run deploy:pages` compila el modo demo y lo sube a la rama `gh-pages`. En el repositorio: *Settings → Pages → Deploy from a branch → gh-pages / root*.

### Versión real (Render, gratis)
1. Entra en https://render.com y regístrate con tu cuenta de GitHub.
2. Pulsa el botón **Deploy to Render** de arriba (o *New → Blueprint* y elige este repositorio).
3. Deja los valores por defecto (puedes dejar en blanco las variables SMTP) y pulsa **Apply**. Render crea la web y la base de datos PostgreSQL.
4. En unos minutos tendrás la URL `https://bandeja-padel.onrender.com` (o similar). Los datos demo se crean solos la primera vez.

Notas del plan gratuito de Render: la web se «duerme» tras 15 minutos sin visitas (la primera carga tarda ~1 minuto) y la base de datos gratuita caduca a los 30 días. Para algo duradero, crea una base de datos gratuita en [Neon](https://neon.tech) y pon su cadena de conexión en la variable `DATABASE_URL` del servicio.

### Emails reales (opcional)
Define en el servicio `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`. Ejemplo con Gmail: host `smtp.gmail.com`, puerto `587`, tu cuenta y una *contraseña de aplicación* (Cuenta de Google → Seguridad → Contraseñas de aplicaciones).

### Variables de entorno
| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | PostgreSQL. Sin ella se usa PGlite en `./.data` (solo para pruebas). |
| `PUBLIC_URL` | URL pública para los enlaces de los emails (en Render se detecta sola). |
| `SEED_DEMO` | `false` para no crear datos de demostración. |
| `SMTP_*`, `MAIL_FROM` | Envío de emails. |
| `TRUST_PROXY` | `true` si hay un proxy delante (para leer la IP real en el rate limiting; en Render es automático). |

---

## Credenciales demo
- Club: **demo@example.com** / **padeldemo**
- Todos los jugadores de ejemplo son ficticios (DNIs con letra válida generados al azar, emails `@example.com`).

---

## Tests
`npm test` ejecuta 80+ tests:
- **Cuadros**: orden de cabezas de serie, byes (sin bye contra bye, siempre para las cabezas de serie), avance de rondas, propagación al corregir resultados, consolación (incluido el caso de parejas exentas), grupos en serpiente, cruces de grupos sin enfrentar a parejas del mismo grupo, americano, ajuste manual.
- **Marcadores** (sets, super tie-break, W.O., retirada) y **clasificaciones** (enfrentamiento directo, diferencias).
- **Validación** de DNI/NIE, teléfonos y emails.
- **Horarios**: solapes y programación automática; zonas horarias con cambio de hora.
- **API**: autenticación, cookies seguras, CSRF, control de acceso entre clubes, inscripción con lista de espera y promoción automática, DNI duplicado, anti-spam, rate limiting, enlace privado, que las páginas públicas no contienen DNI/email/teléfono, exportación CSV, cuadros y resultados, datos demo.

---

## Mejoras pendientes (priorizadas)
1. **Notificaciones de horario**: avisar por email (y opcionalmente WhatsApp Business) cuando se programa o cambia un partido.
2. **Cifrado de DNI en reposo** (cifrado a nivel de columna con clave en variable de entorno) y borrado automático de datos personales X meses después del torneo.
3. **Pago online** de la inscripción (Stripe/Redsys/Bizum) y conciliación automática del «pagado».
4. **Recuperación de contraseña** y verificación del email del club; varios usuarios por club con roles.
5. **Previsualización en WhatsApp** (etiquetas Open Graph por torneo) con renderizado en servidor de la página pública.
6. **Americano individual** (rotación de parejas) además del americano por parejas; cuadros de 3º y 4º puesto; formato «punto de oro» configurable.
7. **Sustituir una pareja retirada** por la primera de la lista de espera después de generar el cuadro.
8. Exportar a **.xlsx** nativo y **PDF imprimible** de cuadros y horarios.
9. Vista de **parrilla por pistas con arrastrar y soltar**, y franjas no disponibles por pista.
10. **CI con GitHub Actions** (tests en cada push y despliegue automático de la demo). Requiere dar al token de `gh` el permiso `workflow`.
11. Accesibilidad (auditoría completa con lector de pantalla) e internacionalización (catalán, euskera, gallego).

---

Licencia MIT.
