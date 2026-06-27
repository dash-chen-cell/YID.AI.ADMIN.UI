<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet } from '$lib/api/client';
	import type { DashboardStats } from '$lib/types';
	import { Users, Monitor, Key, AlertCircle, Clock } from '@lucide/svelte';
	import { t } from '$lib/stores/i18n';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';

	interface ExpiringToken { token_id: string; user: string; days_left: number; note: string | null; }

	let stats = $state<DashboardStats | null>(null);
	let expiringTokens = $state<ExpiringToken[]>([]);
	let error = $state<string | null>(null);
	let loading = $state(true);

	onMount(async () => {
		const [statsResult, expiringResult] = await Promise.all([
			apiGet<DashboardStats>('/dashboard', { silent: true }),
			apiGet<ExpiringToken[]>('/tokens/expiring?days=30', { silent: true }),
		]);
		statsResult.match(
			(data) => { stats = data; },
			(e) => { error = e.type === 'api' ? e.message : 'Failed to load'; }
		);
		expiringResult.match((data) => { expiringTokens = data; }, () => {});
		loading = false;
	});

	const cards = $derived(stats ? [
		{ label: $t('dashboard.total_users', 'Total Users'),     value: stats.user_count,        sub: `${stats.active_user_count} ${$t('dashboard.active_users', 'active')}`, icon: Users,         color: 'text-primary' },
		{ label: $t('dashboard.pending_devices', 'Pending Devices'), value: stats.pending_device_count, sub: 'awaiting approval',             icon: Monitor,       color: 'text-warning' },
		{ label: $t('dashboard.active_tokens', 'Active Tokens'),   value: stats.active_token_count, sub: 'issued tokens',                   icon: Key,           color: 'text-success' },
	] : []);
</script>

<svelte:head><title>Dashboard — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-bold text-text-primary">{$t('dashboard.title', 'Dashboard')}</h1>
		<p class="mt-1 text-sm text-text-secondary">{$t('dashboard.subtitle', 'Platform overview')}</p>
	</div>

	{#if loading}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			{#each [1,2,3] as _}
				<SkeletonCard lines={2} />
			{/each}
		</div>
	{:else if error}
		<div class="flex items-center gap-2 rounded-xl border border-danger bg-danger-bg p-4 text-sm text-danger">
			<AlertCircle size={16} />
			{error}
		</div>
	{:else if stats}
		<!-- Token expiry warnings -->
		{#if expiringTokens.length > 0}
		{@const critical = expiringTokens.filter(t => t.days_left <= 7)}
		{@const warning = expiringTokens.filter(t => t.days_left > 7)}
		<div class={`rounded-xl border px-5 py-4 flex items-start gap-3 ${critical.length > 0 ? 'border-danger/40 bg-danger-bg' : 'border-warning/40 bg-warning-bg'}`}>
			<Clock size={16} class={critical.length > 0 ? 'text-danger mt-0.5 shrink-0' : 'text-warning mt-0.5 shrink-0'} />
			<div class="text-sm">
				<p class={`font-medium ${critical.length > 0 ? 'text-danger' : 'text-warning'}`}>
					{critical.length > 0 ? `⚠️ ${critical.length} 個 Token 將在 7 天內到期` : `📅 ${warning.length} 個 Token 將在 30 天內到期`}
				</p>
				<div class="mt-1 flex flex-wrap gap-2">
					{#each expiringTokens.slice(0, 5) as t}
					<span class="rounded bg-background px-2 py-0.5 text-xs font-mono">
						{t.user}（{t.days_left} 天）
					</span>
					{/each}
					{#if expiringTokens.length > 5}
					<span class="text-xs text-text-disabled">+{expiringTokens.length - 5} 個</span>
					{/if}
				</div>
			</div>
		</div>
		{/if}

		<!-- Stats cards -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			{#each cards as card}
				<div class="rounded-xl border border-border bg-surface p-5">
					<div class="flex items-start justify-between">
						<div>
							<p class="text-xs font-medium uppercase tracking-wide text-text-secondary">{card.label}</p>
							<p class="mt-2 text-3xl font-bold text-text-primary">{card.value}</p>
							<p class="mt-1 text-xs text-text-secondary">{card.sub}</p>
						</div>
						<div class={card.color}>
							<card.icon size={20} />
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Recent audit -->
		{#if stats.recent_audit.length > 0}
		<div class="rounded-xl border border-border bg-surface">
			<div class="border-b border-border px-5 py-4">
				<h2 class="text-sm font-semibold text-text-primary">{$t('dashboard.recent_activity', 'Recent Activity')}</h2>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr>
							<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('dashboard.event', 'Event')}</th>
							<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('dashboard.user', 'User')}</th>
							<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('dashboard.time', 'Time')}</th>
						</tr>
					</thead>
					<tbody>
						{#each stats.recent_audit as event}
						<tr class="border-t border-border hover:bg-surface-raised transition-colors">
							<td class="px-5 py-3 text-sm font-mono text-text-primary">{event.event_type}</td>
							<td class="px-5 py-3 text-sm text-text-secondary">{event.actor ?? '—'}</td>
							<td class="px-5 py-3 text-sm text-text-secondary">
								{new Date(event.created_at).toLocaleString('zh-TW', { hour12: false })}
							</td>
						</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		{/if}
	{/if}
</div>
