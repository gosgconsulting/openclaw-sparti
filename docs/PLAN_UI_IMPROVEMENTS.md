# Step-by-step UI improvement plan

Plan for incremental UX/UI improvements across the OpenClaw wrapper: design system consolidation, best practices (including accessibility and audio-platform-friendly patterns), frontend changes, and optional database support for preferences.

**Roles:** (1) UX/UI designer — audit, best practices, design system; (2) Frontend — implement changes in page modules; (3) Database — only if persisting UI preferences.

---

## 1. UX/UI designer phase — audit and best practices

### 1.1 Design system audit (current state)

| Surface | File | Theme | Tokens | Fonts |
|--------|------|-------|--------|-------|
| **Dashboard** | `src/dashboard-page.js` | Dark (#0f1117 bg, teal/red accents) | Inline hex/rgba | Space Grotesk, JetBrains Mono |
| **Auth** | `src/auth-page.js` | Dark, gradient bg | Inline | Space Grotesk |
| **Mission Control** | `src/mission-control-page.js` | **Light** (#f8f9fa bg, #1971c2 accent) | CSS vars in `:root` | Inter |
| **Lite (gateway)** | `src/ui-page.js` | Dark | Full CSS vars (--bg, --teal, --accent, etc.) | Space Grotesk |
| **Onboard** | `src/onboard-page.js` | Mixed | Inline | Space Grotesk |

**Findings:**

- Two visual systems: **dark** (dashboard, auth, lite, onboard) vs **light** (Mission Control). No single source of truth for tokens.
- **ui-page.js** has the most complete token set (--bg, --teal, --accent, --border, --radius-*, --font-body, etc.); other pages use ad-hoc hex/rgba.
- Inconsistency: Mission Control uses Inter and light surfaces; rest uses Space Grotesk and dark. Navigation patterns differ (sidebar vs top tabs).

### 1.2 Best practices (SaaS / audio-platform alignment)

- **Information hierarchy:** Put the “North Star” metric or primary action in the top-left; use size, color, and spacing to guide the eye. Avoid clutter; use progressive disclosure (summaries first, details on demand). *Ref: SaaS dashboard design 2025–2026.*
- **Navigation:** Prefer collapsible left sidebar for multi-section apps (Mission Control already does this). Tabs for few sections (Dashboard Channels/Connectors) are fine.
- **Operational dashboards:** Emphasize “next best action” and clear CTAs. Empty states should explain what to do and link to the action (e.g. “Connect your first channel” with a button), not blank space.
- **Accessibility (mandatory):** Sufficient contrast (WCAG 2.1 AA), focus-visible styles, semantic HTML, `aria-label` / `aria-live` where needed. Data tables and forms screen-reader friendly. *Ref: SaaS UX best practices.*
- **Audio-platform / voice-friendly:** Clear headings and landmarks, predictable focus order, minimal visual noise so users relying on screen readers or voice control can complete tasks. Labels on all controls; status messages announced (e.g. “Connector linked successfully” as live region).
- **Dark mode:** Already dominant; document it as the default. If adding a theme toggle later, support light/dark/system and persist in DB or localStorage.

### 1.3 Design system to respect

- **Primary palette (dark):** Background #0f1117 / #12141a; surface/card #181b22–#1a1d25; text #e4e4e7, strong #fafafa; muted #a1a1aa / #71717a.
- **Accents:** Teal #00e5cc (success, links, primary actions); red/coral #ff5c5c (brand, destructive); blue for Mission Control if keeping light theme.
- **Borders:** rgba(255,255,255,0.08) or #27272a; radius 10–14px for cards, 8px for buttons/inputs.
- **Typography:** Space Grotesk body/display; JetBrains Mono for code/IDs. Inter only in Mission Control today — consider aligning to Space Grotesk for consistency or document “Mission Control = Inter” as intentional.
- **Motion:** Short transitions (120–200ms) for hover/focus; avoid distracting animation.

---

## 2. Frontend implementation plan (step-by-step)

### Step 1 — Shared design tokens (single source of truth)

- **Add** a small module or inline block that defines CSS custom properties for the **dark** theme (and optionally light) used by all pages.
- **Reuse** the token set from `ui-page.js` as the canonical list; optionally move it to a shared fragment (e.g. `src/design-tokens.js` exporting a string of `:root { ... }` or a `<style>` snippet) and inject it in dashboard, auth, lite, onboard. Mission Control can keep its light tokens but adopt the same *names* (--bg, --text, --accent, --border, --radius-sm/md/lg) so future theme switch is trivial.
- **No new routes.** Only new shared asset or string constant.

**Files to touch:** `src/dashboard-page.js`, `src/auth-page.js`, `src/onboard-page.js`, `src/ui-page.js` (refactor to consume shared tokens). Optionally `src/mission-control-page.js` (align variable names).

**Docs:** README “Design system” subsection: tokens live in X; dark default; Mission Control light variant.

---

### Step 2 — Accessibility (a11y) pass

- **Focus:** Add `:focus-visible` outlines (e.g. 2px solid var(--teal) or --accent) on buttons, links, inputs, tab triggers. Remove or soften `:focus` outline only where `:focus-visible` is used.
- **Semantics:** Ensure one `<h1>` per page; headings hierarchy (h1 → h2 → h3). Use `<main>`, `<nav>`, `<section>` where appropriate. Buttons for actions, links for navigation.
- **ARIA:** Add `aria-label` on icon-only buttons (e.g. “Menu”, “Close”, “Refresh”). Use `aria-live="polite"` for success/error toasts so screen readers announce “Connector linked successfully” and errors. Ensure tab panels have `role="tabpanel"` and `aria-labelledby` or `aria-label`.
- **Forms:** Associate every input with a `<label>` (id/for or wrap). Error messages linked with `aria-describedby` where applicable.

**Files:** All `*-page.js` that render HTML (dashboard, auth, mission-control, onboard, ui-page). Prefer minimal, targeted edits.

**Verification:** Keyboard-only navigation (Tab, Enter, Space); NVDA/VoiceOver on one critical flow (e.g. login → dashboard → Connectors).

---

### Step 3 — Empty states and loading states

- **Empty states:** Replace bare “No X” text with a short message + primary CTA where it makes sense (e.g. Connectors: “No accounts connected. Add your first account to get started.” + “Add account” button; Channels: “No channels configured” + link to save first channel).
- **Loading:** Use a single pattern (spinner or skeleton) for async content (connectors list, channel list, Mission Control panels). Ensure `aria-busy` or `aria-live` so assistive tech knows content is loading.

**Files:** `src/dashboard-page.js` (connectors, channels), `src/mission-control-page.js` (integrations, boards, etc.), `src/ui-page.js` if applicable.

---

### Step 4 — Visual consistency (buttons, cards, flashes)

- **Buttons:** Primary = filled accent (teal or red per page); secondary = outline or subtle bg. Same padding (e.g. 10px 14px), radius (8–10px), font-weight across dashboard, auth, Mission Control.
- **Cards:** Unified border (1px solid var(--border)), radius (12–14px), padding (16–20px). Same shadow or none.
- **Flashes / toasts:** Success = teal/green tint; error = red tint; same position (e.g. bottom-right), duration, and dismiss behavior. Use one class pattern (e.g. `.flash.success`, `.flash.error`) and shared styles from tokens.

**Files:** dashboard-page.js, mission-control-page.js, auth-page.js, ui-page.js. Reuse token-driven classes.

---

### Step 5 — Mission Control alignment (optional)

- Decide whether Mission Control stays **light** (Inter, #f8f9fa) as a deliberate “operations” look or switches to **dark** and Space Grotesk for consistency. If it stays light, document it and ensure token *names* match so a future theme switcher can flip values only.
- If switching to dark: replace Mission Control `:root` with the shared dark tokens; change font to Space Grotesk; adjust any hardcoded light colors.

**Files:** `src/mission-control-page.js` only.

---

## 3. Database changes (only if persisting UI preferences)

### When to add

- **Theme preference:** User chooses light / dark / system and we want it to persist across devices → need backend storage.
- **Sidebar state:** e.g. “Mission Control sidebar collapsed” persisted per user.

### Schema option (Supabase)

- **Option A — `user_preferences` table:**  
  `user_id` (uuid, FK auth.users), `key` (text), `value` (jsonb), unique (user_id, key).  
  RLS: user can read/insert/update own row.  
  Example: `key = 'ui'`, `value = { "theme": "dark" | "light" | "system", "sidebarCollapsed": false }`.
- **Option B — no DB:** Keep theme/sidebar in `localStorage` only. Simpler; no migration; preference is per-browser.

### Backend

- If Option A: add `GET /api/me/preferences` and `PUT /api/me/preferences` (requireUser(), read/upsert by user_id). Frontend calls these on load and on change.
- No new tables if Option B.

### Recommendation

- **Phase 1:** Implement theme/sidebar in **localStorage** only (no DB). Document in README.
- **Phase 2 (later):** If product requires cross-device UI prefs, add `user_preferences` and the two API routes; then have the frontend read from API and fall back to localStorage.

---

## 4. Execution order and docs

| Step | Description | Owner | Docs |
|------|-------------|--------|------|
| 1 | Shared design tokens | Frontend | README design system |
| 2 | Accessibility pass | Frontend | README a11y note |
| 3 | Empty + loading states | Frontend | — |
| 4 | Buttons, cards, flashes consistency | Frontend | — |
| 5 | Mission Control light vs dark decision | Frontend | README |
| 6 | (Optional) DB for UI preferences | Backend + Frontend | README env/schema |

**Duplicate / reuse:** Reuse existing *-page.js generators; do not add a new UI framework. Reuse existing auth and API patterns. No duplicate design token definitions after Step 1.

**Verification:** After each step: manual check affected pages; run existing tests; no new secrets in frontend. Optional: add one E2E or a11y smoke test for login → dashboard → Connectors.

---

## 5. Summary

- **UX/UI designer:** Audit done; design system and best practices (hierarchy, accessibility, audio-platform-friendly, empty states) documented above.
- **Frontend:** Five steps — tokens, a11y, empty/loading, visual consistency, Mission Control alignment. All in existing page modules.
- **Database:** Optional; recommend starting with localStorage for theme/sidebar; add `user_preferences` + API only if cross-device persistence is required.
