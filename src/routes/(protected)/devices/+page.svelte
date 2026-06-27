<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { Monitor } from '@lucide/svelte';
	import type { Device } from '$lib/types';
	import { t } from '$lib/stores/i18n';
	import SkeletonTable from '$lib/components/ui/SkeletonTable.svelte';

	// ── State ──────────────────────────────────────────────────────────────────
	let devices = $state<Device[]>([]);
	let loading = $state(true);
	let filter = $state<'all' | 'pending' | 'approved' | 'rejected' | 'revoked'>('all');
	let actionLoading = $state<Record<string, boolean>>({});

	// Approve dialog
	let approveDialog = $state<HTMLDialogElement | null>(null);
	let approveTarget = $state<string>('');
	let approveIp = $state('');
	let approveNote = $state('');
	let approveLoading = $state(false);

	// Auto-refresh interval
	let refreshTimer = $state<ReturnType<typeof setInterval> | null>(null);

	// Search + filter
	let searchQ = $state('');

	// ── Derived ────────────────────────────────────────────────────────────────
	const pendingCount = $derived(devices.filter(d => d.status === 'pending').length);

	const filteredDevices = $derived(devices.filter(d => {
		if (filter !== 'all' && d.status !== filter) return false;
		if (searchQ.trim()) {
			const q = searchQ.toLowerCase();
			return d.device_name.toLowerCase().includes(q) ||
				d.user.toLowerCase().includes(q) ||
				(d.allowed_ip ?? '').includes(q);
		}
		return true;
	}));

	// Virtual scroll
	const ROW_HEIGHT = 56;
	const OVERSCAN = 5;
	let devContainerEl = $state<HTMLDivElement | null>(null);
	let devScrollTop = $state(0);
	let devContainerH = $state(500);

	const devVisibleRange = $derived(() => {
		const start = Math.max(0, Math.floor(devScrollTop / ROW_HEIGHT) - OVERSCAN);
		const end = Math.min(filteredDevices.length, Math.ceil((devScrollTop + devContainerH) / ROW_HEIGHT) + OVERSCAN);
		return { start, end };
	});
	const devVisible = $derived(filteredDevices.slice(devVisibleRange().start, devVisibleRange().end));
	const devTotalH = $derived(filteredDevices.length * ROW_HEIGHT);
	const devOffsetY = $derived(devVisibleRange().start * ROW_HEIGHT);

	// ── Auto-refresh on pending tab ────────────────────────────────────────────
	$effect(() => {
		if (filter === 'pending') {
			refreshTimer = setInterval(load, 30_000);
		} else {
			if (refreshTimer) {
				clearInterval(refreshTimer);
				refreshTimer = null;
			}
		}
		return () => {
			if (refreshTimer) {
				clearInterval(refreshTimer);
				refreshTimer = null;
			}
		};
	});

	// ── Load ───────────────────────────────────────────────────────────────────
	async function load() {
		const result = await apiGet<Device[]>('/devices', { silent: true });
		result.match(
			(data) => { devices = data; },
			(e) => { if (!loading) toast.error(errorMessage(e)); }
		);
		loading = false;
	}

	onMount(() => {
		loading = true;
		load();
		if (devContainerEl) {
			const ro = new ResizeObserver(e => { devContainerH = e[0].contentRect.height; });
			ro.observe(devContainerEl);
			return () => ro.disconnect();
		}
	});

	// ── Dialog helpers ──────────────────────────────────────────────────────────
	function openApproveDialog(deviceId: string) {
		approveTarget = deviceId;
		approveIp = '';
		approveNote = '';
		approveDialog?.showModal();
	}

	// ── Actions ────────────────────────────────────────────────────────────────
	async function approveDevice(e: Event) {
		e.preventDefault();
		if (approveLoading) return;
		approveLoading = true;
		const result = await apiPost(`/devices/${approveTarget}/approve`, {
			allowed_ip: approveIp.trim() || null,
			note: approveNote.trim() || null
		});
		result.match(
			() => {
				toast.success($t('devices.approved_toast', 'Device approved'));
				approveDialog?.close();
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		approveLoading = false;
	}

	async function rejectDevice(deviceId: string) {
		if (actionLoading[deviceId]) return;
		actionLoading[deviceId] = true;
		const result = await apiPost(`/devices/${deviceId}/reject`);
		result.match(
			() => { toast.success($t('devices.rejected_toast', 'Device rejected')); load(); },
			(e) => toast.error(errorMessage(e))
		);
		actionLoading[deviceId] = false;
	}

	async function revokeDevice(deviceId: string) {
		if (actionLoading[deviceId]) return;
		actionLoading[deviceId] = true;
		const result = await apiPost(`/devices/${deviceId}/revoke`);
		result.match(
			() => { toast.success($t('devices.revoked_toast', 'Device revoked')); load(); },
			(e) => toast.error(errorMessage(e))
		);
		actionLoading[deviceId] = false;
	}

	function fmt(dateStr: string | null) {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString('zh-TW', { hour12: false });
	}

	const filterLabels: Record<string, () => string> = {
		all: () => $t('devices.filter.all', 'All'),
		pending: () => $t('devices.filter.pending', 'Pending'),
		approved: () => $t('devices.filter.approved', 'Approved'),
		rejected: () => $t('devices.filter.rejected', 'Rejected'),
		revoked: () => $t('devices.filter.revoked', 'Revoked'),
	};
</script>

<svelte:head><title>Devices — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-xl font-bold text-text-primary">{$t('devices.title', 'Devices')}</h1>
		<p class="mt-1 text-sm text-text-secondary">{$t('devices.subtitle', 'Review and manage device access requests')}</p>
	</div>

	<!-- Filter + search -->
	<div class="flex flex-wrap gap-2 items-center">
	<input bind:value={searchQ} placeholder={$t('devices.search_placeholder', 'Search devices...')}
		class="rounded-md border border-border bg-background py-1.5 px-3 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary w-48" />
	<span class="text-xs text-text-disabled">{filteredDevices.length}</span>
	</div>
	<div class="flex gap-1 rounded-lg border border-border bg-surface p-1 w-fit flex-wrap">
		{#each (['all', 'pending', 'approved', 'rejected', 'revoked'] as const) as tab}
			<button
				onclick={() => filter = tab}
				class={cn(
					'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
					filter === tab
						? 'bg-primary text-primary-foreground'
						: 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
				)}
			>
				{filterLabels[tab]()}
				{#if tab === 'pending' && pendingCount > 0}
					<span class={cn(
						'rounded-full px-1.5 py-0.5 text-xs font-bold leading-none',
						filter === 'pending' ? 'bg-primary-foreground text-primary' : 'bg-warning-bg text-warning'
					)}>
						{pendingCount}
					</span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Table -->
	{#if loading}
		<SkeletonTable rows={8} cols={6} />
	{:else if filteredDevices.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-16 text-text-secondary">
			<Monitor size={32} />
			<p class="text-sm">{$t('common.no_data', 'No data')}</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl border border-border bg-surface">
			<div bind:this={devContainerEl}
				 onscroll={e => devScrollTop = (e.currentTarget as HTMLDivElement).scrollTop}
				 class="overflow-auto"
				 style="height: min(520px, calc(100vh - 320px))">
				<table class="w-full border-collapse">
					<thead class="sticky top-0 z-10 bg-surface border-b border-border">
						<tr>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="min-width:140px">{$t('devices.device_name', 'Device Name')}</th>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary hidden sm:table-cell whitespace-nowrap" style="min-width:100px">{$t('dashboard.user', 'User')}</th>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="width:80px">{$t('common.status', 'Status')}</th>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary hidden md:table-cell whitespace-nowrap" style="min-width:110px">{$t('devices.allowed_ip', 'IP')}</th>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary hidden lg:table-cell whitespace-nowrap" style="width:140px">{$t('devices.requested_at', 'Requested')}</th>
							<th class="sticky right-0 z-20 bg-surface border-l border-border px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap">{$t('common.actions', 'Actions')}</th>
						</tr>
					</thead>
					<tbody>
						{#each devVisible as device (device.device_id)}
							<tr class="border-t border-border hover:bg-surface-raised transition-colors">
								<td class="px-4 py-3 text-sm text-text-primary whitespace-nowrap" style="min-width:140px; max-width:180px; overflow:hidden; text-overflow:ellipsis">{device.device_name}</td>
								<td class="px-4 py-3 text-sm font-mono text-text-secondary hidden sm:table-cell whitespace-nowrap" style="min-width:100px; max-width:140px; overflow:hidden; text-overflow:ellipsis">{device.user}</td>
								<td class="px-4 py-3 text-sm whitespace-nowrap" style="width:80px">
									{#if device.status === 'pending'}
										<span class="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">{$t('devices.pending', 'pending')}</span>
									{:else if device.status === 'approved'}
										<span class="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">{$t('devices.approved', 'approved')}</span>
									{:else}
										<span class="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">{device.status}</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-sm font-mono text-text-secondary hidden md:table-cell whitespace-nowrap" style="min-width:110px">{device.allowed_ip ?? '—'}</td>
								<td class="px-4 py-3 text-sm text-text-secondary hidden lg:table-cell whitespace-nowrap" style="width:140px">{fmt(device.requested_at)}</td>
								<td class="sticky right-0 z-20 bg-surface border-l border-border px-4 py-3 text-sm whitespace-nowrap">
									<div class="flex gap-1.5">
										{#if device.status === 'pending'}
											<button onclick={() => openApproveDialog(device.device_id)} disabled={actionLoading[device.device_id]}
												class="rounded-md bg-success-bg px-2 py-1 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50">
												{$t('devices.approve', 'Approve')}
											</button>
											<button onclick={() => rejectDevice(device.device_id)} disabled={actionLoading[device.device_id]}
												class="rounded-md bg-danger-bg px-2 py-1 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50">
												{$t('devices.reject', 'Reject')}
											</button>
										{:else if device.status === 'approved'}
											<button onclick={() => revokeDevice(device.device_id)} disabled={actionLoading[device.device_id]}
												class="rounded-md bg-danger-bg px-2 py-1 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50">
												{$t('devices.revoke', 'Revoke')}
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	{#if filter === 'pending' && pendingCount > 0}
		<p class="text-xs text-text-disabled text-right">Auto-refreshes every 30s</p>
	{/if}
</div>

<!-- Approve Device Dialog -->
<dialog bind:this={approveDialog}>
	<div class="px-6 py-5">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">{$t('devices.approve_title', 'Approve Device')}</h2>
			<button onclick={() => approveDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		<form onsubmit={approveDevice} class="space-y-4">
			<div>
				<label for="dev-approve-ip" class="mb-1 block text-xs font-medium text-text-secondary">{$t('devices.allowed_ip', 'Allowed IP')} (optional)</label>
				<input
					id="dev-approve-ip"
					bind:value={approveIp}
					placeholder={$t('devices.allowed_ip_placeholder', 'Leave blank to allow any IP')}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
				<p class="mt-1 text-xs text-text-disabled">Leave blank to allow any IP</p>
			</div>
			<div>
				<label for="dev-approve-note" class="mb-1 block text-xs font-medium text-text-secondary">{$t('common.note', 'Note')} (optional)</label>
				<input
					id="dev-approve-note"
					bind:value={approveNote}
					placeholder="Approval note…"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
			</div>
			<div class="flex justify-end gap-2">
				<button type="button" onclick={() => approveDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
					{$t('common.cancel', 'Cancel')}
				</button>
				<button
					type="submit"
					disabled={approveLoading}
					class="rounded-md bg-success-bg px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50"
				>
					{approveLoading ? $t('common.saving', 'Saving…') : $t('devices.approve', 'Approve')}
				</button>
			</div>
		</form>
	</div>
</dialog>

<style>
	dialog {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		padding: 0;
		width: 480px;
		max-width: 95vw;
		color: var(--color-text-primary);
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		margin: 0;
		box-shadow: 0 8px 32px rgba(0,0,0,.4);
	}
	dialog::backdrop {
		background: rgba(0,0,0,.55);
	}
</style>
