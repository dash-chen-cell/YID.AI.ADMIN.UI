---
name: frontend-svelte-ts-tailwind
description: >
  Use this skill for ALL frontend tasks in YID projects: creating pages, components,
  stores, API clients, forms, i18n, or Docker builds using SvelteKit 2 + Svelte 5 runes
  + TypeScript 5 strict + Tailwind CSS 4 + bits-ui. Trigger on any Svelte/SvelteKit file
  creation or modification, frontend architecture questions, or CSR build setup.
  Do NOT use for backend Python/C# work or pure CSS-only changes. Includes the
  three-tier loading UX (skeleton / section / global bar) and the API silent flag.
version: "1.2"
updated: "2026-06-07"
sources:
  - YID.TRANSACTION.COLLECTION.CASHIER
  - YID.TRANSACTION.MERCHANT.ADMIN
  - YID.TRANSACTION.CUSTOMER.ADMIN
---

# YID Frontend Skill — Svelte 5 + TypeScript + Tailwind CSS 4

## Stack Versions

| Package | Version | Notes |
|---|---|---|
| Svelte | 5.x | Runes API — `$state`, `$derived`, `$effect`, `$props`, `$bindable` |
| SvelteKit | 2.x | `adapter-static` for CSR builds |
| TypeScript | 5.x | `strict: true`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` |
| Tailwind CSS | 4.x | `@tailwindcss/vite` plugin, `@theme inline` for CSS variable tokens |
| bits-ui | 2.x | Headless unstyled components |
| neverthrow | 8.x | Type-safe error handling — `ResultAsync<T, E>` |
| Valibot | 1.4.x | Runtime schema validation for API responses |
| Paraglide JS | 2.15.x | i18n — cookie-first locale strategy |

---

## Project Structure

```
src/
├── lib/
│   ├── api/              # HTTP client, contracts, schemas, adapters
│   ├── components/       # Reusable .svelte UI components
│   │   └── ui/           # bits-ui wrappers (Badge, Dialog, Button...)
│   ├── stores/           # Svelte stores and rune-based state classes
│   ├── adapters/         # QueryAdapter class for async data fetching
│   ├── services/         # Pure TypeScript services (audit, theme, etc.)
│   ├── types/            # TypeScript interfaces and discriminated unions
│   ├── errors/           # AppError discriminated union
│   ├── i18n/             # Paraglide integration, locale helpers
│   ├── themes/           # CSS variable theme loader
│   └── utils/            # cn(), common helpers
├── routes/
│   ├── +layout.svelte    # Root layout — auth guard, brand init, MSW
│   ├── login/
│   │   └── +page.svelte
│   └── (protected)/      # Route group requiring auth
│       ├── +layout.svelte
│       └── dashboard/
│           └── +page.svelte
└── app.css               # @import 'tailwindcss'; theme tokens
```

---

## Core Conventions

### 1. Component Props — Always Typed

```typescript
// Preferred: inline type alias
type Props = {
  title: string;
  onClose?: () => void;
  class?: string;
};
let { title, onClose, class: className }: Props = $props();

// Two-way binding
let { open = $bindable(false) }: Props = $props();
```

- Use `interface` when extending; use `type` otherwise
- No `I` prefix on interfaces
- Callback props: `on<Event>: () => void` naming

### 2. Reactive State — Svelte 5 Runes Only

```typescript
let count = $state(0);
let double = $derived(count * 2);
let errorMsg = $state<string | null>(null);

$effect(() => {
  localStorage.setItem('key', String(count));
});
```

Never use Svelte 4 `$: reactive` syntax in new code.

### 3. Template Rendering

```svelte
<!-- Svelte 5: use {@render} not <slot> -->
<script lang="ts">
  let { children } = $props();
</script>
{@render children?.()}
```

### 4. CSS — Semantic Tokens + cn()

**Rule: Never use hardcoded colors.** Always use semantic token utilities so themes work at runtime.

```svelte
<!-- ✅ Semantic — runtime-themeable -->
<div class="bg-background text-text-primary border border-border">
<button class="bg-primary text-primary-foreground hover:bg-primary-hover">
<span class="text-danger bg-danger-bg">Error</span>

