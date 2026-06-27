# Tailwind CSS v4 + Multi-Tenant Theme System

## Architecture Overview

```
app.css
  └── @import 'tailwindcss'
  └── @import '$lib/themes/base.css'       ← light defaults (46 tokens)
  └── @theme inline { ... }                ← bridge CSS vars → Tailwind utilities

Runtime loading:
  1. FOUC prevention: inline script reads localStorage cache → :root
  2. Brand Config API fetch → preset CSS loaded dynamically
  3. Config tokens applied to :root via setProperty()
  4. Optional advanced CSS from CDN injected
```

**Zero `tailwind.config.js`** — Tailwind v4 is config-free. All customization via CSS variables and `@theme`.

---

## Token System (46 Semantic Tokens)

### Color Tokens

```css
/* src/lib/themes/base.css — Light defaults */
:root {
  /* ── Brand / Interactive ── */
  --color-primary:            #1a73e8;
  --color-primary-hover:      #1557b0;
  --color-primary-subtle:     rgba(26, 115, 232, 0.12);
  --color-primary-foreground: #ffffff;
  --color-secondary:          #f1f3f4;
  --color-secondary-hover:    #e8eaed;
  --color-secondary-foreground: #202124;
  --color-accent:             #fbbc04;
  --color-accent-foreground:  #202124;

  /* ── Surfaces ── */
  --color-background:         #ffffff;
  --color-surface:            #f8f9fa;
  --color-surface-raised:     #ffffff;
  --color-surface-overlay:    rgba(32, 33, 36, 0.5);
  --color-border:             #dadce0;
  --color-border-strong:      #9aa0a6;

  /* ── Text ── */
  --color-text-primary:       #202124;
  --color-text-secondary:     #5f6368;
  --color-text-disabled:      #9aa0a6;
  --color-text-inverse:       #ffffff;
  --color-text-link:          #1a73e8;

  /* ── Status ── */
  --color-success:            #34a853;
  --color-success-bg:         rgba(52, 168, 83, 0.1);
  --color-warning:            #f9ab00;
  --color-warning-bg:         rgba(249, 171, 0, 0.1);
  --color-danger:             #ea4335;
  --color-danger-bg:          rgba(234, 67, 53, 0.1);
  --color-info:               #4285f4;
  --color-info-bg:            rgba(66, 133, 244, 0.1);

  /* ── Sidebar ── */
  --color-sidebar-bg:         #202124;
  --color-sidebar-text:       #e8eaed;
  --color-sidebar-text-active:#ffffff;
  --color-sidebar-active-bg:  rgba(26, 115, 232, 0.2);

  /* ── Domain-specific ── */
  --color-audit:              #1a3a5c;
  --color-pending:            #e67e22;
  --color-rejected:           #c0392b;
}
```

### Scale Tokens (hardcoded — not runtime-swappable)

```css
:root {
  /* Typography */
  --font-sans:   -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono:   'SF Mono', 'Fira Code', ui-monospace, monospace;
  --font-size-xs:   0.75rem;   /* 12px */
  --font-size-sm:   0.875rem;  /* 14px */
  --font-size-base: 1rem;      /* 16px */
  --font-size-lg:   1.125rem;  /* 18px */
  --font-size-xl:   1.25rem;   /* 20px */
  --font-size-2xl:  1.5rem;    /* 24px */
  --font-size-3xl:  1.875rem;  /* 30px */

  /* Spacing */
  --spacing-xs:  0.25rem;  --spacing-sm:  0.5rem;
  --spacing-md:  1rem;     --spacing-lg:  1.5rem;
  --spacing-xl:  2rem;     --spacing-2xl: 3rem;

  /* Radius */
  --radius-sm: 0.25rem;  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Z-index layers */
  --z-dropdown: 900;   --z-modal: 1000;
  --z-toast: 1100;     --z-tooltip: 1200;

  /* Transitions */
  --transition-fast: 100ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms ease;
}
```

---

## Tailwind v4 Bridge (`src/app.css`)

