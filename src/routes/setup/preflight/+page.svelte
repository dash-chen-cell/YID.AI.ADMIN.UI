<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	interface PreflightCheck {
		id: string;
		name: string;
		status: 'ok' | 'warn' | 'fail';
		detail: string;
		required: boolean;
	}

	interface PreflightResponse {
		checks: PreflightCheck[];
	}

	let checks = $state<PreflightCheck[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			const res = await fetch('/api/setup/preflight');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json() as PreflightResponse;
			checks = data.checks;
		} catch (e) {
			error = String(e);
		} finally {
			loading = false;
		}
	});

	const canContinue = $derived(
		checks.filter((c) => c.required).every((c) => c.status !== 'fail')
	);

	const statusIcon: Record<string, string> = {
		ok: '✅',
		warn: '⚠️',
		fail: '❌',
	};

	const statusColor: Record<string, string> = {
		ok: 'text-success',
		warn: 'text-warning',
		fail: 'text-danger',
	};
</script>

<svelte:head><title>Preflight Check — YID AI Setup</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-bold text-text-primary">System Preflight Check</h1>
		<p class="mt-1 text-sm text-text-secondary">
			Verifying your system meets the minimum requirements before setup begins.
		</p>
	</div>

	{#if loading}
		<!-- Skeleton -->
		<div class="overflow-hidden rounded-xl border border-border bg-surface">
			{#each [1, 2, 3, 4] as _}
				<div class="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
					<div class="h-5 w-5 animate-pulse rounded bg-border"></div>
					<div class="flex-1 space-y-2">
						<div class="h-4 w-40 animate-pulse rounded bg-border"></div>
						<div class="h-3 w-64 animate-pulse rounded bg-border"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if error}
		<div class="rounded-xl border border-danger bg-danger-bg p-5">
			<p class="text-sm font-medium text-danger">Failed to run preflight checks</p>
			<p class="mt-1 text-xs text-text-secondary">{error}</p>
			<button
				onclick={() => { error = null; loading = true; location.reload(); }}
				class="mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-raised"
			>
				Retry
			</button>
		</div>
	{:else if checks.length > 0}
		<div class="overflow-hidden rounded-xl border border-border bg-surface">
			{#each checks as check}
				<div class="flex items-start gap-4 border-b border-border px-5 py-4 last:border-0">
					<!-- Status icon -->
					<span class="mt-0.5 text-lg leading-none" aria-label={check.status}>
						{statusIcon[check.status] ?? '❓'}
					</span>
					<!-- Info -->
					<div class="flex-1 min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-sm font-medium text-text-primary">{check.name}</span>
							{#if check.required}
								<span class="rounded-full border border-danger/40 bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">
									Required
								</span>
							{/if}
						</div>
						<p class="mt-0.5 text-xs font-mono text-text-secondary">{check.detail}</p>
					</div>
					<!-- Status label -->
					<span class="mt-0.5 text-xs font-semibold uppercase tracking-wide {statusColor[check.status] ?? ''}">
						{check.status}
					</span>
				</div>
			{/each}
		</div>

		<!-- Summary -->
		{#if !canContinue}
			<div class="rounded-xl border border-danger bg-danger-bg px-5 py-4">
				<p class="text-sm font-medium text-danger">One or more required checks failed.</p>
				<p class="mt-1 text-xs text-text-secondary">
					Resolve the failed required checks before continuing. Optional warnings can be
					addressed after installation.
				</p>
			</div>
		{/if}
	{/if}

	<!-- Navigation -->
	<div class="flex justify-end">
		<button
			disabled={!canContinue || loading}
			onclick={() => goto('/setup/config')}
			class="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
		>
			Continue to Configure
		</button>
	</div>
</div>
