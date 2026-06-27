<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { setupState } from '$lib/stores/setup';

	interface SetupModel {
		name: string;
		alias: string;
		size_gb: number;
		vram_min_gb: number;
		recommended: boolean;
		purpose: string[];
	}

	interface SetupModelWithState extends SetupModel {
		downloaded?: boolean;
	}

	let models = $state<SetupModelWithState[]>([]);
	let selected = $state<Set<string>>(new Set());
	let loading = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let alreadyDownloaded = $state(false);
	let downloadedCount = $state(0);

	onMount(async () => {
		try {
			// Check overall status first
			const statusRes = await fetch('/api/setup/status');
			if (statusRes.ok) {
				const statusData = await statusRes.json() as { models_done: boolean };
				alreadyDownloaded = statusData.models_done;
			}

			const res = await fetch('/api/setup/models');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json() as { models: SetupModelWithState[] };
			const modelList = data.models ?? (data as unknown as SetupModelWithState[]);
			models = modelList;
			downloadedCount = modelList.filter(m => m.downloaded).length;
			// Pre-select downloaded models, fallback to recommended
			const downloaded = modelList.filter(m => m.downloaded).map(m => m.name);
			selected = new Set(
				downloaded.length > 0
					? downloaded
					: modelList.filter(m => m.recommended).map(m => m.name)
			);
		} catch (e) {
			error = String(e);
		} finally {
			loading = false;
		}
	});

	function toggleModel(name: string) {
		const next = new Set(selected);
		if (next.has(name)) {
			next.delete(name);
		} else {
			next.add(name);
		}
		selected = next;
	}

	const totalSizeGb = $derived(
		models.filter((m) => selected.has(m.name)).reduce((acc, m) => acc + (m.size_gb ?? 0), 0)
	);

	async function handleContinue() {
		submitting = true;
		error = null;
		try {
			const res = await fetch('/api/setup/select-models', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ models: Array.from(selected) }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
			setupState.setSelectedModels(Array.from(selected));
			setupState.markStepDone('models');
			goto('/setup/install');
		} catch (e) {
			error = String(e);
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Select Models — YID AI Setup</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-bold text-text-primary">Select AI Models</h1>
		<p class="mt-1 text-sm text-text-secondary">
			Choose which models to install. Recommended models are pre-selected.
		</p>
	</div>

	{#if alreadyDownloaded && !loading}
	<div class="rounded-xl border border-success bg-success-bg px-5 py-4 flex items-start justify-between gap-4">
		<div class="flex gap-3">
			<span class="text-base shrink-0">✅</span>
			<div class="text-sm">
				<p class="font-medium text-text-primary">模型已下載完成（{downloadedCount} 個）</p>
				<p class="text-text-secondary mt-0.5">
					偵測到已下載的模型檔案，可直接跳過此步驟。或選擇其他模型後繼續。
				</p>
			</div>
		</div>
		<button
			onclick={handleContinue}
			class="shrink-0 rounded-md bg-success px-4 py-2 text-xs font-medium text-white hover:bg-success/90 transition-colors whitespace-nowrap">
			跳過此步驟 →
		</button>
	</div>
	{/if}

	{#if error}
		<div class="rounded-xl border border-danger bg-danger-bg px-5 py-4">
			<p class="text-sm text-danger">{error}</p>
		</div>
	{/if}

	{#if loading}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each [1, 2, 3, 4] as _}
				<div class="h-40 animate-pulse rounded-xl border border-border bg-surface"></div>
			{/each}
		</div>
	{:else if models.length > 0}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each models as model}
				{@const isSelected = selected.has(model.name)}
				<button
					type="button"
					onclick={() => toggleModel(model.name)}
					class="relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-surface-raised"
					class:border-primary={isSelected}
					class:bg-primary-subtle={isSelected}
					class:border-border={!isSelected}
					class:bg-surface={!isSelected}
					aria-pressed={isSelected}
				>
					<!-- Selection indicator + recommended badge -->
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-2 flex-1 min-w-0">
							<!-- Checkbox indicator -->
							<div
								class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
								class:bg-primary={isSelected}
								class:border-primary={isSelected}
								class:border-border={!isSelected}
							>
								{#if isSelected}
									<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="20 6 9 17 4 12" />
									</svg>
								{/if}
							</div>
							<span class="truncate font-mono text-sm font-semibold text-text-primary">{model.name}</span>
						</div>
						<div class="flex gap-1.5 flex-wrap">
							{#if model.downloaded}
							<span class="rounded-full bg-info-bg px-2 py-0.5 text-xs font-medium text-info">
								已下載
							</span>
							{/if}
							{#if model.recommended}
							<span class="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
								Recommended
							</span>
							{/if}
						</div>
					</div>

					<!-- Alias -->
					{#if model.alias}
						<p class="text-xs text-text-secondary">alias: <span class="font-mono">{model.alias}</span></p>
					{/if}

					<!-- Specs -->
					<div class="flex gap-3 text-xs text-text-secondary">
						<span>{model.size_gb} GB on disk</span>
						<span>&bull;</span>
						<span>{model.vram_min_gb} GB VRAM min</span>
					</div>

					<!-- Purpose tags -->
					{#if model.purpose.length > 0}
						<div class="flex flex-wrap gap-1">
							{#each model.purpose as tag}
								<span class="rounded-full bg-background px-2 py-0.5 text-xs text-text-secondary border border-border">
									{tag}
								</span>
							{/each}
						</div>
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Summary bar -->
	{#if !loading}
		<div class="flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-3">
			<div class="text-sm text-text-secondary">
				<span class="font-semibold text-text-primary">{selected.size}</span> model{selected.size !== 1 ? 's' : ''} selected
				&mdash;
				<span class="font-semibold text-text-primary">{totalSizeGb.toFixed(1)}</span> GB total
			</div>
			<p class="text-xs text-text-disabled">You can change this later</p>
		</div>

		<!-- Navigation -->
		<div class="flex items-center justify-between">
			<button
				type="button"
				onclick={() => goto('/setup/secrets')}
				class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
			>
				Back
			</button>
			<button
				onclick={handleContinue}
				disabled={submitting}
				class="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
			>
				{submitting ? 'Saving...' : 'Continue to Install'}
			</button>
		</div>
	{/if}
</div>