<!-- ❌ Hardcoded — breaks all themes -->
<div class="bg-blue-600 text-white">
<div class="bg-[#005bac]">
```

```typescript
// src/lib/utils/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Usage
<div class={cn('flex items-center gap-2', isActive && 'bg-primary-subtle', className)}>
```

Hardcoded values are only acceptable for layout/spacing (`w-full`, `gap-4`, `p-3`) and state modifiers (`opacity-50`).

### 5. Naming

| Item | Convention | Example |
|---|---|---|
| Component files | PascalCase | `StatusBadge.svelte` |
| Store files | camelCase + `.store.svelte.ts` | `brand.store.svelte.ts` |
| Types/Interfaces | PascalCase | `AuthUser`, `BrandConfig` |
| Constants | UPPER_SNAKE_CASE | `BUSINESS_CODE`, `SESSION_KEY` |
| Functions | camelCase | `fetchConfig()`, `handleSubmit()` |
| Private class fields | `#prefixed` | `#config = $state(...)` |

---

## API & Error Handling

### AppError Discriminated Union

All API errors flow through `AppError`. Never throw raw errors.

```typescript
// src/lib/errors/app-error.ts
export type AppError =
  | { type: 'api'; status: '4xx' | '5xx' | 'network'; message: string; code?: string }
  | { type: 'auth'; reason: 'expired' | 'invalid' | 'mfa-required' }
  | { type: 'brand-config'; reason: BrandConfigErrorReason; message: string };
```

### ResultAsync Pattern

```typescript
import { ok, err, type ResultAsync } from 'neverthrow';

async function fetchOrders(): ResultAsync<Order[], AppError> {
  try {
    const res = await fetch('/api/orders', { headers: authHeaders() });
    if (!res.ok) return err(mapStatusToAppError(res.status, await res.text()));
    return ok(await res.json() as Order[]);
  } catch (e) {
    return err({ type: 'api', status: 'network', message: String(e) });
  }
}

// Usage — always .match(), never try-catch around ResultAsync
const result = await fetchOrders();
result.match(
  (orders) => { data = orders; },
  (error) => {
    if (error.type === 'auth') goto('/login');
    else errorMsg = t['error.generic']();
  }
);
```

### QueryAdapter — Async Data with Stale-Result Guard

```typescript
// src/lib/adapters/query-adapter.svelte.ts
export class QueryAdapter<T> {
  data = $state<T | null>(null);
  loading = $state(false);
  error = $state<AppError | null>(null);

  #seq = 0;

  async fetch(fetcher: () => ResultAsync<T, AppError>): Promise<void> {
    const seq = ++this.#seq;
    this.loading = true;
    this.error = null;
    const result = await fetcher();
    if (seq !== this.#seq) return; // discard stale
    result.match(
      (d) => { this.data = d; },
      (e) => { this.error = e; }
    );
    this.loading = false;
  }
}
```

See → [references/api-patterns.md](references/api-patterns.md) for full HTTP client implementation.

---

## Forms

```typescript
// Always: event.preventDefault() + double-submit guard
async function handleSubmit(event: Event) {
  event.preventDefault();
  if (isLoading || !canSubmit) return;   // double-submit guard
  isLoading = true;
  errorMsg = null;

  const result = await sendOne<ResponseType>(
    'kit', 'action', payload,
    { retries: 0 }  // Non-idempotent ops ALWAYS retries: 0
  );

  result.match(
    () => { isLoading = false; successMsg = m['action.success'](); },
    (error) => {
      isLoading = false;
      // Map to user-facing message — never expose raw server errors
      errorMsg = mapErrorToMessage(error);
    }
  );
}
```

**Validation** — use `$derived` for real-time rules:
```typescript
const rules = $derived({
  minLength: password.length >= 12,
  hasUpper:  /[A-Z]/.test(password),
  hasDigit:  /\d/.test(password),
  hasSpecial: /[!@#$%^&*]/.test(password),
});
const canSubmit = $derived(Object.values(rules).every(Boolean) && !isLoading);
```

---

## State Management

### Class-based Singleton (preferred for complex state)