```css
@import 'tailwindcss';
@import '$lib/themes/base.css';

/* Bridge: CSS vars → Tailwind utility classes */
/* bg-primary → background-color: var(--color-primary) */
@theme inline {
  /* Colors */
  --color-primary:           var(--color-primary);
  --color-primary-hover:     var(--color-primary-hover);
  --color-primary-subtle:    var(--color-primary-subtle);
  --color-secondary:         var(--color-secondary);
  --color-accent:            var(--color-accent);
  --color-background:        var(--color-background);
  --color-surface:           var(--color-surface);
  --color-surface-raised:    var(--color-surface-raised);
  --color-border:            var(--color-border);
  --color-border-strong:     var(--color-border-strong);
  --color-text-primary:      var(--color-text-primary);
  --color-text-secondary:    var(--color-text-secondary);
  --color-text-disabled:     var(--color-text-disabled);
  --color-text-inverse:      var(--color-text-inverse);
  --color-text-link:         var(--color-text-link);
  --color-success:           var(--color-success);
  --color-success-bg:        var(--color-success-bg);
  --color-warning:           var(--color-warning);
  --color-warning-bg:        var(--color-warning-bg);
  --color-danger:            var(--color-danger);
  --color-danger-bg:         var(--color-danger-bg);
  --color-info:              var(--color-info);
  --color-info-bg:           var(--color-info-bg);
  --color-sidebar-bg:        var(--color-sidebar-bg);
  --color-sidebar-text:      var(--color-sidebar-text);
  --color-sidebar-active-bg: var(--color-sidebar-active-bg);

  /* Typography */
  --font-family-sans:  var(--font-sans);
  --font-family-mono:  var(--font-mono);

  /* Radius */
  --radius-sm:   var(--radius-sm);
  --radius-md:   var(--radius-md);
  --radius-lg:   var(--radius-lg);
  --radius-xl:   var(--radius-xl);
  --radius-full: var(--radius-full);
}

/* Global interactive element defaults */
button, [role="button"], summary, label[for], select {
  cursor: pointer;
}

/* PWA safe area */
:root {
  --safe-area-inset-top:    env(safe-area-inset-top);
  --safe-area-inset-bottom: env(safe-area-inset-bottom);
}
```

---

## Dark Mode

### base.dark.css (surface/text overrides only)

```css
/* src/lib/themes/base.dark.css */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background:      #0f172a;
    --color-surface:         #1e293b;
    --color-surface-raised:  #293548;
    --color-surface-overlay: rgba(0, 0, 0, 0.6);
    --color-border:          #334155;
    --color-border-strong:   #475569;
    --color-text-primary:    #f1f5f9;
    --color-text-secondary:  #94a3b8;
    --color-text-disabled:   #64748b;
    --color-text-inverse:    #0f172a;
    --color-text-link:       #60a5fa;
    --color-sidebar-bg:      #0f172a;
    --color-sidebar-text:    #cbd5e1;
    --color-audit:           #7dd3fc;
  }
}
```

### Preset dark variant pattern

```css
/* src/lib/themes/presets/professional-blue.dark.css */
@import '../base.css';                    /* 1. Light defaults */
@import './professional-blue.css';        /* 2. Light brand */
@import '../base.dark.css';              /* 3. Dark surfaces/text */

/* 4. Dark brand — lighter primary for dark backgrounds */
@media (prefers-color-scheme: dark) {
  :root {
    --color-primary:         #3b82f6;   /* Lighter blue for dark bg */
    --color-primary-hover:   #2563eb;
    --color-primary-subtle:  rgba(59, 130, 246, 0.15);
  }
}
```

### Manual dark mode toggle (class-based)

```typescript
// When user explicitly toggles, not just system preference:
function applyDarkMode(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem('color-scheme', dark ? 'dark' : 'light');
}
```

```css
/* In base.css: support both class and media query */
@media (prefers-color-scheme: dark) {
  :root:not(.light) { /* dark overrides */ }
}
.dark { /* same dark overrides */ }
```

---

## Theme Preset Files

```css
/* src/lib/themes/presets/professional-blue.css */
/* Overrides only brand colors — inherits all 46 base tokens */
:root {
  --color-primary:            #005bac;
  --color-primary-hover:      #004a8f;
  --color-primary-subtle:     rgba(0, 91, 172, 0.1);
  --color-primary-foreground: #ffffff;
  --color-sidebar-bg:         #003366;
  --color-sidebar-active-bg:  rgba(0, 91, 172, 0.3);
}
```

### Available preset names

| Preset | Primary | Use case |
|---|---|---|
| `professional-blue` | `#005bac` | Finance, B2B, enterprise |
| `merchant-green` | `#2e7d32` | Retail, marketplace |
| `energy-orange` | `#e65100` | Logistics, delivery |
| `healthcare-teal` | `#00695c` | Medical, wellness |
| `minimal-dark` | `#ffffff` | Dark sidebar neutral |
| `brand-purple` | `#6200ea` | Tech, SaaS |

