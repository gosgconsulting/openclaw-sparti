/**
 * Shared design tokens for the OpenClaw wrapper UI.
 * Single source of truth for dark theme; used by dashboard, auth, onboard, lite (ui-page).
 * Mission Control keeps its own light theme but uses the same token names where possible.
 */

/** Dark theme :root CSS custom properties (canonical set from ui-page). */
export const darkThemeRoot = `
  :root {
    --bg: #12141a;
    --bg-accent: #14161d;
    --bg-elevated: #1a1d25;
    --bg-hover: #262a35;
    --card: #181b22;
    --card-foreground: #f4f4f5;
    --accent: #ff5c5c;
    --accent-hover: #ff7070;
    --accent-dark: #991b1b;
    --accent-subtle: rgba(255, 92, 92, 0.15);
    --accent-glow: rgba(255, 92, 92, 0.25);
    --teal: #14b8a6;
    --teal-bright: #00e5cc;
    --teal-glow: rgba(20, 184, 166, 0.4);
    --ok: #22c55e;
    --danger: #ef4444;
    --warn: #f59e0b;
    --text: #e4e4e7;
    --text-strong: #fafafa;
    --muted: #71717a;
    --muted-strong: #52525b;
    --border: #27272a;
    --border-strong: #3f3f46;
    --font-body: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-display: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.03);
    --duration-fast: 120ms;
    --duration-normal: 200ms;
  }
`;

/** Accessibility: focus-visible outline so keyboard users see focus; no duplicate outline on mouse click. */
export const focusVisibleStyles = `
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, [tabindex="0"]:focus-visible {
    outline: 2px solid var(--teal-bright, #00e5cc);
    outline-offset: 2px;
  }
  button:focus:not(:focus-visible), a:focus:not(:focus-visible) {
    outline: none;
  }
`;

/** Shared flash/toast: success (teal) and error (red); position bottom-right, aria-live for screen readers. */
export const flashStyles = `
  .flash { padding: 12px 20px; border-radius: var(--radius-md, 8px); font-size: 14px; }
  .flash.success { background: rgba(0, 229, 204, 0.12); border: 1px solid rgba(0, 229, 204, 0.35); color: var(--teal-bright, #00e5cc); }
  .flash.error { background: rgba(153, 27, 27, 0.2); border: 1px solid rgba(255, 92, 92, 0.35); color: #ff8a8a; }
`;

/**
 * Returns the full dark theme block to inject at the start of a page's <style>.
 * Includes :root and optional focus-visible + flash.
 */
export function getDarkThemeBlock({ focusVisible = true, flash = false } = {}) {
  let out = darkThemeRoot;
  if (focusVisible) out += focusVisibleStyles;
  if (flash) out += flashStyles;
  return out;
}
