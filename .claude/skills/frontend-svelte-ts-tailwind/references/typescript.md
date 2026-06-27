# TypeScript Conventions

## tsconfig.json

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "module": "ESNext",
    "paths": {
      "$lib": ["./src/lib"],
      "$lib/*": ["./src/lib/*"]
    }
  }
}
```

## Naming Rules

```typescript
// Types / Interfaces — PascalCase, no "I" prefix
interface AuthUser { token: string; tokenExpiresAt: string; }
type OrderStatus = 'INIT' | 'PENDING' | 'SUCCESS' | 'FAILED';
type AppError = ApiError | AuthError | BrandConfigError;  // discriminated union

// Constants — UPPER_SNAKE_CASE for const enums
const BUSINESS_CODE = { SUCCESS: 1000, EXPIRED: 1001 } as const;
type BusinessCode = (typeof BUSINESS_CODE)[keyof typeof BUSINESS_CODE];

// Functions — camelCase
function fetchConfig(): ResultAsync<Config, AppError> { ... }

// Private class fields — # prefix
class Store { #data = $state<Data | null>(null); }
```

## Discriminated Union (preferred over class hierarchy)

```typescript
// src/lib/errors/app-error.ts
export type AppError =
  | { type: 'api';          status: '4xx' | '5xx' | 'network'; message: string; code?: string }
  | { type: 'auth';         reason: 'expired' | 'invalid' | 'mfa-required' }
  | { type: 'brand-config'; reason: BrandConfigErrorReason; message: string; statusCode?: number }
  | { type: 'schema';       schema: string; issues: unknown[] };

// Exhaustive match
function handleError(e: AppError): string {
  switch (e.type) {
    case 'api':          return e.message;
    case 'auth':         return 'Unauthorized';
    case 'brand-config': return `Config error: ${e.reason}`;
    case 'schema':       return `Schema mismatch in ${e.schema}`;
  }
}
```

## Generic Patterns

```typescript
// Generic API envelope
interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
}

// Generic store
class QueryAdapter<T> {
  data = $state<T | null>(null);
  async fetch(fn: () => ResultAsync<T, AppError>): Promise<void> { ... }
}

// Generic map builder
function buildMap<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}
```

## Valibot Runtime Schemas

```typescript
import * as v from 'valibot';

// Always define schema alongside type
const UserSchema = v.object({
  id: v.string(),
  email: v.pipe(v.string(), v.email()),
  role: v.picklist(['admin', 'user'] as const),
  createdAt: v.string(),
});

type User = v.InferOutput<typeof UserSchema>;  // derive type from schema

// Validation helper
export function parseResponse<T>(
  data: unknown,
  schema: v.GenericSchema<T>
): { ok: true; data: T } | { ok: false; error: AppError } {
  const r = v.safeParse(schema, data);
  return r.success
    ? { ok: true, data: r.output }
    : { ok: false, error: { type: 'schema', schema: schema.toString(), issues: r.issues } };
}
```

## Path Aliases

```typescript
// Always use $lib alias, never relative ../../
import { cn } from '$lib/utils/cn';          // ✅
import { cn } from '../../utils/cn';         // ❌

// Barrel exports per domain
// src/lib/api/index.ts
export { httpGet, httpPost } from './client';
export type { AppError } from './errors';
```

## Strict Null Handling

```typescript
// noUncheckedIndexedAccess: array[i] is T | undefined
const items: string[] = [];
const first = items[0];           // type: string | undefined
const safe = items[0] ?? 'default'; // ✅

// Optional chaining everywhere
const name = user?.profile?.displayName ?? 'Anonymous';

// Type narrowing before use
if (adapter.data !== null) {
  // adapter.data is T here, not T | null
  console.log(adapter.data.id);
}
```
