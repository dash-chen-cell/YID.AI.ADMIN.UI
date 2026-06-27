<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { setupState } from '$lib/stores/setup';
	import { ClipboardCopy, ShieldAlert } from '@lucide/svelte';

	interface GeneratedKey {
		name: string;
		hint: string;
	}

	let keys = $state<GeneratedKey[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let confirmed = $state(false);
	let copied = $state(false);
	let alreadyGenerated = $state(false);

	const COPY_COMMAND = 'grep -E "YID_ADMIN_SECRET|LITELLM_MASTER_KEY|GRAFANA" .env';

	onMount(async () => {
		try {
			// Check if secrets already exist before generating new ones
			const statusRes = await fetch('/api/setup/secrets/status');
			if (statusRes.ok) {
				const statusData = await statusRes.json() as { secrets_done: boolean };
				if (statusData.secrets_done) {
					alreadyGenerated = true;
					loading = false;
					return;
				}
			}
			// Generate new secrets
			const res = await fetch('/api/setup/secrets', { method: 'POST' });
			if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
			const data = await res.json() as { keys: GeneratedKey[] };
			keys = data.keys;
		} catch (e) {
			error = String(e);
		} finally {
			loading = false;
		}
	});

	async function copyCommand() {
		try {
			await navigator.clipboard.writeText(COPY_COMMAND);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// fallback: select the text
		}
	}

	function handleContinue() {
		setupState.markStepDone('secrets');
		goto('/setup/models');
	}
</script>

<svelte:head><title>Secrets — YID AI Setup</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-bold text-text-primary">Generate Secrets</h1>
		<p class="mt-1 text-sm text-text-secondary">
			Cryptographically secure keys are being generated for your platform services.
		</p>
	</div>

	{#if loading}
		<div class="flex flex-col items-center gap-4 py-12">
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"></div>
			<p class="text-sm text-text-secondary">Checking secrets...</p>
		</div>
	{:else if alreadyGenerated}
		<div class="rounded-xl border border-success bg-success-bg px-5 py-4 flex items-start justify-between gap-4">
			<div class="flex gap-3">
				<span class="text-base shrink-0">✅</span>
				<div class="text-sm">
					<p class="font-medium text-text-primary">Secrets 已設定完成</p>
					<p class="text-text-secondary mt-0.5">
						所有平台 secrets 已存在於 .env，無需重新生成。
					</p>
				</div>
			</div>
			<button
				onclick={handleContinue}
				class="shrink-0 rounded-md bg-success px-4 py-2 text-xs font-medium text-white hover:bg-success/90 transition-colors whitespace-nowrap">
				跳過此步驟 →
			</button>
		</div>
	{:else if error}
		<div class="rounded-xl border border-danger bg-danger-bg px-5 py-4">
			<p class="text-sm font-medium text-danger">Failed to generate secrets</p>
			<p class="mt-1 text-xs text-text-secondary">{error}</p>
			<button
				onclick={() => { error = null; loading = true; location.reload(); }}
				class="mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-raised"
			>
				Retry
			</button>
		</div>
	{:else}
		<!-- Warning banner -->
		<div class="flex gap-3 rounded-xl border border-warning bg-warning-bg px-5 py-4">
			<ShieldAlert size={20} class="mt-0.5 shrink-0 text-warning" />
			<div>
				<p class="text-sm font-semibold text-warning">Save these secrets to 1Password NOW</p>
				<p class="mt-1 text-xs text-text-secondary">
					These secrets will not be shown again. They are stored in <code class="rounded bg-border px-1 py-0.5 font-mono text-xs">.env</code> on the server.
					Back them up immediately before continuing.
				</p>
			</div>
		</div>

		<!-- Keys list -->
		<div class="overflow-hidden rounded-xl border border-border bg-surface">
			<div class="border-b border-border px-5 py-3">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Generated Keys</h2>
			</div>
			{#each keys as key}
				<div class="flex items-start gap-3 border-b border-border px-5 py-3.5 last:border-0">
					<div class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-bg text-success text-xs font-bold">
						✓
					</div>
					<div>
						<p class="font-mono text-sm font-semibold text-text-primary">{key.name}</p>
						{#if key.hint}
							<p class="mt-0.5 text-xs text-text-secondary">{key.hint}</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Copy command -->
		<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
			<p class="text-xs font-medium text-text-secondary uppercase tracking-wide">Quick Copy from Server</p>
			<p class="text-xs text-text-secondary">
				Run this command on your server to view the generated values:
			</p>
			<div class="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
				<code class="flex-1 font-mono text-xs text-text-primary">{COPY_COMMAND}</code>
				<button
					onclick={copyCommand}
					class="shrink-0 rounded p-1 text-text-disabled hover:text-text-primary transition-colors"
					aria-label="Copy command"
					title="Copy to clipboard"
				>
					<ClipboardCopy size={14} />
				</button>
			</div>
			{#if copied}
				<p class="text-xs text-success">Copied to clipboard!</p>
			{/if}
		</div>

		<!-- Confirmation checkbox -->
		<label class="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:bg-surface-raised transition-colors">
			<input
				type="checkbox"
				bind:checked={confirmed}
				class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
			/>
			<span class="text-sm text-text-primary">
				I have saved all generated secrets to my password manager and understand they cannot be recovered if lost.
			</span>
		</label>
	{/if}

	<!-- Navigation -->
	{#if !loading && !error}
		<div class="flex items-center justify-between">
			<button
				type="button"
				onclick={() => goto('/setup/config')}
				class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
			>
				Back
			</button>
			<button
				disabled={!confirmed}
				onclick={handleContinue}
				class="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
			>
				Continue to Models
			</button>
		</div>
	{/if}
</div>
