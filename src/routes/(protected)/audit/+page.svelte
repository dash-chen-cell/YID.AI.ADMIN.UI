<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { toast } from 'svelte-sonner';
	import { ScrollText, Search, Calendar, ChevronDown, X } from '@lucide/svelte';
	import type { AuditEvent } from '$lib/types';
	import { t } from '$lib/stores/i18n';
	import SkeletonTable from '$lib/components/ui/SkeletonTable.svelte';

	// ── State ──────────────────────────────────────────────────────────────────
	let events = $state<AuditEvent[]>([]);
	let loading = $state(true);
	let filterEventType = $state('');
	let filterUser = $state('');
	let eventTypes = $state<string[]>([]);
	let showSuggestions = $state(false);
	const filteredSuggestions = $derived(
		filterEventType.trim()
			? eventTypes.filter(t => t.includes(filterEventType.toLowerCase()))
			: eventTypes
	);

	// Detail modal
	let detailEvent = $state<AuditEvent | null>(null);

	// Date filters — default to today
	function todayStart() {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d.toISOString().slice(0, 10);
	}
	function todayEnd() {
		const d = new Date();
		d.setHours(23, 59, 59, 999);
		return d.toISOString().slice(0, 10);
	}

	let fromDate = $state(todayStart());
	let toDate = $state(todayEnd());

	// Virtual scroll
	const ROW_HEIGHT = 48;
	const OVERSCAN = 5;
	let containerEl = $state<HTMLDivElement | null>(null);
	let scrollTop = $state(0);
	let containerHeight = $state(600);

	const visibleRange = $derived(() => {
		const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
		const end = Math.min(events.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
		return { start, end };
	});

	const visibleEvents = $derived(events.slice(visibleRange().start, visibleRange().end));
	const totalHeight = $derived(events.length * ROW_HEIGHT);
	const offsetY = $derived(visibleRange().start * ROW_HEIGHT);

	// ── Load ───────────────────────────────────────────────────────────────────
	async function load() {
		loading = true;
		const params = new URLSearchParams({ limit: '500' });
		if (filterEventType.trim()) params.set('event_type', filterEventType.trim());
		if (filterUser.trim()) params.set('user', filterUser.trim());
		if (fromDate) params.set('from_date', fromDate + 'T00:00:00');
		if (toDate) params.set('to_date', toDate + 'T23:59:59');
		const result = await apiGet<AuditEvent[]>(`/audit?${params.toString()}`, { silent: true });
		result.match(
			(data) => { events = data; },
			(e) => toast.error(errorMessage(e))
		);
		loading = false;
	}

	onMount(() => {
		// Load event types for combobox (async, fire-and-forget)
		(async () => {
			const typesResult = await apiGet<string[]>('/audit/event-types');
			typesResult.match((data) => { eventTypes = data; }, () => {});
			load();
		})();
		if (containerEl) {
			const ro = new ResizeObserver(entries => {
				containerHeight = entries[0].contentRect.height;
			});
			ro.observe(containerEl);
			return () => ro.disconnect();
		}
	});

	// ── Helpers ────────────────────────────────────────────────────────────────
	function openDetail(event: AuditEvent) {
		detailEvent = event;
	}

	function closeDetail() {
		detailEvent = null;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') load();
	}

	function fmt(dateStr: string) {
		return new Date(dateStr).toLocaleString('zh-TW', { hour12: false });
	}

	function parseDetails(details: string | null): Record<string, unknown> {
		if (!details) return {};
		try { return JSON.parse(details); } catch { return { raw: details }; }
	}

	function prettyJson(details: string | null): string {
		if (!details) return '';
		try { return JSON.stringify(JSON.parse(details), null, 2); }
		catch { return details; }
	}

	function summarizeDetail(details: string | null): string {
		const obj = parseDetails(details);
		const keys = Object.keys(obj);
		if (keys.length === 0) return '';
		return keys.slice(0, 3).map(k => `${k}: ${String(obj[k])}`).join(', ') + (keys.length > 3 ? ', …' : '');
	}

	// Close modal on Escape
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeDetail();
	}
</script>

<svelte:head><title>Audit Log — YID AI Admin</title></svelte:head>