---

## Runtime Theme Loader

```typescript
// src/lib/brand/theme-loader.ts

// Preset CSS lazy imports (only loads what's needed)
const presetImports: Record<string, () => Promise<void>> = {
  'professional-blue':      () => import('$lib/themes/presets/professional-blue.css'),
  'professional-blue.dark': () => import('$lib/themes/presets/professional-blue.dark.css'),
  'merchant-green':         () => import('$lib/themes/presets/merchant-green.css'),
  'minimal-dark':           () => import('$lib/themes/presets/minimal-dark.css'),
};

const CSS_VAR_PATTERN = /^--[\w-]+$/;
const SAFE_VALUE_PATTERN = /^[a-zA-Z0-9#()\s.,%-]+$/;  // Prevent CSS injection

export async function loadTheme(
  preset: string,
  tokens?: Record<string, string>,
  cssUrl?: string | null,
): Promise<void> {
  // 1. Load preset CSS
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const presetKey = isDark && presetImports[`${preset}.dark`]
    ? `${preset}.dark`
    : preset;

  const loader = presetImports[presetKey] ?? presetImports['professional-blue'];
  await loader();

  // 2. Apply config token overrides
  if (tokens) {
    applyTokens(tokens);
    cacheTokens(tokens);  // Prevent FOUC on reload
  }

  // 3. Inject optional advanced CSS from CDN (security-gated)
  if (cssUrl) await injectAdvancedCss(cssUrl);
}

export function applyTokens(tokens: Record<string, string>): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    if (!CSS_VAR_PATTERN.test(key)) continue;           // Reject invalid var names
    if (!SAFE_VALUE_PATTERN.test(value)) continue;      // Reject CSS injection attempts
    root.style.setProperty(key, value);
  }
}

async function injectAdvancedCss(url: string): Promise<void> {
  // Security gates
  if (!url.startsWith('https://cdn.')) return;          // Trusted CDN only
  
  const res = await fetch(url);
  const css = await res.text();
  
  if (css.length > 200_000) return;                     // 200KB max
  if (/url\s*\(/i.test(css)) return;                    // No url() — data exfiltration risk
  if (/<\s*script/i.test(css)) return;                  // No <script> injection
  
  const style = document.createElement('style');
  style.id = 'brand-theme-css';
  style.textContent = css;
  document.getElementById('brand-theme-css')?.remove();
  document.head.appendChild(style);
}

function cacheTokens(tokens: Record<string, string>): void {
  try { localStorage.setItem('brand-tokens-2-0', JSON.stringify(tokens)); }
  catch { /* quota exceeded */ }
}
```

---

## FOUC Prevention (app.html)

```html
<!-- src/app.html -->
<!doctype html>
<html lang="%sveltekit.lang%">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="%sveltekit.assets%/favicon.png" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <!-- Prevent Flash of Unstyled Content: apply cached tokens before first paint -->
  <script>
    try {
      var cached = localStorage.getItem('brand-tokens-2-0');
      if (cached) {
        var tokens = JSON.parse(cached);
        var root = document.documentElement;
        var varPattern = /^--[\w-]+$/;
        Object.entries(tokens).forEach(function(entry) {
          if (varPattern.test(entry[0])) root.style.setProperty(entry[0], entry[1]);
        });
      }
    } catch (e) {}
  </script>

  %sveltekit.head%
</head>
<body data-sveltekit-preload-data="hover">
  <div style="display: contents">%sveltekit.body%</div>
</body>
</html>
```

---

## Brand Config API Pattern

