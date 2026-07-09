# Sync de contactos a Google Workspace al crear un booking

> Estado: implementado en backend (2026-07-09), pendiente deploy + re-consent + dogfood.

## Qué hace

Cuando se crea un booking, además del evento de Calendar y la fila en `bookings`,
la info del invitado (nombre, email, teléfono, startup) se **crea o enriquece**
como contacto en la lista de contactos de Google Workspace del dueño, dentro de
un label dedicado **"Agenda ChileVentures"**. Best-effort: si falla, el booking
se crea igual.

## Decisiones de diseño (confirmadas)

- **Dedup por email exacto.** El email es la identidad: email nuevo = contacto
  nuevo. Cero riesgo de fusionar personas distintas.
- **Enriquecer sin pisar.** Contacto existente (match por email): teléfono nuevo
  y distinto se **agrega** como adicional; startup se completa solo si estaba
  vacío; nombre nunca se pisa; se agrega una nota `"Agendó <tipo> el <fecha>"`.
- **Label dedicado** "Agenda ChileVentures" → filtrable y reversible en bloque.
- **Campos:** nombre, email, teléfono, `extras.startup` → organización, nota.
- **Best-effort, no bloqueante.** Un fallo de People API (scope faltante, red)
  se loguea en `app_logs` (`warn`) y no afecta el booking. El invitado nunca ve
  un error por esto.
- **Un solo dueño.** Reusa el token de `config.google_calendar_token`.
- **Fuera de alcance:** reschedule/cancel, sync retroactivo, matching por
  nombre/teléfono, borrado de contactos.

## Cambios

| Archivo | Cambio |
|---|---|
| `agenda-backend/.../google-auth/index.ts:152` | Scope OAuth: agrega `.../auth/contacts` al `calendar` existente |
| `agenda-backend/.../_shared/googleContacts.ts` | **Nuevo.** `syncBookingContact()` — ensureAgendaGroup + findContactByEmail (connections.list) + create/enrich con etag |
| `agenda-backend/.../book/index.ts` | Import + hook best-effort tras el insert exitoso del booking |
| `agenda-backend/.../_shared/calendarTemplate.ts:114` | Fix de tipos pre-existente (cast `as unknown as`) |

## People API usada

- `GET contactGroups` / `POST contactGroups` — encontrar o crear el label.
- `GET people/me/connections?personFields=...` (paginado) — buscar por email
  (determinístico, sin el warmup/consistencia eventual de `searchContacts`).
- `POST people:createContact` + `POST contactGroups/{id}/members:modify` — crear
  y etiquetar.
- `PATCH people/{id}:updateContact?updatePersonFields=...` (con `etag`) — enriquecer.

## Deploy + activación (una vez)

1. `supabase functions deploy google-auth --no-verify-jwt`
2. `supabase functions deploy book --no-verify-jwt`
3. **Reconectar Google desde `/admin`** → la pantalla de consentimiento ahora
   pide contactos; el token nuevo trae el scope. Sin esto, el sync se saltea
   (queda un `warn` en `app_logs`, el booking sigue normal).

## Verificación

- Booking con email nuevo → contacto nuevo con nombre/email/tel/startup en el
  label "Agenda ChileVentures".
- Segundo booking, mismo email, teléfono distinto → mismo contacto con **ambos**
  teléfonos; nombre intacto.
- Booking sin teléfono → contacto sin teléfono, sin error.
- Google desconectado / sin scope → booking normal + `warn` en `app_logs`.
