<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import { cn } from '$lib/utils/cn';
	import { ExternalLink, Play, Square, Download, RefreshCw } from '@lucide/svelte';
	import { errorMessage } from '$lib/utils/error';
	import type { Model } from '$lib/types';
	import { t } from '$lib/stores/i18n';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';

	// serverId: 'local' or a fleet server id. isLocal controls whether actions are enabled.
	let { serverId = 'local', isLocal = true }: { serverId?: string; isLocal?: boolean } = $props();

	interface ModelData {
		models: Model[];
		slots: Record<string, Model[]>;
		model_data_dir: string;
		server_id?: string;
	}

	let data = $state<ModelData | null>(null);
	let loading = $state(true);
	let actionLoading = $state<Record<string, boolean>>({});
	let sseMap = $state<Record<string, EventSource>>({});
	let startingModels = $state<Set<string>>(new Set());

	const SLOT_LABELS: Record<string, string> = {
		'8000': 'Coding / General',
		'8001': 'Vision / OCR',
		'8002': 'Planning / Review',
		'8003': 'Agentic / Reasoning',
		'8004': 'Embeddings',
	};

	onMount(load);

	export async function load() {
		loading = true;
		const result = await apiGet<ModelData>(`/models?server_id=${serverId}`, { silent: true });
		result.match(
			(d) => {
				data = d;
				if (isLocal) {
					d.models.filter(m => m.dl_status === 'downloading').forEach(m => startSSE(m.name));
				}
			},
			(e) => toast.error(errorMessage(e))
		);
		loading = false;
	}

	function startSSE(name: string) {
		if (sseMap[name]) return;
		const es = new EventSource(`/models/${name}/progress`);
		sseMap[name] = es;
		es.onmessage = (e) => {
			const d = JSON.parse(e.data);
			if (!data) return;
			const model = data.models.find(m => m.name === name);
			if (model) { model.dl_status = d.status; model.dl_pct = d.pct; model.dl_msg = d.msg; }
			if (d.status === 'done' || d.status === 'error') {
				es.close(); delete sseMap[name];
				if (d.status === 'done') { toast.success(`${name} downloaded`); load(); }
				else { toast.error(`Download failed: ${d.msg}`); }
			}
		};
		es.onerror = () => { es.close(); delete sseMap[name]; };
	}

	async function startModel(name: string) {
		actionLoading[name] = true;
		const result = await apiPost<{ status?: string }>(`/models/${name}/start?server_id=${serverId}`);
		result.match(
			() => {
				// Backend starts in the background; model load into VRAM takes a while.
				// Mark as starting and poll /api/models until it reports running.
				startingModels = new Set([...startingModels, name]);
				toast.info($t('models.starting', '啟動中…') + ` ${name}`);
				pollUntilRunning(name);
			},
			(e) => toast.error(errorMessage(e))
		);
		actionLoading[name] = false;
	}

	async function pollUntilRunning(name: string) {
		// Poll up to ~90s (models can take a while to load into VRAM)
		for (let i = 0; i < 30; i++) {
			await new Promise(r => setTimeout(r, 3000));
			const r = await apiGet<ModelData>(`/models?server_id=${serverId}`, { silent: true });
			if (r.isOk()) {
				data = r.value;
				const m = r.value.models.find(x => x.name === name);
				if (m?.running) {
					startingModels = new Set([...startingModels].filter(n => n !== name));
					toast.success(`${name} ` + $t('models.status.running', '運行中'));
					return;
				}
			}
		}
		// Timed out waiting — stop showing starting, let the card reflect reality
		startingModels = new Set([...startingModels].filter(n => n !== name));
		toast.error(`${name}: ` + $t('models.start_timeout', '啟動逾時，請檢查日誌'));
	}

	async function stopModel(name: string) {
		if (!confirm($t('models.confirm_stop', 'Stop this model? In-progress requests will be interrupted.'))) return;
		actionLoading[name] = true;
		const result = await apiPost(`/models/${name}/stop?server_id=${serverId}`);
		result.match(() => { toast.success(`${name} stopped`); load(); }, (e) => toast.error(errorMessage(e)));
		actionLoading[name] = false;
	}

	async function downloadModel(name: string) {
		actionLoading[name] = true;
		const result = await apiPost(`/models/${name}/download?server_id=${serverId}`);
		result.match(() => { toast.info(`Downloading ${name}...`); startSSE(name); }, (e) => toast.error(errorMessage(e)));
		actionLoading[name] = false;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<p class="text-xs text-text-secondary font-mono">
			{#if data && isLocal}{$t('models.stored_at', 'GGUF files stored at')} {data.model_data_dir}{/if}
		</p>
		<button onclick={load} class="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
			<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
			{$t('common.refresh', 'Refresh')}
		</button>
	</div>

	{#if loading}
		<div class="grid gap-4 md:grid-cols-2">
			{#each [1,2,3,4] as _}<SkeletonCard lines={4} />{/each}
		</div>
	{:else if data}
		<div class="grid gap-4 md:grid-cols-2">
		{#each Object.entries(data.slots).sort() as [port, models]}
			<div class="overflow-hidden rounded-xl border border-border">
				<div class="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
					<span class="rounded-full bg-primary-subtle px-3 py-0.5 font-mono text-xs font-bold text-primary">:{port}</span>
					<span class="text-sm text-text-secondary">{SLOT_LABELS[port] ?? $t('models.slot', 'Inference Slot')}</span>
					{#if models.length > 1}
						<span class="ml-auto rounded px-2 py-0.5 text-xs text-warning bg-warning-bg">{$t('models.exclusive_note', 'Only one model per slot')}</span>
					{/if}
				</div>
				{#each models as model}
					<div class={cn('flex flex-wrap items-start gap-4 px-5 py-4',
						model.running ? 'border-l-2 border-success bg-success-bg/20' : 'border-l-2 border-transparent')}>
						<div class="flex-1 min-w-48">
							<div class="flex items-center gap-2">
								<span class="font-mono text-sm font-semibold text-text-primary">{model.name}</span>
								{#if model.running}<span class="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">{$t('models.status.running', 'Active')}</span>{/if}
								{#if model.downloaded}<span class="rounded-full bg-info-bg px-2 py-0.5 text-xs text-info">{$t('common.on_disk', 'on disk')}</span>{/if}
							</div>
							<div class="mt-0.5 text-xs text-text-secondary">alias: {model.alias}</div>
							{#if model.purpose.length}
								<div class="mt-2 flex flex-wrap gap-1">
									{#each model.purpose.slice(0, 4) as p}<span class="rounded-full bg-primary-subtle px-2 py-0.5 text-xs text-primary">{p}</span>{/each}
								</div>
							{/if}
							<div class="mt-2 flex flex-wrap gap-3 text-xs text-text-secondary">
								{#if model.size_gb}<span>{model.size_gb} GB</span>{/if}
								{#if model.hf_repo}
									<a href="https://huggingface.co/{model.hf_repo}" target="_blank" class="flex items-center gap-1 text-text-link hover:underline">
										{model.hf_repo}<ExternalLink size={10} />
									</a>
								{/if}
							</div>
						</div>
						<div class="flex flex-col items-end gap-2">
							{#if !isLocal}
								{#if model.running}
									<span class="rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success">{$t('models.status.running', 'Active')}</span>
								{:else}
									<span class="rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-text-disabled">{$t('models.status.stopped', 'Stopped')}</span>
								{/if}
							{:else if startingModels.has(model.name)}
								<span class="flex items-center gap-1.5 rounded-md bg-info-bg px-3 py-1.5 text-xs font-medium text-info">
									<RefreshCw size={12} class="animate-spin" />{$t('models.starting', '啟動中…')}
								</span>
							{:else if model.running}
								<button onclick={() => stopModel(model.name)} disabled={actionLoading[model.name]}
									class="flex items-center gap-1.5 rounded-md bg-danger-bg px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50">
									<Square size={12} />{$t('models.action.stop', 'Stop')}
								</button>
							{:else if model.downloaded}
								<button onclick={() => startModel(model.name)} disabled={actionLoading[model.name] || startingModels.has(model.name)}
									class="flex items-center gap-1.5 rounded-md bg-success-bg px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50">
									<Play size={12} />{models.length > 1 ? $t('models.action.activate', 'Activate') : $t('models.status.stopped', 'Start')}
								</button>
							{:else if model.dl_status === 'downloading'}
								<span class="text-xs text-info animate-pulse">{$t('models.status.downloading', 'Downloading...')}</span>
							{:else}
								<button onclick={() => downloadModel(model.name)} disabled={actionLoading[model.name]}
									class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
									<Download size={12} />{$t('models.action.download', 'Download')}{model.size_gb ? ` (${model.size_gb}GB)` : ''}
								</button>
							{/if}
							{#if model.dl_status === 'downloading'}
								<div class="w-40">
									<div class="h-1.5 overflow-hidden rounded-full bg-border">
										<div class="h-full rounded-full bg-info transition-all" style="width:{model.dl_pct}%"></div>
									</div>
									<p class="mt-1 text-right text-xs text-text-secondary">{model.dl_msg}</p>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/each}
		</div>
	{/if}
</div>
