# Component Patterns

## StatusBadge — Discriminated Config Map

```typescript
// src/lib/components/StatusBadge.svelte
<script lang="ts" module>
  // Module-scope: shared across all instances
  const STATUS_META: Record<OrderStatus, { label: string; icon: string; variant: string }> = {
    INIT:    { label: '初始化', icon: '⏸', variant: 'outline' },
    PENDING: { label: '處理中', icon: '⏳', variant: 'secondary' },
    SUCCESS: { label: '成功',   icon: '✅', variant: 'success' },
    FAILED:  { label: '失敗',   icon: '❌', variant: 'destructive' },
  };
</script>

<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils/cn';

  type Props = {
    status: OrderStatus;
    icon?: boolean;
    label?: string;
    class?: string;
  };

  let { status, icon = true, label, class: className }: Props = $props();
  const meta = $derived(STATUS_META[status]);
</script>

<Badge variant={meta.variant} class={cn('whitespace-nowrap', className)}>
  {#if icon}<span aria-hidden="true">{meta.icon}</span>{/if}
  {label ?? meta.label}
</Badge>
```

## Dialog with bindable open state

```typescript
// src/lib/components/ConfirmDialog.svelte
<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';

  type Props = {
    open?: boolean;   // not $bindable — controlled by parent
    title: string;
    description: string;
    onconfirm: () => void | Promise<void>;
    oncancel?: () => void;
  };

  let { open = false, title, description, onconfirm, oncancel }: Props = $props();
  let loading = $state(false);

  async function handleConfirm() {
    loading = true;
    await onconfirm();
    loading = false;
  }
</script>

<Dialog.Root {open} onOpenChange={(v) => !v && oncancel?.()}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <button onclick={oncancel}>取消</button>
      <button onclick={handleConfirm} disabled={loading}>確認</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

## Data Table Component

```typescript
// src/lib/components/DataTable.svelte
<script lang="ts">
  type Column<T> = {
    key: keyof T;
    label: string;
    render?: (value: T[keyof T], row: T) => string;
  };

  type Props<T> = {
    data: T[];
    columns: Column<T>[];
    loading?: boolean;
    emptyMessage?: string;
  };

  let { data, columns, loading = false, emptyMessage = '無資料' }: Props<T> = $props();
</script>

{#if loading}
  <div class="flex justify-center py-8">
    <span class="animate-spin">⏳</span>
  </div>
{:else if data.length === 0}
  <p class="text-center text-muted-foreground py-8">{emptyMessage}</p>
{:else}
  <table class="w-full border-collapse">
    <thead>
      <tr>
        {#each columns as col}
          <th class="text-left p-3 border-b text-sm font-medium text-muted-foreground">
            {col.label}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each data as row}
        <tr class="hover:bg-muted/50 transition-colors">
          {#each columns as col}
            <td class="p-3 border-b text-sm">
              {col.render ? col.render(row[col.key], row) : row[col.key]}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
```

## Form with Real-time Validation

```typescript
// src/lib/components/PasswordForm.svelte
<script lang="ts">
  import * as m from '$lib/paraglide/messages';

  type Props = { onchanged: () => void };
  let { onchanged }: Props = $props();

  let current = $state('');
  let next = $state('');
  let confirm = $state('');
  let loading = $state(false);
  let errorMsg = $state<string | null>(null);

  const rules = $derived({
    minLength:  next.length >= 12,
    hasUpper:   /[A-Z]/.test(next),
    hasLower:   /[a-z]/.test(next),
    hasDigit:   /\d/.test(next),
    hasSpecial: /[!@#$%^&*]/.test(next),
  });

  const isValid = $derived(Object.values(rules).every(Boolean));
  const matches = $derived(confirm === '' || next === confirm);
  const canSubmit = $derived(current !== '' && isValid && next === confirm && !loading);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit) return;
    loading = true;
    errorMsg = null;

    const result = await sendOne<void>('account', 'changePassword',
      { currentPassword: current, newPassword: next },
      { retries: 0 }  // Non-idempotent
    );

    result.match(
      () => { loading = false; current = next = confirm = ''; onchanged(); },
      (err) => {
        loading = false;
        errorMsg = err.type === 'auth'
          ? m['password.wrong_current']()
          : m['password.change_failed']();
      }
    );
  }
</script>

<form onsubmit={handleSubmit} class="flex flex-col gap-4">
  <!-- inputs -->
  {#if errorMsg}
    <p class="text-destructive text-sm">{errorMsg}</p>
  {/if}
  {#if next.length > 0}
    <!-- rule checklist from rules derived -->
  {/if}
  <button type="submit" disabled={!canSubmit}>
    {loading ? m['common.saving']() : m['common.save']()}
  </button>
</form>
```

## Toaster Setup (root layout)

```svelte
<!-- Add once in root +layout.svelte -->
<script lang="ts">
  import { Toaster } from 'svelte-sonner';
</script>
<Toaster position="top-center" richColors closeButton theme="system" />

<!-- Usage anywhere -->
<script lang="ts">
  import { toast } from 'svelte-sonner';
  toast.success('操作成功');
  toast.error('操作失敗');
</script>
```

## Loading / Error Boundary Pattern

```svelte
{#if adapter.loading}
  <div class="flex items-center justify-center py-12">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
{:else if adapter.error}
  <div class="text-destructive text-center py-8">
    <p>{m['error.load_failed']()}</p>
    <button onclick={() => adapter.load()} class="mt-2 text-sm underline">
      {m['common.retry']()}
    </button>
  </div>
{:else if adapter.data}
  <!-- actual content -->
{/if}
```
