import type { ReactNode } from 'react';
import { PRIVACY_VERSION } from '@shared/api';
import { Container } from '../components/Layout';
import { Alert } from '../components/ui';

function Doc({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <Container className="py-10">
      <article className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Versión {updated}</p>
        <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-slate-700 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
      </article>
    </Container>
  );
}

export function Privacy() {
  return (
    <Doc title="Política de privacidad" updated={PRIVACY_VERSION}>
      <Alert tone="warning">
        Plantilla orientativa adaptada al RGPD (Reglamento UE 2016/679) y a la LOPDGDD (Ley Orgánica 3/2018). Cada club debe revisarla y
        completarla con sus datos antes de usar la plataforma en producción.
      </Alert>

      <section>
        <h2>1. ¿Quién es el responsable de tus datos?</h2>
        <p>
          Cuando te inscribes en un torneo, el <strong>responsable del tratamiento es el club organizador</strong> de ese torneo, cuyos datos de
          contacto aparecen en la página del torneo. Bandeja actúa como <strong>encargado del tratamiento</strong> (art. 28 RGPD): presta la
          herramienta al club y trata los datos únicamente siguiendo sus instrucciones.
        </p>
        <p className="mt-2">Para las cuentas de los clubes, el responsable es el titular de la plataforma.</p>
      </section>

      <section>
        <h2>2. ¿Qué datos recogemos?</h2>
        <ul>
          <li>
            <strong>Inscripción de jugadores:</strong> nombre y apellidos, DNI/NIE, email y teléfono de los dos miembros de la pareja, la categoría
            elegida y la fecha y versión del consentimiento.
          </li>
          <li>
            <strong>Cuentas de club:</strong> nombre del club, ciudad, email de acceso y contraseña (guardada cifrada mediante un algoritmo de
            hash, nunca en claro).
          </li>
          <li>
            <strong>Datos técnicos mínimos:</strong> para evitar abusos limitamos el número de envíos por dirección IP. No guardamos la IP: solo
            una huella cifrada temporal que se borra en 24 horas.
          </li>
        </ul>
        <p className="mt-2">Solo pedimos los datos imprescindibles para organizar el torneo (principio de minimización).</p>
      </section>

      <section>
        <h2>3. ¿Para qué los usamos?</h2>
        <ul>
          <li>Gestionar tu inscripción, la lista de espera, los cuadros, los horarios y los resultados del torneo.</li>
          <li>Identificar a cada jugador de forma inequívoca y evitar inscripciones duplicadas en una misma categoría (DNI/NIE).</li>
          <li>Enviarte la confirmación de inscripción y avisos sobre el torneo (cambios de horario, plaza liberada, cancelaciones).</li>
        </ul>
        <p className="mt-2">No usamos tus datos para publicidad ni elaboramos perfiles.</p>
      </section>

      <section>
        <h2>4. ¿Con qué base legal?</h2>
        <p>
          Tu <strong>consentimiento explícito</strong> (art. 6.1.a RGPD), que das al marcar la casilla del formulario, y la{' '}
          <strong>ejecución de la relación</strong> que se establece al inscribirte en el torneo (art. 6.1.b RGPD). Puedes retirar el
          consentimiento en cualquier momento cancelando la inscripción.
        </p>
      </section>

      <section>
        <h2>5. ¿Qué se publica?</h2>
        <p>
          En las páginas públicas del torneo (cuadros, horarios, resultados y lista de inscritos) <strong>solo aparece tu nombre y apellidos</strong>
          , ya que es necesario para el desarrollo de la competición. Tu DNI/NIE, email y teléfono <strong>nunca se muestran públicamente</strong>:
          únicamente puede verlos el club organizador.
        </p>
      </section>

      <section>
        <h2>6. ¿A quién se comunican?</h2>
        <p>
          Al club organizador del torneo. Además, a los proveedores técnicos necesarios para prestar el servicio (alojamiento web, base de datos y
          envío de emails), que actúan como encargados del tratamiento con las garantías del RGPD. No se ceden datos a terceros salvo obligación
          legal.
        </p>
      </section>

      <section>
        <h2>7. ¿Cuánto tiempo se conservan?</h2>
        <p>
          Mientras dure el torneo y, después, el tiempo necesario para atender posibles reclamaciones. Una vez finalizado, el club puede{' '}
          <strong>anonimizar</strong> el torneo con un clic: se borran DNI/NIE, emails y teléfonos y se conservan solo los nombres en el histórico
          de resultados. Recomendamos no conservar los datos de contacto más de 12 meses.
        </p>
      </section>

      <section>
        <h2>8. Tus derechos</h2>
        <p>
          Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad dirigiéndote al club
          organizador. Además, con el <strong>enlace privado</strong> que recibes por email puedes consultar, corregir o cancelar tu inscripción
          en cualquier momento, sin necesidad de cuenta.
        </p>
        <p className="mt-2">
          Si consideras que no se han respetado tus derechos, puedes presentar una reclamación ante la Agencia Española de Protección de Datos (
          <a className="text-court-700 underline" href="https://www.aepd.es" target="_blank" rel="noreferrer">
            www.aepd.es
          </a>
          ).
        </p>
      </section>

      <section>
        <h2>9. Menores de edad</h2>
        <p>
          Si alguno de los jugadores es menor de 14 años, la inscripción debe realizarla su madre, padre o tutor legal, que presta el consentimiento
          en su nombre (art. 7 LOPDGDD).
        </p>
      </section>

      <section>
        <h2>10. Seguridad</h2>
        <p>
          Las comunicaciones van cifradas (HTTPS), las contraseñas se guardan con hash, el enlace de gestión de cada inscripción es aleatorio y se
          almacena cifrado, y cada club solo puede acceder a los datos de sus propios torneos.
        </p>
      </section>

      <section>
        <h2>11. Cookies</h2>
        <p>
          Solo usamos una cookie técnica de sesión para que los clubes puedan iniciar sesión. No usamos cookies analíticas, publicitarias ni de
          terceros, por lo que no es necesario un aviso de consentimiento de cookies (art. 22.2 LSSI). Las fuentes tipográficas se sirven desde
          nuestro propio servidor.
        </p>
      </section>
    </Doc>
  );
}

