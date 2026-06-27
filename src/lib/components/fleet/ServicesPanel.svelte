<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { RefreshCw, Play, Square, RotateCcw, Server, Container } from '@lucide/svelte';
	import { t } from '$lib/stores/i18n';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';

	let { serverId = 'local', isLocal = true }: { serverId?: string; isLocal?: boolean } = $props();

	interface Service {
		id: string;
		label: string;
		type: 'systemd' | 'docker';
		status: 'active' | 'inactive' | 'failed' | 'activating' | 'unknown';
		server_id?: string;
	}

	let services = $state<Service[]>([]);
	let loading = $state(true);
	let actionLoading = $state<Record<string, string>>({});
	let showNotes = $state(false);

	onMount(load);

	export async function load() {
		loading = true;
		const result = await apiGet<Service[]>(`/system/services?server_id=${serverId}`, { silent: true });
		result.match((data) => { services = data; }, (e) => toast.error(errorMessage(e)));
		loading = false;
	}

	async function action(svcId: string, act: 'restart' | 'start' | 'stop') {
		if (actionLoading[svcId]) return;
		if (act === 'stop' && !confirm(`${$t('system.confirm_stop', 'Stop this service?')} (${svcId})`)) return;
		actionLoading[svcId] = act;
		const result = await apiPost<{ ok: boolean; output: string }>(`/system/services/${encodeURIComponent(svcId)}/${act}?server_id=${serverId}`);
		result.match(
			(data) => {
				if (data.ok) toast.success(`${svcId} — ${$t(`system.action_${act}`, act)}`);
				else toast.error(`${svcId} failed: ${data.output.slice(0, 100)}`);
				setTimeout(load, 2000);
			},
			(e) => toast.error(errorMessage(e))
		);
		delete actionLoading[svcId];
		actionLoading = { ...actionLoading };
	}

	function statusColor(s: string) {
		return s === 'active' ? 'text-success' : s === 'failed' ? 'text-danger' : s === 'activating' ? 'text-warning' : 'text-text-disabled';
	}
	function statusBg(s: string) {
		return s === 'active' ? 'bg-success' : s === 'failed' ? 'bg-danger' : s === 'activating' ? 'bg-warning animate-pulse' : 'bg-border';
	}
	function statusLabel(status: string) {
		const fb: Record<string, string> = { active: 'Running', inactive: 'Stopped', failed: 'Failed', activating: 'Starting', unknown: 'Unknown' };
		return $t(`system.status.${status}`, fb[status] ?? status);
	}

	const systemdServices = $derived(services.filter(s => s.type === 'systemd'));
	const dockerServices  = $derived(services.filter(s => s.type === 'docker'));
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<button onclick={() => showNotes = !showNotes}
			class="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-disabled hover:text-text-secondary hover:bg-surface-raised">
			⚠️ {$t('system.warning_title', 'Notes')}
		</button>
		<button onclick={load}
			class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
			<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
			{$t('common.refresh', 'Refresh')}
		</button>
	</div>

	{#if showNotes}
	<div class="rounded-xl border border-warning/30 bg-warning-bg px-5 py-3 text-xs text-text-secondary space-y-1">
		<ul class="list-disc list-inside space-y-0.5">
			<li>{$t('system.note_core', 'Token Service and Admin UI cannot be stopped via this interface')}</li>
			<li>{$t('system.note_authentik', 'Restarting Authentik will log out all users')}</li>
			<li>{$t('system.note_audit', 'All service actions are recorded in the audit log')}</li>
			<li>{$t('system.note_elk', 'ELK Stack takes ~60 seconds to initialize')}</li>
		</ul>
	</div>
	{/if}

	{#if loading}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each [1,2,3,4,5,6] as _}<SkeletonCard lines={2} />{/each}
		</div>
	{:else}
		{#if dockerServices.length > 0}
		<div class="space-y-3">
			<h2 class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
				<Container size={13} /> {$t('system.docker_services', 'Docker Containers')}
			</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each dockerServices as svc}
				{@const busy = actionLoading[svc.id]}
				<div class={cn('rounded-xl border bg-surface p-4 space-y-3 transition-colors',
					svc.status === 'active' ? 'border-success/30' : svc.status === 'failed' ? 'border-danger/30' : 'border-border')}>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="text-sm font-medium text-text-primary truncate">{svc.label}</div>
							<div class="font-mono text-xs text-text-disabled truncate">{svc.id.replace('docker:', '')}</div>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							<span class={cn('h-2 w-2 rounded-full', statusBg(svc.status))}></span>
							<span class={cn('text-xs font-medium', statusColor(svc.status))}>{statusLabel(svc.status)}</span>
						</div>
					</div>
					{#if isLocal}
					<div class="flex gap-1.5">
						{#if svc.status === 'inactive' || svc.status === 'failed'}
						<button onclick={() => action(svc.id, 'start')} disabled={!!busy}
							class="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-success bg-success-bg hover:bg-success/20 disabled:opacity-50">
							{#if busy === 'start'}<RefreshCw size={11} class="animate-spin" />{:else}<Play size={11} />{/if}{$t('system.action_start', 'Start')}
						</button>
						{:else}
						<button onclick={() => action(svc.id, 'restart')} disabled={!!busy}
							class="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-warning bg-warning-bg hover:bg-warning/20 disabled:opacity-50">
							{#if busy === 'restart'}<RefreshCw size={11} class="animate-spin" />{:else}<RotateCcw size={11} />{/if}{$t('system.action_restart', 'Restart')}
						</button>
						{#if svc.id !== 'docker:yid-token-service' && svc.id !== 'docker:yid-admin-ui'}
						<button onclick={() => action(svc.id, 'stop')} disabled={!!busy}
							class="flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-danger bg-danger-bg hover:bg-danger/20 disabled:opacity-50">
							{#if busy === 'stop'}<RefreshCw size={11} class="animate-spin" />{:else}<Square size={11} />{/if}
						</button>
						{/if}
						{/if}
					</div>
					{:else}
					<span class="text-xs text-text-disabled">{$t('system.remote_readonly', '遠端唯讀')}</span>
					{/if}
				</div>
				{/each}
			</div>
		</div>
		{/if}

		{#if systemdServices.length > 0}
		<div class="space-y-3">
			<h2 class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
				<Server size={13} /> {$t('system.systemd_services', 'Systemd Services')}
			</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each systemdServices as svc}
				{@const busy = actionLoading[svc.id]}
				<div class={cn('rounded-xl border bg-surface p-4 space-y-3',
					svc.status === 'active' ? 'border-success/30' : svc.status === 'failed' ? 'border-danger/30' : 'border-border')}>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="text-sm font-medium text-text-primary truncate">{svc.label}</div>
							<div class="font-mono text-xs text-text-disabled truncate">{svc.id}</div>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							<span class={cn('h-2 w-2 rounded-full', statusBg(svc.status))}></span>
							<span class={cn('text-xs font-medium', statusColor(svc.status))}>{statusLabel(svc.status)}</span>
						</div>
					</div>
					{#if isLocal}
					<div class="flex gap-1.5">
						{#if svc.status === 'inactive' || svc.status === 'failed'}
						<button onclick={() => action(svc.id, 'start')} disabled={!!busy}
							class="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs text-success bg-success-bg hover:bg-success/20 disabled:opacity-50">
							{#if busy === 'start'}<RefreshCw size={11} class="animate-spin" />{:else}<Play size={11} />{/if}{$t('system.action_start', 'Start')}
						</button>
						{:else if svc.status === 'active'}
						<button onclick={() => action(svc.id, 'restart')} disabled={!!busy}
							class="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs text-warning bg-warning-bg hover:bg-warning/20 disabled:opacity-50">
							{#if busy === 'restart'}<RefreshCw size={11} class="animate-spin" />{:else}<RotateCcw size={11} />{/if}{$t('system.action_restart', 'Restart')}
						</button>
						{/if}
					</div>
					{/if}
				</div>
				{/each}
			</div>
		</div>
		{/if}
	{/if}
</div>
