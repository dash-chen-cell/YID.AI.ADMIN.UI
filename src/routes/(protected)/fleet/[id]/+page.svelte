<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { apiGet } from '$lib/api/client';
	import { cn } from '$lib/utils/cn';
	import { t } from '$lib/stores/i18n';
	import { ArrowLeft, Cpu, ServerCog, LayoutDashboard, Activity, ScrollText, CheckCircle, XCircle, Server } from '@lucide/svelte';
	import ModelsPanel from '$lib/components/fleet/ModelsPanel.svelte';
	import ServicesPanel from '$lib/components/fleet/ServicesPanel.svelte';
	import GpuPanel from '$lib/components/fleet/GpuPanel.svelte';
	import LogsPanel from '$lib/components/fleet/LogsPanel.svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';

	interface FleetServer {
		id: string; name: string; prometheus_url: string; litellm_url: string;
		ssh_host: string; tags: string[]; enabled: boolean; note: string | null;
	}
	interface HealthResult { id: string; online: boolean; latency_ms: number | null; models_running: number; }

	const serverId = $derived(page.params.id);
	const isLocal = $derived(serverId === 'local');

	let server = $state<FleetServer | null>(null);
	let health = $state<HealthResult | null>(null);
	let loading = $state(true);
	let activeTab = $state<'overview' | 'models' | 'services' | 'monitor' | 'logs'>('overview');

	onMount(load);

	async function load() {
		loading = true;
		const [fleetResult, healthResult] = await Promise.all([
			apiGet<FleetServer[]>('/fleet', { silent: true }),
			apiGet<HealthResult[]>('/fleet/health/all', { silent: true }),
		]);
		fleetResult.match((d) => { server = d.find(s => s.id === serverId) ?? null; }, () => {});
		healthResult.match((d) => { health = d.find(h => h.id === serverId) ?? null; }, () => {});
		loading = false;
	}

	const tabs = $derived([
		{ id: 'overview', label: $t('fleet.tab_overview', '概覽'),   icon: LayoutDashboard },
		{ id: 'models',   label: $t('fleet.tab_models',   '模型'),   icon: Cpu },
		{ id: 'services', label: $t('fleet.tab_services', '服務'),   icon: ServerCog },
		{ id: 'monitor',  label: $t('fleet.tab_monitor',  'GPU/監控'), icon: Activity },
		{ id: 'logs',     label: $t('fleet.tab_logs',     '日誌'),   icon: ScrollText },
	] as const);
</script>

<svelte:head><title>{server?.name ?? 'Device'} — Fleet — YID AI Admin</title></svelte:head>

<div class="space-y-5">
	<!-- Header -->
	<div class="flex items-start gap-3">
		<a href="/fleet" class="mt-1 rounded-md p-1.5 text-text-secondary hover:bg-surface-raised hover:text-text-primary">
			<ArrowLeft size={18} />
		</a>
		<div class="flex-1">
			<div class="flex items-center gap-3">
				<Server size={20} class="text-primary" />
				<h1 class="text-xl font-bold text-text-primary">{server?.name ?? serverId}</h1>
				{#if health}
					{#if health.online}
						<span class="flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success">
							<CheckCircle size={11} /> {$t('fleet.online', '線上')}
						</span>
					{:else}
						<span class="flex items-center gap-1 rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-medium text-danger">
							<XCircle size={11} /> {$t('fleet.offline', '離線')}
						</span>
					{/if}
				{/if}
				{#if isLocal}
					<span class="rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs text-primary">{$t('fleet.control_center', '中控中心')}</span>
				{/if}
			</div>
			{#if server?.note}<p class="mt-1 text-sm text-text-secondary">{server.note}</p>{/if}
			{#if server?.tags?.length}
			<div class="mt-1.5 flex flex-wrap gap-1">
				{#each server.tags as tag}<span class="rounded-full bg-primary-subtle px-2 py-0.5 text-xs text-primary">{tag}</span>{/each}
			</div>
			{/if}
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex gap-1 border-b border-border overflow-x-auto">
		{#each tabs as tab}
		<button onclick={() => activeTab = tab.id}
			class={cn('flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
				activeTab === tab.id ? 'border-primary text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary')}>
			<tab.icon size={14} />
			{tab.label}
		</button>
		{/each}
	</div>

	<!-- Tab content -->
	{#if activeTab === 'overview'}
		{#if loading}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each [1,2,3,4] as _}
			<SkeletonCard lines={1} />
			{/each}
		</div>
		<SkeletonCard lines={2} />
		{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-xl border border-border bg-surface p-4">
				<p class="text-xs text-text-secondary uppercase tracking-wide">{$t('fleet.ov_status', '狀態')}</p>
				<p class={cn('mt-1 text-lg font-bold', health?.online ? 'text-success' : 'text-danger')}>
					{health?.online ? $t('fleet.online', '線上') : $t('fleet.offline', '離線')}
				</p>
			</div>
			<div class="rounded-xl border border-border bg-surface p-4">
				<p class="text-xs text-text-secondary uppercase tracking-wide">{$t('fleet.ov_models', '運行模型')}</p>
				<p class="mt-1 text-lg font-bold text-text-primary">{health?.models_running ?? '—'}</p>
			</div>
			<div class="rounded-xl border border-border bg-surface p-4">
				<p class="text-xs text-text-secondary uppercase tracking-wide">{$t('fleet.ov_latency', '延遲')}</p>
				<p class="mt-1 text-lg font-bold text-text-primary">{health?.latency_ms != null ? `${health.latency_ms} ms` : '—'}</p>
			</div>
			<div class="rounded-xl border border-border bg-surface p-4">
				<p class="text-xs text-text-secondary uppercase tracking-wide">Prometheus</p>
				<p class="mt-1 text-xs font-mono text-text-secondary truncate">{server?.prometheus_url ?? '—'}</p>
			</div>
		</div>
		<div class="rounded-xl border border-border bg-surface p-5 space-y-2 text-sm">
			<div class="flex justify-between"><span class="text-text-secondary">LiteLLM URL</span><code class="text-xs">{server?.litellm_url || '—'}</code></div>
			<div class="flex justify-between"><span class="text-text-secondary">SSH Host</span><code class="text-xs">{server?.ssh_host || '—'}</code></div>
		</div>
		{/if}
	{:else if activeTab === 'models'}
		{#key serverId}<ModelsPanel {serverId} {isLocal} />{/key}
	{:else if activeTab === 'services'}
		{#key serverId}<ServicesPanel {serverId} {isLocal} />{/key}
	{:else if activeTab === 'monitor'}
		{#key serverId}<GpuPanel {serverId} />{/key}
	{:else if activeTab === 'logs'}
		{#key serverId}<LogsPanel {serverId} {isLocal} />{/key}
	{/if}
</div>