export function Terms() {
  return (
    <Doc title="Condiciones de uso" updated={PRIVACY_VERSION}>
      <Alert tone="warning">Plantilla orientativa. Revísala y complétala con los datos del titular de la plataforma.</Alert>
      <section>
        <h2>1. Objeto</h2>
        <p>
          Bandeja es una herramienta para que los clubes de pádel organicen torneos amateur: inscripciones, cuadros, horarios y resultados. El uso
          por parte de los jugadores (inscribirse y consultar torneos) es gratuito y no requiere registro.
        </p>
      </section>
      <section>
        <h2>2. Obligaciones del club</h2>
        <ul>
          <li>Facilitar datos veraces y custodiar sus credenciales de acceso.</li>
          <li>
            Actuar como responsable del tratamiento de los datos de los jugadores de sus torneos, usarlos solo para organizar la competición y
            atender los derechos de los interesados.
          </li>
          <li>Anonimizar o eliminar los datos personales cuando ya no sean necesarios.</li>
          <li>Gestionar directamente con los jugadores el cobro de las inscripciones y su reglamento.</li>
        </ul>
      </section>
      <section>
        <h2>3. Responsabilidad</h2>
        <p>
          La plataforma se ofrece "tal cual". El club es responsable del contenido que publica (descripciones, reglamentos, imágenes) y de la
          organización del torneo.
        </p>
      </section>
      <section>
        <h2>4. Baja</h2>
        <p>El club puede eliminar sus torneos en cualquier momento; al hacerlo se borran todos sus datos asociados.</p>
      </section>
    </Doc>
  );
}
