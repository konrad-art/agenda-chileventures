# Feature Plan: Configurable Calendar Event Templates + Phone Field

**Status:** Designed + reviewed (plan-eng-review applied). Ready to implement.
**Date:** 2026-05-22
**Estimated effort:** ~11-12 hours across 7 phases.
**Branch strategy:** Each phase is its own commit + push; ship Phase 1 standalone, accumulate the rest.

---

## Problem

Currently `book/index.ts:415-421` hardcodes how Google Calendar events look:
- Title: `{emoji} {eventType.name}: {name} — {extras.startup}` (only uses `extras.startup`)
- Description: 4 fixed lines

Two real pain points:
1. **No phone capture.** Granola (and any meeting recorder) needs phone + email in the calendar event to enrich notes. Today only email is captured (in attendees).
2. **Hardcoded format.** Each event type might want a different layout — but the host can't customize without code changes.

---

## Solution

Two coupled features, shipped in 7 phases:

### A. Phone field (built-in)
- New column `bookings.phone text`
- New column `event_types.phone_mode text` with CHECK ∈ ('off', 'optional', 'required'), DEFAULT 'off'
- Form shows phone field conditionally based on `phone_mode`
- Admin UI: dropdown to set the mode per event type

### B. Configurable templates
- New columns `event_types.calendar_title_template text NULL` and `event_types.calendar_description_template text NULL`
- NULL → use the current hardcoded format (zero behavior change for existing event types)
- Templates use `{var}` substitution and `{#if VAR}content{/if}` conditional blocks
- Variables: `{name}` `{email}` `{phone}` `{notes}` `{event_type}` `{emoji}` `{duration}` `{date}` `{time}` `{reschedule_url}` `{extras.KEY}`
- Admin UI: textarea + variable chips + live preview + PII warning

---

## Architectural decisions (locked in via eng review)

| D | Decision | Rationale |
|---|---|---|
| D1 | **Reschedule uses CURRENT template** (not snapshot) | Simpler, predictable. Host changes propagate. |
| D2 | **Malformed template → fallback to default + log** | NEVER break a booking because of a config error. Log to `app_logs`. |
| D3 | **PII in title → visible warning, allow save** | Inform without paternalism. Host knows context. |
| - | **Multi-user model: "asistentes"** (multiple admins, ONE calendar) | Same as the Mac app plan. No multi-tenant. |
| - | **Template engine duplicated frontend + backend** | Supabase Edge Functions can't share code with Next.js. 50 lines, identical tests. |
| - | **`phone_mode` enum (not 2 booleans)** | Cleaner schema. 3 states are mutually exclusive. |
| - | **No HTML escape inside templates** | GCal description is plain text. Templates produce plain text. |

---

## Phases

### **Phase 0 — Baseline QA** *(30 min)*

Before any code change, verify the current flow works end-to-end:

1. Create a booking with `extras.startup` populated → verify GCal event has expected title/description
2. Create a booking WITHOUT `extras.startup` → verify event format degrades gracefully
3. Reschedule the booking → verify GCal event updates correctly
4. Cancel → verify event is deleted

Capture event IDs and screenshots as baseline. **If any of these fail TODAY, stop and fix before proceeding.**

### **Phase 1 — Phone field** *(2-3h)*

Independent feature, ships alone.

**Migration:**
```sql
ALTER TABLE bookings ADD COLUMN phone text;

ALTER TABLE event_types
  ADD COLUMN phone_mode text NOT NULL DEFAULT 'off'
  CHECK (phone_mode IN ('off', 'optional', 'required'));
```

**Frontend changes:**
- `BookingPage.tsx`: render phone input below email, conditional on `phone_mode != 'off'`. Required asterisk if `'required'`. Placeholder: `+56 9 1234 5678`.
- `admin/settings/page.tsx`: new dropdown "Pedir teléfono" with 3 options in the event type editor.
- `lib/types.ts`: add `phone?: string | null` to `Booking`, `phone_mode?: 'off' | 'optional' | 'required'` to `EventType`.