```typescript
// src/lib/stores/config.store.svelte.ts
class ConfigStore {
  #config = $state<Config | null>(null);
  #promise: Promise<void> | null = null;

  get config(): Config {
    if (!this.#config) throw new Error('Config not loaded');
    return this.#config;
  }
  get isReady() { return this.#config !== null; }

  async init(): Promise<void> {
    if (this.#promise) return this.#promise;
    this.#promise = this.#load();
    return this.#promise;
  }

  async #load(): Promise<void> {
    const result = await fetchConfig();
    result.match(
      (c) => { this.#config = c; },
      (e) => { this.#promise = null; throw e; }
    );
  }
}
export const configStore = new ConfigStore();
```

### Writable + Derived (simple state)

```typescript
export const authUser = writable<AuthUser | null>(getInitialUser());
export const isAuthenticated = derived(authUser, ($u) =>
  $u !== null && new Date($u.tokenExpiresAt) > new Date()
);
```

See → [references/state-patterns.md](references/state-patterns.md)

---

## i18n

Use **Paraglide JS v2** with cookie-first locale strategy.

```typescript
// vite.config.ts
paraglideVitePlugin({
  project: './project.inlang',
  outdir: './src/lib/paraglide',
  strategy: ['cookie', 'globalVariable', 'baseLocale']
})

// Component usage
import * as m from '$lib/paraglide/messages';
<span>{m['dashboard.title']()}</span>

// Locale switching
import { setLocale } from '$lib/paraglide/runtime';
import { setLangCookie } from '$lib/i18n/paraglide';
setLocale(locale);
setLangCookie(locale);
```

Supported locales: `en`, `zh-TW`, `zh-CN`
Detection order: cookie → `navigator.language` → `en`

See → [references/i18n.md](references/i18n.md)

---

## Docker Build

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine AS server
USER nginx
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
```

nginx must include SPA fallback:
```nginx
location / {
    try_files $uri $uri/ /200.html;
}
```

See → [references/docker-nginx.md](references/docker-nginx.md)

---

## Anti-Patterns

| ❌ Avoid | ✅ Instead |
|---|---|
| `{@html untrusted}` | Escape or sanitize first |
| `try-catch` around `ResultAsync` | Use `.match()` |
| `on:click` inline handlers | Named function |
| Svelte 4 `$: reactive` | Svelte 5 `$derived` |
| `localStorage` in components | Store subscriber |
| Raw server error in UI | Map to i18n key |
| `any` type | Generic or discriminated union |
| Retrying financial mutations | `{ retries: 0 }` |
| `<slot />` | `{@render children?.()}` |
| Tailwind string concat | `cn()` helper |

---

## Multi-Tenant Theme System

Runtime theming — no rebuild needed. CSS variables cascade through Tailwind utilities.

```
base.css (46 tokens, light)
  ↑ preset/professional-blue.css (brand color overrides)
    ↑ applyTokens(brandConfig.tokens)  ← runtime per-tenant overrides
      ↑ injectAdvancedCss(cdnUrl)       ← optional S3 CSS