```typescript
// src/lib/brand/brand-config.ts
interface BrandConfig {
  version: string;               // "2.3" — major version checked (ADR-44)
  allowedOrigins: string[];      // Domains allowed to load this config
  tokens: Record<string, string>; // CSS variable overrides
  themeCssUrl: string | null;    // Optional CDN CSS URL
  logoUrl: string;
  currencies: CurrencyConfig[];
  sessionIdleTimeout: Record<string, number>;
  features: Record<string, boolean>;
  statusPageUrl: string;
}

const BRAND_CONFIG_URL = '/.well-known/brand-config.json';
const CURRENT_MAJOR_VERSION = 2;

export async function fetchBrandConfig(): ResultAsync<BrandConfig, BrandConfigError> {
  // Exponential backoff: 1s → 2s → 4s
  for (let i = 0; i < 3; i++) {
    const timeout = 1000 * 2 ** i;
    const result = await httpGetWithTimeout<BrandConfig>(BRAND_CONFIG_URL, timeout);
    if (result.isOk()) {
      const config = result.value;
      // ADR-44: reject incompatible major versions
      const [major] = config.version.split('.').map(Number);
      if (major !== CURRENT_MAJOR_VERSION) {
        return err({ type: 'brand-config', reason: 'version-mismatch', message: config.version });
      }
      return ok(config);
    }
    if (i < 2) await sleep(1000 * 2 ** i);
  }
  return err({ type: 'brand-config', reason: 'network', message: 'All retries failed' });
}
```

---

## Component Usage Rules

```svelte
<!-- ✅ Use semantic token utilities (runtime-themeable) -->
<div class="bg-background text-text-primary border border-border">
<button class="bg-primary text-primary-foreground hover:bg-primary-hover">
<span class="text-danger bg-danger-bg">Error</span>

<!-- ✅ Conditional with cn() -->
<div class={cn(
  'rounded-md p-4 transition',
  isActive && 'bg-primary text-primary-foreground',
  isDisabled && 'opacity-50 cursor-not-allowed',
  className
)}>

<!-- ❌ Hardcoded hex/named colors (not runtime-themeable) -->
<div class="bg-blue-600 text-white">        <!-- breaks theming -->
<div class="bg-[#005bac]">                  <!-- breaks theming -->
<div style="background: #005bac">           <!-- breaks theming -->

<!-- ✅ Exception: one-off structural values that are never branded -->
<div class="w-64 h-screen">               <!-- layout, not brand -->
<span class="opacity-50">                 <!-- state, not brand -->
```

### When hardcoded colors ARE acceptable

- Layout/spacing: `w-full`, `h-screen`, `gap-4`, `p-3`
- Neutral grays for loading states: `bg-gray-100`, `bg-slate-200`
- Opacity modifiers: `opacity-50`, `opacity-0`
- Structural values: `z-50`, `translate-x-full`

---

## Theme Switcher Component

```svelte
<!-- src/lib/components/ThemeSwitcher.svelte -->
<script lang="ts">
  import { loadTheme } from '$lib/brand/theme-loader';

  const PRESETS = [
    { id: 'professional-blue', label: 'Professional Blue', color: '#005bac' },
    { id: 'merchant-green',    label: 'Merchant Green',   color: '#2e7d32' },
    { id: 'energy-orange',     label: 'Energy Orange',    color: '#e65100' },
    { id: 'healthcare-teal',   label: 'Healthcare Teal',  color: '#00695c' },
    { id: 'brand-purple',      label: 'Brand Purple',     color: '#6200ea' },
  ];

  let active = $state('professional-blue');
  let loading = $state(false);

  async function switchTheme(preset: string) {
    if (loading || active === preset) return;
    loading = true;
    await loadTheme(preset);
    active = preset;
    localStorage.setItem('active-preset', preset);
    loading = false;
  }
</script>

<div class="flex gap-2 flex-wrap">
  {#each PRESETS as p}
    <button
      onclick={() => switchTheme(p.id)}
      class={cn(
        'w-8 h-8 rounded-full border-2 transition-transform hover:scale-110',
        active === p.id ? 'border-text-primary scale-110' : 'border-transparent'
      )}
      style="background-color: {p.color}"
      title={p.label}
      aria-label="Switch to {p.label}"
    ></button>
  {/each}
</div>
```

---

## Tailwind v4 Constraints & Gotchas

| Constraint | Detail |
|---|---|
| No `tailwind.config.js` | All config via CSS — `@theme`, `@layer`, `@utility` |
| No JIT arbitrary `bg-[#hex]` for brand | Use CSS vars instead — `bg-primary` |
| `@theme inline` required | Without `inline`, values are hardcoded not referenced |
| Dark mode default | `@media (prefers-color-scheme: dark)` — NOT class-based |
| `dark:` prefix | Works if `@variant dark` is configured |
| No `extend` key | Use `@theme` to add new tokens |
| Preset CSS order matters | Last `@import` wins — cascade is intentional |
| Vite only | `@tailwindcss/vite` required, not PostCSS plugin |