**Edge function changes:**
- `book/index.ts`: accept `phone` in body, validate (`<=50 chars`, free text), insert into `bookings.phone`. If `phone_mode='required'` and missing → 400 error.
- `reschedule/index.ts`: no change (phone is set at create-time only).

**QA:**
- Booking type with `phone_mode='off'` → form has no phone field. Booking creates normally.
- Switch to `phone_mode='optional'` → form shows phone. Empty submit works. Filled submit saves phone.
- Switch to `phone_mode='required'` → empty submit shows validation error.

### **Phase 2 — Template migration** *(1h)*

```sql
ALTER TABLE event_types
  ADD COLUMN calendar_title_template text,
  ADD COLUMN calendar_description_template text;

COMMENT ON COLUMN event_types.calendar_title_template IS
  'Template for GCal event summary. NULL = use hardcoded default. Variables: {name}, {email}, {phone}, {notes}, {event_type}, {emoji}, {duration}, {date}, {time}, {reschedule_url}, {extras.KEY}. Conditionals: {#if VAR}...{/if}.';
COMMENT ON COLUMN event_types.calendar_description_template IS
  'Template for GCal event description. Same variables and conditionals as title.';
```

Both NULL → existing event types behave identically. **Zero behavior change.**

**QA:** create a booking after migration → must produce same GCal event as Phase 0 baseline.

### **Phase 3 — Template engine library + tests** *(2h)*

Two files, identical content, identical tests:

```
lib/calendarTemplate.ts                              ← frontend
agenda-backend/supabase/functions/_shared/
  calendarTemplate.ts                                ← edge function
```

**API:**
```typescript
export function renderTemplate(template: string, ctx: TemplateContext): string
export function extractVariables(template: string): string[]
export function validateTemplate(template: string, available: string[]):
  { valid: boolean; errors: string[] }
```

**Rules:**
- Pure functions, no side effects, no throws
- `{var}` → ctx[var] || ''
- `{extras.foo}` → ctx.extras?.foo || ''
- `{#if VAR}content{/if}` → renders content only if VAR is truthy and non-empty string
- Nested `{#if}` not supported (KISS, KILL nesting at parse time)
- Malformed (unclosed `{#if}`) → return template as-is (best-effort fallback)

**Tests (12 cases each side):**
1. Simple var substitution
2. Var with dot path (`{extras.foo}`)
3. Empty var renders empty
4. Missing var renders empty
5. Conditional block with truthy var renders
6. Conditional block with empty string skips
7. Conditional block with null skips
8. Multiple conditionals in same template
9. Conditional with var inside conditional content
10. Malformed `{#if}` without `{/if}` returns raw
11. `extractVariables` finds all `{var}` and `{x.y}` patterns
12. `validateTemplate` flags unknown variables

**QA:** suite passes 100%. Zero impact on production (code not wired up yet).

### **Phase 4 — Edge functions use templates** *(2h)*

In `book/index.ts` and `reschedule/index.ts`:

```typescript
import { renderTemplate } from "../_shared/calendarTemplate.ts";

function defaultTitle(ctx: TemplateContext): string {
  const startup = ctx.extras?.startup ? ` — ${ctx.extras.startup}` : '';
  return `${ctx.emoji} ${ctx.event_type}: ${ctx.name}${startup}`;
}

function defaultDescription(ctx: TemplateContext): string {
  const lines = [`Reunión con: ${ctx.name}`];
  if (ctx.extras?.startup) lines.push(`Startup: ${ctx.extras.startup}`);
  lines.push('', '---', `Reagendar: ${ctx.reschedule_url}`);
  return lines.join('\n');
}

function buildSummary(eventType, ctx): string {
  if (!eventType.calendar_title_template) return defaultTitle(ctx);
  try {
    return renderTemplate(eventType.calendar_title_template, ctx);
  } catch (e) {
    logEvent(supabase, 'warn', 'Template render failed, using default',
             { event_type_id: eventType.id, error: String(e) });
    return defaultTitle(ctx);
  }
}
// same pattern for buildDescription
```