```

```typescript
// Boot sequence (root +layout.svelte)
onMount(async () => {
  const config = await fetchBrandConfig();       // /.well-known/brand-config.json
  await loadTheme(config.themePreset, config.tokens, config.themeCssUrl);
  ready = true;
});
```

See → [references/tailwind-theme.md](references/tailwind-theme.md) for complete token list, dark mode, preset pattern, FOUC prevention, and security rules.

---

## Anti-Patterns

| ❌ Avoid | ✅ Instead |
|---|---|
| `bg-blue-600`, `bg-[#hex]` | `bg-primary`, `bg-surface` (semantic tokens) |
| `{@html untrusted}` | Escape or sanitize first |
| `try-catch` around `ResultAsync` | Use `.match()` |
| `on:click` inline handlers | Named function |
| Svelte 4 `$: reactive` | Svelte 5 `$derived` |
| `localStorage` in components | Store subscriber |
| Raw server error in UI | Map to i18n key |
| `any` type | Generic or discriminated union |
| Retrying financial mutations | `{ retries: 0 }` |
| `<slot />` | `{@render children?.()}` |
| Tailwind string concat | `cn()` helper |
| `tailwind.config.js` | Pure CSS with `@theme` |

---

## Admin UI UX Patterns (YID-specific)

### Virtual Scroll for Large Lists

For audit logs and any list > 200 rows, use virtual scroll with `ResizeObserver`:

```svelte
<script lang="ts">
  const ROW_HEIGHT = 48;
  const OVERSCAN = 5;
  let containerEl = $state<HTMLDivElement | null>(null);
  let scrollTop = $state(0);
  let containerHeight = $state(600);

  const visibleRange = $derived(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(rows.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
    return { start, end };
  });

  onMount(() => {
    if (containerEl) {
      const ro = new ResizeObserver(e => { containerHeight = e[0].contentRect.height; });
      ro.observe(containerEl);
      return () => ro.disconnect();
    }
  });
</script>

<div bind:this={containerEl} onscroll={e => scrollTop = e.currentTarget.scrollTop}
     class="overflow-y-auto" style="height: min(600px, calc(100vh - 320px))">
  <div style="height: {rows.length * ROW_HEIGHT}px; position: relative;">
    <table style="position: absolute; top: {visibleRange().start * ROW_HEIGHT}px">
      <tbody>
        {#each rows.slice(visibleRange().start, visibleRange().end) as row (row.id)}
          <tr style="height: {ROW_HEIGHT}px">...</tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
```

### JSON Detail Modal with Line Numbers

For expandable detail views (audit log, API responses), use a modal with line-number gutter instead of inline expansion:

```svelte
<script lang="ts">
  let detailItem = $state<Item | null>(null);

  function prettyJson(raw: string | null): string {
    if (!raw) return '';
    try { return JSON.stringify(JSON.parse(raw), null, 2); }
    catch { return raw; }
  }
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && (detailItem = null)} />

{#if detailItem}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
     onclick={() => detailItem = null}>
  <div class="w-full max-w-2xl rounded-xl border border-border bg-surface shadow-2xl"
       onclick={e => e.stopPropagation()}>
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-border px-5 py-3.5">
      <span class="font-mono text-sm font-semibold text-text-primary">{detailItem.title}</span>
      <button onclick={() => detailItem = null}><X size={16} /></button>
    </div>
    <!-- JSON viewer with line numbers -->
    <div class="overflow-auto max-h-[70vh] rounded-b-xl">
      {@const lines = prettyJson(detailItem.details).split('\n')}
      <div class="flex font-mono text-xs">
        <div class="select-none border-r border-border bg-background px-3 py-4
                    text-right text-text-disabled leading-5 shrink-0">
          {#each lines as _, i}<div>{i + 1}</div>{/each}
        </div>
        <pre class="flex-1 overflow-x-auto px-4 py-4 text-text-secondary leading-5 bg-background">{prettyJson(detailItem.details)}</pre>
      </div>
    </div>
  </div>
</div>
{/if}
```

### Combobox Autocomplete

For filterable dropdowns (event type filter, user search):

```svelte
<script lang="ts">
  let value = $state('');
  let showSuggestions = $state(false);
  const suggestions = $derived(
    value.trim() ? allOptions.filter(o => o.includes(value.toLowerCase())) : allOptions
  );
</script>

<div class="relative">
  <input bind:value onfocus={() => showSuggestions = true}
         onblur={() => setTimeout(() => showSuggestions = false, 150)} />
  {#if showSuggestions && suggestions.length > 0}
  <div class="absolute left-0 top-full z-20 mt-1 w-full rounded-md border border-border bg-surface shadow-lg">
    {#each suggestions as opt}
    <button type="button" onmousedown={() => { value = opt; showSuggestions = false; }}
            class="w-full px-3 py-2 text-left text-xs hover:bg-surface-raised">
      {opt}
    </button>
    {/each}
  </div>
  {/if}
</div>
```

### Responsive Two-Column Layout

For forms with a side panel (e.g., send form + mobile setup instructions):

```svelte
<!-- Desktop: 2 columns, Mobile: stacked -->
<div class="grid gap-6 lg:grid-cols-2">
  <div><!-- Main content / form --></div>
  <div class="rounded-xl border border-border bg-surface p-5 h-fit">
    <!-- Side panel: instructions, preview, help text -->
  </div>
</div>
```

### Card Grid for Item Management

Prefer card grid over table for skill/model/type management (better responsiveness):

```svelte
<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
  {#each items as item}
  <div class="rounded-xl border border-border bg-surface p-4 space-y-2.5">
    <!-- Item card -->
  </div>
  {/each}
</div>
```

Use table only when column comparison matters (tokens, audit log, device list).

### Setup Wizard Smart Skip

When showing a multi-step wizard on an existing system, detect current state server-side and auto-mark completed steps:

```svelte
onMount(async () => {
  const res = await fetch('/api/setup/status');
  const data = await res.json();
  // Auto-mark detected steps as done
  steps = steps.map(s => ({
    ...s,
    status: detectedMap[s.id]?.detected ? 'done' : 'pending'
  }));
  // Show skip button if all steps detected done
});
```

High-risk steps (e.g., SSO reconfiguration) should show a force-rerun checkbox, not auto-skip:

```svelte
{#if step.risk === 'high' && step.status === 'done' && !installing}
<label class="flex items-center gap-1.5 mt-1 cursor-pointer">
  <input type="checkbox" onclick={e => e.stopPropagation()}
         onchange={() => toggleForceRerun(step.id)} class="accent-warning" />
  <span class="text-xs text-warning">強制重跑（有風險）</span>
</label>
{/if}
```

### Loading UX — three tiers (REQUIRED for all data views)

Never leave a blank screen or use a single spinner for everything. Match the
loading indicator to the scope of what's loading:

| Tier | When | Indicator |
|------|------|-----------|
| **Page-first-load** | Route mounts, fetching its primary data | **Skeleton** mirroring the real layout (`SkeletonCard` grid / `SkeletonTable`) |
| **Section reload** | Tab switch, refreshing one card/region | Section-local skeleton or `Spinner` in that region |
| **Action / background** | Save/delete button, secondary fetch (spend, health) | Inline button `Spinner`; global top progress bar for background |

Components in `$lib/components/ui/`: `Skeleton` (base block), `SkeletonCard`
(`lines` prop), `SkeletonTable` (`rows`/`cols`), `Spinner` (`size`).

**Skeleton must mirror the real shape** — table page → `<SkeletonTable cols={N}>`
with N = actual column count; card grid → `<SkeletonCard>` grid matching the real
grid columns. A skeleton that doesn't match the content is worse than none.

```svelte
<!-- Page-first-load: table page -->
{#if loading}
  <SkeletonTable rows={8} cols={7} />
{:else if rows.length === 0}
  <EmptyState />
{:else}
  <table>...</table>
{/if}
```

### Global loading bar + the silent flag

`$lib/stores/loading.ts` drives a top progress bar with **debounce + min-visible**:
- A request resolving in **< 0.5s shows nothing** (no flicker).
- Still pending at 0.5s → bar appears and stays **≥ 1s** (no flash).

The API client calls `beginRequest`/`endRequest` automatically. **Pass
`{ silent: true }` on a request when the caller renders its own loading UI**
(page skeleton or section spinner) so it doesn't ALSO trigger the global bar:

```ts
// Page-first-load: page shows skeleton → suppress global bar
const r = await apiGet<User[]>('/users', { silent: true });
// Background/secondary (spend, health): let the global bar show
const s = await apiGet('/departments/spend');   // not silent
```

Rule of thumb: **primary page/section loads → silent** (they own a skeleton);
**actions and background fetches → not silent** (global bar is the only feedback).

### Never block a list on a slow secondary call

If a list needs enrichment from a slow/unreliable upstream (e.g. LiteLLM spend),
load the list first (fast, from local DB) and fetch enrichment separately. Show
the enrichment cell as "載入中…" until it arrives. Don't make the whole list wait
on a per-row upstream call — and never loop those calls sequentially (use
`asyncio.gather` server-side, or one batched endpoint).

---

## References

- [Tailwind & Theme System](references/tailwind-theme.md) — Token system, dark mode, multi-tenant, FOUC, Brand Config API
- [API Patterns](references/api-patterns.md) — HTTP client, error mapping, retry logic
- [State Patterns](references/state-patterns.md) — Store patterns, auth, brand config
- [Component Patterns](references/component-patterns.md) — bits-ui, StatusBadge, forms
- [i18n](references/i18n.md) — Paraglide setup, locale detection, cookie switching
- [Docker & nginx](references/docker-nginx.md) — Multi-stage build, SPA routing, security headers
- [TypeScript](references/typescript.md) — tsconfig, naming, generics, Valibot schemas
