// lib/calendarTemplate.test.ts
// Run: npx tsx lib/calendarTemplate.test.ts

import { renderTemplate, extractVariables, validateTemplate, TemplateContext } from './calendarTemplate'

const ctx: TemplateContext = {
  name: 'Juan Pérez',
  email: 'juan@example.com',
  phone: '+56 9 1234 5678',
  notes: 'Nota de prueba',
  event_type: 'Catchup',
  emoji: '🎯',
  duration: '30',
  date: '2026-05-28',
  time: '10:00',
  reschedule_url: 'https://agenda.example.com/reschedule/abc123',
  extras: { startup: 'Acme Corp', role: 'CTO' },
}

let passed = 0
let failed = 0

function assert(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    console.log(`  ❌ ${name}`)
    console.log(`     expected: ${JSON.stringify(expected)}`)
    console.log(`     actual:   ${JSON.stringify(actual)}`)
  }
}

console.log('\n=== renderTemplate ===')

// 1. Simple var substitution
assert('simple var', renderTemplate('Hola {name}', ctx), 'Hola Juan Pérez')

// 2. Var with dot path
assert('extras.KEY', renderTemplate('{extras.startup}', ctx), 'Acme Corp')

// 3. Empty var renders empty
const ctxNoPhone = { ...ctx, phone: '' }
assert('empty var → empty', renderTemplate('Tel: {phone}', ctxNoPhone), 'Tel: ')

// 4. Missing var renders empty
assert('missing var → empty', renderTemplate('{extras.missing}', ctx), '')

// 5. Conditional block with truthy var
assert(
  'if truthy → renders',
  renderTemplate('{#if phone}Tel: {phone}{/if}', ctx),
  'Tel: +56 9 1234 5678',
)

// 6. Conditional block with empty string
assert(
  'if empty → skips',
  renderTemplate('{#if phone}Tel: {phone}{/if}', ctxNoPhone),
  '',
)

// 7. Conditional block with null-ish (missing extras key)
assert(
  'if missing extras → skips',
  renderTemplate('{#if extras.nope}X{/if}', ctx),
  '',
)

// 8. Multiple conditionals
assert(
  'multiple conditionals',
  renderTemplate('{#if phone}P:{phone}{/if} {#if extras.startup}S:{extras.startup}{/if}', ctx),
  'P:+56 9 1234 5678 S:Acme Corp',
)

// 9. Var inside conditional content
assert(
  'var inside conditional',
  renderTemplate('{#if extras.startup}Startup: {extras.startup} ({name}){/if}', ctx),
  'Startup: Acme Corp (Juan Pérez)',
)

// 10. Malformed — unclosed {#if}
assert(
  'malformed → raw',
  renderTemplate('{#if phone}Tel: {phone}', ctx),
  '{#if phone}Tel: {phone}',
)

// 11. Real-world title template
assert(
  'real title',
  renderTemplate('{emoji} {event_type}: {name}{#if extras.startup} — {extras.startup}{/if}', ctx),
  '🎯 Catchup: Juan Pérez — Acme Corp',
)

// 12. Real-world description template
const descTemplate = `Reunión con: {name}
{#if extras.startup}Startup: {extras.startup}
{/if}{#if phone}Teléfono: {phone}
{/if}
---
Reagendar: {reschedule_url}`

assert(
  'real description',
  renderTemplate(descTemplate, ctx),
  `Reunión con: Juan Pérez
Startup: Acme Corp
Teléfono: +56 9 1234 5678

---
Reagendar: https://agenda.example.com/reschedule/abc123`,
)

console.log('\n=== extractVariables ===')

// 11 (plan numbering). Finds all vars
const vars = extractVariables('{name} {extras.startup} {#if phone}Tel{/if} {email}')
assert('extracts all vars', vars.sort(), ['email', 'extras.startup', 'name', 'phone'].sort())

console.log('\n=== validateTemplate ===')

const available = [
  'name', 'email', 'phone', 'notes',
  'event_type', 'emoji', 'duration',
  'date', 'time', 'reschedule_url',
  'extras.startup', 'extras.role',
]

// 12. Unknown variable flagged
const result = validateTemplate('{name} {extras.typo}', available)
assert('flags unknown', result.valid, false)
assert('error message', result.errors, ['Variable desconocida: {extras.typo}'])

// Valid template
const resultOk = validateTemplate('{name} {extras.startup}', available)
assert('valid template', resultOk.valid, true)
assert('no errors', resultOk.errors, [])

// Malformed conditional
const resultBad = validateTemplate('{#if phone}x', available)
assert('malformed conditional error', resultBad.valid, false)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