The hardcoded format from `book/index.ts:415-421` moves into `defaultTitle()` / `defaultDescription()`. Behavior preserved.

**Reschedule** (`reschedule/index.ts`) does the same pattern when PATCHing the GCal event with new datetime + regenerated summary/description.

**QA:**
- Booking with `calendar_title_template=NULL` → produces baseline GCal format. ✓
- Manually SET a template via SQL on Catchup → next Catchup booking uses it. ✓
- Set a malformed template → next booking still succeeds, uses default, logs warning in `/admin/logs`. ✓
- Reschedule a booking → GCal event regenerates with current template. ✓

### **Phase 5 — Admin UI for templates** *(3h)*

In the event type editor (`admin/settings/page.tsx`), add a section:

```
┌─ Plantilla de Google Calendar ─────────────────────┐
│                                                    │
│  Título del evento                                 │
│  ┌──────────────────────────────────────────────┐  │
│  │{emoji} {event_type}: {name}                  │  │
│  │{#if extras.startup} — {extras.startup}{/if}  │  │
│  └──────────────────────────────────────────────┘  │
│  ⚠ Cuidado: {email} aparece en el título visible   │ ← PII warning if needed
│                                                    │
│  Descripción                                       │
│  ┌──────────────────────────────────────────────┐  │
│  │Reunión con: {name}                           │  │
│  │{#if extras.startup}Startup: {extras.startup} │  │
│  │{/if}                                         │  │
│  │{#if phone}Teléfono: {phone}                  │  │
│  │{/if}                                         │  │
│  │                                              │  │
│  │---                                           │  │
│  │Reagendar: {reschedule_url}                   │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ─── Variables disponibles ────────────────────────│
│  Click para insertar al cursor:                    │
│  [{name}] [{email}] [{phone}] [{notes}]            │
│  [{event_type}] [{emoji}] [{duration}]             │
│  [{date}] [{time}] [{reschedule_url}]              │
│  Extras: [{extras.startup}]                        │
│                                                    │
│  ─── Vista previa con datos de ejemplo ──────────  │
│  Título: 🎯 Catchup: Juan Pérez — Acme Corp        │
│  Descripción:                                      │
│  ┌────────────────────────────────────────────┐    │
│  │ Reunión con: Juan Pérez                    │    │
│  │ Startup: Acme Corp                         │    │
│  │ Teléfono: +56 9 1234 5678                  │    │
│  │ ...                                        │    │
│  └────────────────────────────────────────────┘    │
│                                                    │
│  [Restaurar default]                               │
└────────────────────────────────────────────────────┘
```

**Behaviors:**
- Variable chips: click → inserts at cursor position in active textarea
- Live preview: renders both title and description using mock data
- PII warning: if title contains `{email}` or `{phone}`, show yellow banner
- Validation: `validateTemplate()` checks for unknown variables (typo in `{extras.foo}`) → inline error
- "Restaurar default": clears both fields to NULL (uses hardcoded format)
- Character counter on description (warning at 3500/4000 chars)

**QA:**
- Open editor for Catchup, leave fields empty → preview shows hardcoded format
- Add `Phone: {phone}` to description, save → next booking with phone populated shows it in GCal
- Add `{email}` to title → see PII warning appear
- Add `{extras.lknidn}` (typo) → see "unknown variable" inline error

### **Phase 6 — Polish + final QA** *(1h)*

- Documentar las variables y `{#if}` con tooltip help icon next to "Plantilla"
- Verificar que el template muy largo (>4KB description) muestra warning
- Test E2E completo:
  1. Admin: configurar Catchup con phone='required' + templates personalizados
  2. Invitado: abrir /catchup, agendar con phone+notes
  3. Admin: verificar email recibido con datos
  4. GCal: abrir el evento, verificar title y description tienen lo configurado
  5. Granola: confirmar que extrae phone/email correctamente
- Tag versión

---

## Coverage diagram (test plan)

Ver review completo arriba. Resumen:
- Code paths: 18 paths, todos cubiertos con tests unitarios + integración manual
- User flows: 9 flows, 4 requieren E2E manual
- Critical regressions: 0 — el fallback al default cubre todo

