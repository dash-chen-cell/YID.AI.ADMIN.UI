# State Patterns

## Auth Store

```typescript
// src/lib/stores/auth.ts
import { writable, derived } from 'svelte/store';

const SESSION_KEY = 'auth_user';

function getInitialUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  // E2E only — never production
  const e2e = (window as unknown as { __e2e_auth_user?: AuthUser }).__e2e_auth_user;
  if (e2e) return e2e;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as AuthUser;
    return new Date(parsed.tokenExpiresAt) > new Date() ? parsed : null;
  } catch { return null; }
}

export const authUser = writable<AuthUser | null>(getInitialUser());

// Keep sessionStorage in sync
if (typeof window !== 'undefined') {
  authUser.subscribe((u) => {
    try {
      if (u) sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* private mode / quota */ }
  });
}

export const isAuthenticated = derived(authUser, ($u) => {
  if (!$u) return false;
  const exp = new Date($u.tokenExpiresAt);
  return !isNaN(exp.getTime()) && exp > new Date();
});

export function clearAuth(): void { authUser.set(null); }
```

## Route Guard (protected layout)

```typescript
// src/routes/(protected)/+layout.svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';
  import { get } from 'svelte/store';
  import { isAuthenticated } from '$lib/stores/auth';

  let { children } = $props();

  beforeNavigate(({ to, cancel }) => {
    if (!to) return;
    if (!get(isAuthenticated)) {
      cancel();
      location.href = '/login';
    }
  });
</script>
{@render children?.()}
```

## Class-based Store with Private Rune State

```typescript
// src/lib/stores/brand.store.svelte.ts
class BrandStore {
  #config = $state<BrandConfig | null>(null);
  #status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  #promise: Promise<void> | null = null;

  get config() { return this.#config; }
  get isReady() { return this.#status === 'ready'; }
  get status() { return this.#status; }

  async init(): Promise<void> {
    if (this.#promise) return this.#promise;
    this.#promise = this.#load();
    try { await this.#promise; }
    finally { this.#promise = null; }
  }

  async #load(): Promise<void> {
    this.#status = 'loading';
    const result = await fetchBrandConfig();
    result.match(
      (cfg) => { this.#config = cfg; this.#status = 'ready'; },
      () => { this.#status = 'error'; }
    );
  }

  hasFeature(name: string): boolean {
    return this.#config?.features?.[name] ?? false;
  }
}

export const brandStore = new BrandStore();
```

## QueryAdapter — Generic Data Fetching

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
    if (seq !== this.#seq) return; // stale discard

    result.match(
      (d) => { this.data = d; },
      (e) => { this.error = e; }
    );
    this.loading = false;
  }

  reset() {
    this.data = null;
    this.error = null;
    this.loading = false;
    this.#seq++;
  }
}

// Usage
class OrderAdapter extends QueryAdapter<Order[]> {
  filters = $state<Filters>({});

  async load() {
    await this.fetch(() => httpGet<Order[]>(`/api/orders?${qs(this.filters)}`, authHeaders()));
  }
}

// In component
const orders = new OrderAdapter();
onMount(() => orders.load());
```

## Root Layout Init Sequence

```typescript
// src/routes/+layout.svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let { children } = $props();
  let ready = $state(false);

  onMount(async () => {
    // 1. MSW (dev only — controlled by __MSW_ENABLED__ define)
    if (__MSW_ENABLED__) {
      const { worker } = await import('$mocks/browser');
      await worker.start({ onUnhandledRequest: 'bypass' });
    }
    // 2. Brand / theme
    await brandStore.init();
    // 3. Done
    ready = true;
  });
</script>

{#if ready}
  {@render children?.()}
{/if}
```
