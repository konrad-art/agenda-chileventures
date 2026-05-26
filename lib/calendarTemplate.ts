// lib/calendarTemplate.ts
// Template engine for Google Calendar event title/description.
// Pure functions, no throws, no side effects.
// Duplicated in agenda-backend/supabase/functions/_shared/calendarTemplate.ts
// — keep both files in sync.

export interface TemplateContext {
  name: string
  email: string
  phone: string
  notes: string
  event_type: string
  emoji: string
  duration: string
  date: string
  time: string
  reschedule_url: string
  extras: Record<string, string>
}

// All built-in variable names (without "extras." prefix).
const BUILTIN_VARS = new Set([
  'name', 'email', 'phone', 'notes',
  'event_type', 'emoji', 'duration',
  'date', 'time', 'reschedule_url',
])

/**
 * Render a template string with variable substitution and conditional blocks.
 *
 * Syntax:
 *   {var}               → ctx[var] || ''
 *   {extras.KEY}        → ctx.extras[KEY] || ''
 *   {#if VAR}...{/if}   → renders inner content only if VAR is truthy & non-empty
 *
 * Nested {#if} is not supported. Malformed templates (unclosed {#if}) return
 * the template string as-is (best-effort fallback).
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  // Step 1: process conditional blocks {#if VAR}...{/if}
  // Detect unclosed conditionals first.
  const ifCount = (template.match(/\{#if\s+/g) || []).length
  const endifCount = (template.match(/\{\/if\}/g) || []).length
  if (ifCount !== endifCount) {
    // Malformed — return raw template as fallback
    return template
  }

  let result = template.replace(
    /\{#if\s+([\w.]+)\}([\s\S]*?)\{\/if\}/g,
    (_match, varName: string, content: string) => {
      const value = resolveVar(varName, ctx)
      return value ? content : ''
    },
  )

  // Step 2: substitute {var} and {extras.KEY}
  result = result.replace(
    /\{([\w.]+)\}/g,
    (_match, varName: string) => resolveVar(varName, ctx),
  )

  return result
}

/**
 * Extract all variable names referenced in a template.
 * Returns both simple vars and dotted paths (e.g. "extras.startup").
 */
export function extractVariables(template: string): string[] {
  const vars = new Set<string>()

  // Variables inside {#if VAR}
  const ifMatches = template.matchAll(/\{#if\s+([\w.]+)\}/g)
  for (const m of ifMatches) vars.add(m[1])

  // Direct {var} references (skip {#if and {/if})
  const varMatches = template.matchAll(/\{([\w.]+)\}/g)
  for (const m of varMatches) {
    const v = m[1]
    if (v !== 'if') vars.add(v)
  }

  return Array.from(vars)
}

/**
 * Validate a template against a list of available variable names.
 * Returns { valid, errors } where errors lists unknown variables.
 */
export function validateTemplate(
  template: string,
  available: string[],
): { valid: boolean; errors: string[] } {
  const used = extractVariables(template)
  const allowed = new Set(available)
  const errors: string[] = []

  for (const v of used) {
    if (!allowed.has(v)) {
      errors.push(`Variable desconocida: {${v}}`)
    }
  }

  // Check for malformed conditionals
  const ifCount = (template.match(/\{#if\s+/g) || []).length
  const endifCount = (template.match(/\{\/if\}/g) || []).length
  if (ifCount !== endifCount) {
    errors.push('Condicional {#if} sin cerrar o {/if} extra')
  }

  return { valid: errors.length === 0, errors }
}

/** Resolve a variable name to its value from the context. */
function resolveVar(varName: string, ctx: TemplateContext): string {
  if (varName.startsWith('extras.')) {
    const key = varName.slice(7) // "extras.".length
    return ctx.extras?.[key] || ''
  }
  return (ctx as unknown as Record<string, unknown>)[varName]?.toString() || ''
}
