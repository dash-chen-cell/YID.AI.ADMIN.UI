<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { toast } from 'svelte-sonner';
	import { t } from '$lib/stores/i18n';
	import { RefreshCw, ScrollText } from '@lucide/svelte';

	let { serverId = 'local', isLocal = true }: { serverId?: string; isLocal?: boolean } = $props();

	interface Service { id: string; label: string; type: string; }

	let containers = $state<{ id: string; label: string }[]>([]);
	let selected = $state('');
	let logs = $state('');
	let lines = $state(100);
	let loading = $state(false);
	let loadingContainers = $state(true);

	onMount(async () => {
		// Load available containers (docker services) for this server
		const result = await apiGet<Service[]>(`/system/services?server_id=${serverId}`);
		result.match(
			(d) => {
				containers = d.filter(s => s.type === 'docker').map(s => ({ id: s.id.replace('docker:', ''), label: s.label }));
				if (containers.length) { selected = containers[0].id; loadLogs(); }
			},
			() => {}
		);
		loadingContainers = false;
	});

	async function loadLogs() {
		if (!selected) return;
		loading = true;
		const result = await apiGet<{ logs: string }>(`/fleet/${serverId}/logs?container=${selected}&lines=${lines}`);
		result.match((d) => { logs = d.logs; }, (e) => { logs = ''; toast.error(errorMessage(e)); });
		loading = false;
	}
</script>

<div class="space-y-3">
	{#if !isLocal}
	<div class="rounded-lg border border-info/30 bg-info-bg px-4 py-2 text-xs text-text-secondary">
		{$t('fleet.logs_remote_note', '遠端日誌需該裝置已部署 agent')}
	</div>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<select bind:value={selected} onchange={loadLogs}
			class="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary">
			{#each containers as c}<option value={c.id}>{c.label} ({c.id})</option>{/each}
		</select>
		<select bind:value={lines} onchange={loadLogs}
			class="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary">
			<option value={100}>100 {$t('fleet.lines', '行')}</option>
			<option value={500}>500 {$t('fleet.lines', '行')}</option>
			<option value={1000}>1000 {$t('fleet.lines', '行')}</option>
		</select>
		<button onclick={loadLogs} class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
			<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
			{$t('common.refresh', 'Refresh')}
		</button>
	</div>

	{#if loadingContainers}
		<div class="h-64 animate-pulse rounded-xl border border-border bg-surface"></div>
	{:else if containers.length === 0}
		<div class="rounded-xl border border-border bg-surface py-16 text-center text-text-secondary">
			<ScrollText size={32} class="mx-auto mb-2" />
			<p class="text-sm">{$t('fleet.no_containers', '無可用容器')}</p>
		</div>
	{:else}
		<pre class="max-h-[60vh] overflow-auto rounded-xl border border-border bg-background p-4 font-mono text-xs leading-relaxed text-text-primary whitespace-pre-wrap">{logs || $t('fleet.no_logs', '(無日誌)')}</pre>
	{/if}
</div>
