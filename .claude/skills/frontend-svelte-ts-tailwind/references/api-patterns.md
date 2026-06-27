# API Patterns

## HTTP Client

```typescript
// src/lib/api/client.ts
const DEFAULT_TIMEOUT_MS = 30_000;

async function request<T>(
  url: string,
  init: RequestInit = {}
): ResultAsync<T, AppError> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const msg = await parseErrorMessage(res);
      return err(mapStatusToAppError(res.status, msg));
    }
    const data = await parseJsonBody<T>(res);
    return data.ok ? ok(data.data) : err(data.error);
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === 'AbortError') {
      return err({ type: 'api', status: 'network', message: 'Request timeout' });
    }
    return err({ type: 'api', status: 'network', message: String(e) });
  }
}

export function httpGet<T>(url: string, headers?: HeadersInit): ResultAsync<T, AppError> {
  return request<T>(url, { method: 'GET', headers });
}

export function httpPost<T>(url: string, body: unknown, headers?: HeadersInit): ResultAsync<T, AppError> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
```

## Auth Headers

```typescript
// src/lib/api/auth-headers.ts
import { get } from 'svelte/store';
import { authUser } from '$lib/stores/auth';

export function authHeaders(): HeadersInit {
  const user = get(authUser);
  if (!user?.token) return {};
  return { Authorization: `Bearer ${user.token}` };
}
```

## Error Mapping

```typescript
function mapStatusToAppError(status: number, message: string): AppError {
  if (status === 401) return { type: 'auth', reason: 'invalid' };
  if (status === 419) return { type: 'api', status: '4xx', message, code: 'SESSION_EXPIRED' };
  if (status >= 400 && status < 500) return { type: 'api', status: '4xx', message };
  return { type: 'api', status: '5xx', message };
}

async function parseErrorMessage(res: Response): Promise<string> {
  try { return (await res.text()) || `HTTP ${res.status}`; }
  catch { return `HTTP ${res.status}`; }
}

async function parseJsonBody<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; error: AppError }> {
  if (res.status === 204) return { ok: true, data: undefined as T };
  try { return { ok: true, data: await res.json() as T }; }
  catch { return { ok: false, error: { type: 'api', status: '5xx', message: 'Invalid JSON' } }; }
}
```

## QueryUI Adapter (sendOne)

```typescript
// src/lib/api/adapters/queryui.ts
const QUERY_ENDPOINT = '/service/api/query';

export async function sendOne<T>(
  kit: string,
  action: string,
  params?: unknown,
  options: { retries?: number; retryDelay?: number } = {}
): ResultAsync<T, AppError> {
  const { retries = 2, retryDelay = 500 } = options;

  return executeWithRetry(
    () => httpPost<T>(QUERY_ENDPOINT, [{ kit, act: action, params }], authHeaders()),
    { retries, retryDelay }
  );
}

async function executeWithRetry<T>(
  fn: () => ResultAsync<T, AppError>,
  opts: { retries: number; retryDelay: number }
): ResultAsync<T, AppError> {
  let last: AppError | null = null;
  for (let i = 0; i <= opts.retries; i++) {
    const r = await fn();
    if (r.isOk()) return r;
    const e = r.error;
    // Never retry auth errors
    if (e.type === 'auth') { await goto('/login'); return err(e); }
    // Only retry timeout / network
    if (e.type === 'api' && e.status !== 'network') return r;
    last = e;
    if (i < opts.retries) await sleep(opts.retryDelay * 2 ** i);
  }
  return err(last!);
}
```

## API Envelope Types (CASHIER pattern)

```typescript
// src/lib/api/types.ts
export interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
}

export const BUSINESS_CODE = {
  SUCCESS: 1000,
  EXPIRED: 1001,
  REDIRECT: 1003,
  GONE: 1024,
} as const;

export type BusinessCode = (typeof BUSINESS_CODE)[keyof typeof BUSINESS_CODE];
```

## Valibot Runtime Validation

```typescript
// src/lib/api/schemas.ts
import * as v from 'valibot';

export function envelope<T extends v.GenericSchema>(schema: T) {
  return v.object({ code: v.number(), data: schema, message: v.optional(v.string()) });
}

export const OrderSchema = v.object({
  id: v.string(),
  amount: v.union([v.number(), v.string()]),
  status: v.picklist(['INIT', 'PENDING', 'SUCCESS', 'FAILED'] as const),
});

// Usage
const parsed = v.safeParse(envelope(OrderSchema), rawData);
if (!parsed.success) return err({ type: 'api', status: '5xx', message: 'Schema mismatch' });
```