<div class="space-y-4">
	<!-- Header -->
	<div>
		<h1 class="text-xl font-bold text-text-primary">{$t('audit.title', 'Audit Log')}</h1>
		<p class="mt-1 text-sm text-text-secondary">{$t('audit.subtitle', 'Platform activity and security events')}</p>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap gap-2">
		<!-- Date range -->
		<div class="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5">
			<Calendar size={13} class="text-text-disabled shrink-0" />
			<input
				type="date"
				bind:value={fromDate}
				class="bg-transparent text-sm text-text-primary outline-none w-32"
			/>
			<span class="text-text-disabled text-xs">—</span>
			<input
				type="date"
				bind:value={toDate}
				class="bg-transparent text-sm text-text-primary outline-none w-32"
			/>
		</div>

		<!-- Event type combobox -->
		<div class="relative">
			<Search size={13} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled" />
			<input
				bind:value={filterEventType}
				onfocus={() => showSuggestions = true}
				onblur={() => setTimeout(() => showSuggestions = false, 150)}
				onkeydown={handleKeyDown}
				placeholder={$t('audit.event_type', 'Event type')}
				class="w-48 rounded-md border border-border bg-background py-1.5 pl-8 pr-7 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
			/>
			<ChevronDown size={12} class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-disabled" />
			{#if showSuggestions && filteredSuggestions.length > 0}
			<div class="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-border bg-surface shadow-lg overflow-hidden">
				{#each filteredSuggestions as type}
				<button
					type="button"
					onmousedown={() => { filterEventType = type; showSuggestions = false; }}
					class="w-full px-3 py-2 text-left text-xs font-mono text-text-primary hover:bg-surface-raised transition-colors"
				>
					{type}
				</button>
				{/each}
			</div>
			{/if}
		</div>

		<!-- Username -->
		<div class="relative">
			<Search size={13} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled" />
			<input
				bind:value={filterUser}
				onkeydown={handleKeyDown}
				placeholder={$t('common.username', 'Username')}
				class="w-36 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
			/>
		</div>

		<button
			onclick={load}
			disabled={loading}
			class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
		>
			{loading ? $t('common.loading', 'Loading…') : $t('common.search', 'Search')}
		</button>
	</div>

	<!-- Table -->
	{#if loading}
		<SkeletonTable rows={8} cols={5} />
	{:else if events.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-16 text-text-secondary">
			<ScrollText size={32} />
			<p class="text-sm">{$t('audit.no_events', 'No events found')}</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl border border-border bg-surface">
			<div class="border-b border-border px-5 py-3">
				<span class="text-xs text-text-secondary">{events.length} {$t('audit.events_count', 'events')}</span>
			</div>

			<!-- Column headers -->
			<div class="overflow-x-auto border-b border-border">
				<table class="w-full border-collapse">
					<thead>
						<tr>
							<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="min-width:160px">{$t('audit.event_type', 'Event Type')}</th>
							<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="min-width:100px">{$t('dashboard.user', 'User')}</th>
							<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary hidden sm:table-cell whitespace-nowrap" style="min-width:100px">{$t('audit.ip', 'IP')}</th>
							<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="width:140px">{$t('dashboard.time', 'Time')}</th>
							<th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap">{$t('audit.detail', 'Detail')}</th>
						</tr>
					</thead>
				</table>
			</div>

			<!-- Virtual scroll body -->
			<div
				bind:this={containerEl}
				onscroll={(e) => scrollTop = (e.currentTarget as HTMLDivElement).scrollTop}
				class="overflow-y-auto overflow-x-auto"
				style="height: min(600px, calc(100vh - 320px))"
			>
				<div style="height: {totalHeight}px; position: relative;">
					<table class="w-full border-collapse" style="position: absolute; top: {offsetY}px; left: 0; right: 0;">
						<tbody>
							{#each visibleEvents as event (event.id)}
								<tr class="border-t border-border hover:bg-surface-raised transition-colors">
									<td class="px-5 py-3 text-sm font-mono text-text-primary whitespace-nowrap" style="min-width:160px">{event.event_type}</td>
									<td class="px-5 py-3 text-sm font-mono text-text-secondary whitespace-nowrap" style="min-width:100px">
										{event.actor ?? '—'}
										{#if event.target_user && event.target_user !== event.actor}
											<span class="text-text-disabled"> → {event.target_user}</span>
										{/if}
									</td>
									<td class="px-5 py-3 text-sm font-mono text-text-secondary hidden sm:table-cell whitespace-nowrap" style="min-width:100px">{event.ip_address ?? '—'}</td>
									<td class="px-5 py-3 text-sm text-text-secondary whitespace-nowrap" style="width:140px">{fmt(event.created_at)}</td>
									<td class="px-5 py-3 text-sm whitespace-nowrap">
										{#if event.details}
											<button onclick={() => openDetail(event)} class="text-xs text-left max-w-xs">
												<span class="truncate block text-text-disabled">{summarizeDetail(event.details)}</span>
												<span class="text-primary underline text-xs">{$t('audit.expand', 'expand')}</span>
											</button>
										{:else}
											<span class="text-xs text-text-disabled">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{/if}
</div>

<svelte:window onkeydown={onKeydown} />

<!-- Detail Modal -->
{#if detailEvent}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
	role="presentation" onclick={closeDetail} onkeydown={e => e.key === 'Escape' && closeDetail()}>
	<div class="w-full max-w-2xl rounded-xl border border-border bg-surface shadow-2xl"
		role="dialog" aria-modal="true" tabindex="-1"
		onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
		<!-- Modal header -->
		<div class="flex items-center justify-between border-b border-border px-5 py-3.5">
			<div class="flex items-center gap-3">
				<span class="font-mono text-sm font-semibold text-text-primary">{detailEvent.event_type}</span>
				<span class="text-xs text-text-disabled">{fmt(detailEvent.created_at)}</span>
				{#if detailEvent.actor}
				<span class="text-xs text-text-secondary font-mono">{detailEvent.actor}</span>
				{/if}
				{#if detailEvent.ip_address}
				<span class="text-xs text-text-disabled">{detailEvent.ip_address}</span>
				{/if}
			</div>
			<button onclick={closeDetail} class="rounded p-1 text-text-disabled hover:text-text-primary hover:bg-surface-raised transition-colors">
				<X size={16} />
			</button>
		</div>

		<!-- JSON viewer with line numbers -->
		<div class="overflow-auto max-h-[70vh] rounded-b-xl">
			{#if detailEvent.details}
			{@const lines = prettyJson(detailEvent.details).split('\n')}
			<div class="flex font-mono text-xs">
				<!-- Line numbers -->
				<div class="select-none border-r border-border bg-background px-3 py-4 text-right text-text-disabled leading-5 shrink-0">
					{#each lines as _, i}
					<div>{i + 1}</div>
					{/each}
				</div>
				<!-- Code -->
				<pre class="flex-1 overflow-x-auto px-4 py-4 text-text-secondary leading-5 bg-background">{prettyJson(detailEvent.details)}</pre>
			</div>
			{:else}
			<div class="px-5 py-8 text-center text-text-disabled text-sm">No detail data</div>
			{/if}
		</div>
	</div>
</div>
{/if}
