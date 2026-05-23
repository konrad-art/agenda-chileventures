# Future: Mac Native Admin App (Tauri)

**Status:** Designed, not built. Resume here when ready to implement.
**Date designed:** 2026-05-22
**Estimated effort:** ~5 days of focused work

---

## Problem this solves

Current admin (web at `agenda-chileventures.vercel.app/admin`) requires too many steps for two high-frequency tasks:
1. **Configure event types** — open browser → tab → login → /admin/settings → scroll → edit
2. **Create email proposal links** — same path + click "Link email" → fill modal → copy

Goal: reduce both flows to ~3 seconds via a native Mac app with keyboard-first UX, while reusing 95% of the existing Next.js admin code.

---

## Decisions locked in

| # | Decision | Rationale |
|---|---|---|
| 1 | **Multi-user model: "asistentes"** (multiple admins, ONE calendar) | Future helpers manage Konrad's calendar, not their own. Current schema (`admins` table allowlist) already supports this. No backend changes needed. |
| 2 | **Global shortcut `⌃⌥E`** (Control+Option+E) | Triggers Quick Link Email from anywhere on macOS, even when app is closed. |
| 3 | **No menu bar icon** | Avoid visual noise. |
| 4 | **No native notifications** | Email notifications are sufficient. |
| 5 | **No code signing** (.dmg unsigned) | Personal use only, no $99/yr Apple Developer cost. macOS shows "unverified" warning once on first launch, user accepts. |
| 6 | **Tauri (Rust + WebKit), NOT Electron** | ~10MB vs 100-200MB, uses system WebKit, better Mac feel. |
| 7 | **Hybrid architecture, NOT full native rewrite** | Reuse Next.js admin in embedded webview. Build native only where it adds value (global shortcut, quick modal). |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  agenda-mac (Tauri app)                              │
│                                                      │
│  Main window (1100×800)                              │
│  └─ Embeds: agenda-chileventures.vercel.app/admin    │
│     └─ Cmd+K palette runs INSIDE the web (cmdk lib)  │
│                                                      │
│  Floating "Quick Link" window (500×600)              │
│  └─ Opened by ⌃⌥E global shortcut                    │
│  └─ Loads /admin/quick-link (new Next.js route)      │
│  └─ Auto-closes after copy-to-clipboard              │
│                                                      │
│  Native bits (~50 lines of Rust):                    │
│  - Register global shortcut ⌃⌥E                      │
│  - Window config (size, traffic lights, dock icon)   │
│  - Native menu bar (File / Edit / View / Window)     │
└──────────────────────────────────────────────────────┘
```

### Why this works
- **Auth:** Login flow stays in the embedded webview. Google OAuth + cookies persist in Tauri's data dir.
- **Cookies cross-window:** Tauri shares cookies between windows by default. The quick-link window inherits the same session as main.
- **No backend changes:** All Supabase tables, edge functions, RLS stays as-is. This is purely a frontend distribution change.

---

## The 4 UX surfaces

### 1. Main window
Embedded `/admin`. Full functionality, same as web today.

### 2. `Cmd+K` palette (inside main window)
Implemented with [`cmdk`](https://cmdk.paco.me/) library (Vercel, 4KB). Lives in the Next.js code so it ALSO works in plain browser.

Action catalog:
- `Link Email → [event type]` (Catchup, Intro, Quick, Office, Deep Dive, Short-Intro)
- `Editar tipo: [event type]`
- `Editar config general`
- `Reservas de hoy / esta semana`
- `Logs`
- `Abrir agenda pública: [event type]`
- `Copiar link público: [event type]`
- `Logout`

### 3. Quick Link Email window (the star)
Opens via `⌃⌥E` from anywhere. Optimized for keyboard:
- Auto-focus on event type picker
- Default = last used type (localStorage)
- `Tab` → slots grid → arrow keys + Space to toggle
- `Cmd+Enter` → generate + copy + close
- `Esc` → cancel + close

Target: ~3 seconds from shortcut to clipboard.

### 4. Native macOS menu bar
Standard File/Edit/View/Window with admin shortcuts:
- `⌘N` New Link Email
- `⌘1-4` Navigate to Reservas / Tipos / Logs / Settings
- `⌘O` Open public booking page

---

## Implementation phases (when we resume)

### Phase 1 — Tauri skeleton + main window (1 day)
- `npm create tauri-app@latest agenda-mac`
- Embed `agenda-chileventures.vercel.app/admin` in main window
- App icon, window config, traffic lights
- Build `.dmg`, install, verify login + cookies work
- **Output:** working desktop wrapper of existing admin

### Phase 2 — Quick Link Email page (1-2 days)
- New Next.js route: `/admin/quick-link`
- Compact layout for 500×600 modal window
- Reuse `ProposedSlotsModal` logic, strip layout chrome
- Keyboard shortcuts (Tab/Arrows/Space/Cmd+Enter)
- Auto-copy + Tauri API call to close window
- **Output:** URL that works as standalone "quick action" page

### Phase 3 — Global shortcut `⌃⌥E` (1 day)
- Tauri Rust: register `Ctrl+Alt+E` via `tauri-plugin-global-shortcut`
- On trigger: spawn (or focus) the floating quick-link window
- **Output:** shortcut works from any app on the Mac

### Phase 4 — Cmd+K palette + menu bar (1 day)
- Install `cmdk` in Next.js admin
- Build action catalog (see UX surface 2 above)
- Native menu bar in Tauri config
- **Output:** Cmd+K works in app AND browser

### Phase 5 — Polish + distribution (1 day)
- App icon (1024×1024 PNG → `.icns`)
- Versioned `.dmg` build
- `MAC_APP.md` with build instructions for future Konrad
- Tag `v0.1.0`
- **Output:** installable .dmg, ready to ship

---

## Open questions (revisit when resuming)

1. **Apple Silicon or Intel Mac?** Affects `cargo build --target` flags.
2. **Rust toolchain installed?** If not: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. **Quick Link default behavior:** "remember last used type" (recommended) vs "always start with Catchup"?
4. **Confirm `⌃⌥E` is not taken** by Karabiner / BetterTouchTool / system shortcut?

---

## Things explicitly NOT in scope

| ❌ | Why |
|---|---|
| Rewrite admin in Swift/SwiftUI | Duplicates work, doesn't fix the 2 real pain points |
| Native auth (Rust Google OAuth) | Webview auth is simpler and equivalent |
| Menu bar icon with booking count badge | User opted out (noise) |
| Native macOS notifications on new bookings | User opted out (noise; email is enough) |
| Auto-update mechanism | Single user, manual update is fine |
| Apple Developer Program signing | $99/yr unnecessary for personal use |
| Multi-tenant (each user with own calendar) | Out of scope — model is "assistants for one calendar" |
| Offline mode | Internet required, app is a thin shell over web |

---

## Backend changes required

**Zero.** All existing schema, edge functions, RLS policies, and the Next.js admin keep working unchanged. The Mac app is purely a frontend distribution layer on top.

If we ever go multi-tenant (Modelo 2 from the design conversation), we'd need to add `user_id` columns to `config`, `event_types`, `bookings`, `proposed_links` — that's a different project entirely.

---

## Risks to vigilate during implementation

1. **CSP** on `agenda-chileventures.vercel.app` may block Tauri's webview origin. Fix: add `tauri://localhost` to `connect-src` in `next.config.ts` if warnings appear.
2. **Cookie sharing across Tauri windows** — verify in Phase 1 that the quick-link window inherits the main window's Supabase session.
3. **Global shortcut conflicts** with user's existing macOS / Karabiner / Raycast bindings — confirm `⌃⌥E` is free before locking it in.

---

## How to resume this work

When ready, just tell future Claude:
> "Read `docs/future-mac-app.md` and start with Phase 1."

All context, decisions, and tradeoffs are above. No need to re-debate any of the locked-in decisions unless something material has changed (e.g., the app went multi-tenant, or user got Apple Developer license).