---

## Failure modes (acceptable + critical gaps)

| Failure | Test? | Handling? | Notes |
|---|---|---|---|
| Malformed template | ✅ | ✅ fallback + log | Booking succeeds with default |
| Unknown variable | ✅ | ✅ renders empty | UX guideline: use `{#if}` |
| GCal API > 8KB description | ⚠️ no test | ✅ UI caps at 4KB | Manual test in Phase 6 |
| Race: template changed mid-booking | ⚠️ no test | ✅ DB lookup at render time | Naturally consistent |
| Migration partial failure | ⚠️ no test | ✅ Postgres tx | Standard supabase migration |

**0 critical gaps.**

---

## NOT in scope

| Item | Razón |
|---|---|
| Templates para emails (admin/guest notifications) | Otro sistema. Fuera de alcance del pedido. |
| `{#else}` / `{#unless}` / nested conditionals | KISS. Si surge necesidad, en v1.1. |
| Variables custom definidas por host | Solo built-ins + extras. Otro proyecto. |
| Multi-language templates | App es ES-first. |
| Regenerar GCal events existentes al cambiar template | Solo futuras + reagendamientos (D1). |
| Library compartida frontend/backend (monorepo) | Costo > beneficio. |
| Auto-complete IntelliSense en textarea | Chips clickeables suficientes. |
| Phone number format validation (libphonenumber) | Texto libre con placeholder. Granola es flexible. |
| Templates por idioma del invitado | App es ES-first. |
| Versionado de templates | Si cambias, no recuperas el anterior. KISS. |

---

## Worktree parallelization

**Sequential implementation, no parallelization opportunity.** Each phase builds on the previous. Phase 1 (phone) could theoretically ship before Phase 2+ (templates), but coordination overhead > benefit for a single-developer feature.

---

## Implementation Tasks (per-phase checklist)

- [ ] **T1 (P1, ~30min)** — Phase 0: baseline QA. Create booking, screenshot GCal event, reschedule, cancel.
- [ ] **T2 (P1, ~3h)** — Phase 1: phone migration + form + admin toggle + edge function accept.
  - Files: `supabase/migrations/*phone*.sql`, `components/BookingPage.tsx`, `app/admin/settings/page.tsx`, `lib/types.ts`, `supabase/functions/book/index.ts`
  - Verify: phone_mode toggles correctly; required validation works; phone saved in DB.
- [ ] **T3 (P1, ~1h)** — Phase 2: template migration (2 NULL columns).
  - Verify: existing types unchanged.
- [ ] **T4 (P1, ~2h)** — Phase 3: template engine + tests (frontend + backend duplicate).
  - Files: `lib/calendarTemplate.ts`, `supabase/functions/_shared/calendarTemplate.ts`, tests.
  - Verify: 12 unit tests pass on both sides.
- [ ] **T5 (P1, ~2h)** — Phase 4: edge functions use templates with fallback.
  - Files: `supabase/functions/book/index.ts`, `supabase/functions/reschedule/index.ts`
  - Verify: NULL template → baseline; valid template → custom; malformed → default + log.
- [ ] **T6 (P1, ~3h)** — Phase 5: admin UI editor + chips + preview + PII warning.
  - Files: `app/admin/settings/page.tsx`
  - Verify: all interactive behaviors work; validation inline; preview matches actual GCal.
- [ ] **T7 (P2, ~1h)** — Phase 6: polish + E2E test through Granola.

---

## How to resume

When ready to build, tell Claude:
> "Read `docs/feature-calendar-templates.md` and start with Phase 0 baseline QA."

All decisions locked, all variables defined, all test cases enumerated. No re-debate needed unless something material changes.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 0 architecture, 4 code-quality (all P2/P3 resolved), 18 code paths planned with tests, 0 performance, 3 design decisions locked via AskUserQuestion |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (small feature, single-user) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run (admin UI follows existing patterns) |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run (offered, can run /codex consult later) |

**UNRESOLVED:** 0
**VERDICT:** ENG CLEARED — ready to implement
