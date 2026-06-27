<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { apiGet, apiPost, apiPatch, apiDelete } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { ArrowLeft, UserCheck, UserX, AlertCircle, KeyRound, Copy, Check, Pencil } from '@lucide/svelte';
	import type { User, Token, Device, AuditEvent } from '$lib/types';
	import { t } from '$lib/stores/i18n';

	// ── Page param ──────────────────────────────────────────────────────────────
	const username = page.params.username;

	// ── State ──────────────────────────────────────────────────────────────────
	let user = $state<User | null>(null);
	let tokens = $state<Token[]>([]);
	let devices = $state<Device[]>([]);
	let audit = $state<AuditEvent[]>([]);
	let loading = $state(true);
	let activeTab = $state<'tokens' | 'devices' | 'audit'>('tokens');
	let actionLoading = $state<Record<string, boolean>>({});
	let toggleLoading = $state(false);

	// Approve device dialog
	let approveDialog = $state<HTMLDialogElement | null>(null);
	let approveTarget = $state<string>('');
	let approveIp = $state('');
	let approveNote = $state('');
	let approveLoading = $state(false);

	// Revoke token dialog
	let revokeTokenDialog = $state<HTMLDialogElement | null>(null);
	let revokeTokenTarget = $state<string>('');
	let revokeTokenLoading = $state(false);

	// Expanded audit rows
	let expandedAudit = $state<Set<string>>(new Set());

	// ── Load ───────────────────────────────────────────────────────────────────
	async function load() {
		loading = true;
		const result = await apiGet<{ user: User; tokens: Token[]; devices: Device[]; audit: AuditEvent[] }>(`/users/${username}`);
		result.match(
			(data) => {
				user = data.user;
				tokens = data.tokens;
				devices = data.devices;
				audit = data.audit;
			},
			(e) => toast.error(errorMessage(e))
		);
		loading = false;
	}

	onMount(load);

	// ── Dialog helpers ──────────────────────────────────────────────────────────
	function openApproveDialog(deviceId: string) {
		approveTarget = deviceId;
		approveIp = '';
		approveNote = '';
		approveDialog?.showModal();
	}

	function openRevokeTokenDialog(tokenId: string) {
		revokeTokenTarget = tokenId;
		revokeTokenDialog?.showModal();
	}

	function toggleAuditDetail(id: string) {
		const next = new Set(expandedAudit);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedAudit = next;
	}

	// ── Actions ────────────────────────────────────────────────────────────────
	async function toggleUserStatus() {
		if (!user || toggleLoading) return;
		toggleLoading = true;
		const endpoint = user.disabled ? `/users/${username}/enable` : `/users/${username}/disable`;
		const result = await apiPost(endpoint);
		result.match(
			() => {
				toast.success(user!.disabled ? `${username} enabled` : `${username} disabled`);
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		toggleLoading = false;
	}

	// ── Edit email ─────────────────────────────────────────────────────────────
	let editEmailDialog = $state<HTMLDialogElement | null>(null);
	let editEmailValue = $state('');
	let editEmailLoading = $state(false);

	function openEditEmail() {
		editEmailValue = user?.email ?? '';
		editEmailDialog?.showModal();
	}

	async function saveEmail(e: Event) {
		e.preventDefault();
		if (editEmailLoading) return;
		editEmailLoading = true;
		const result = await apiPatch<User>(`/users/${username}`, { email: editEmailValue.trim() });
		result.match(
			() => {
				toast.success($t('users.email_updated', 'Email updated'));
				editEmailDialog?.close();
				load();
			},
			(err) => toast.error(errorMessage(err))
		);
		editEmailLoading = false;
	}

	// ── Password recovery link (admin-assisted credential reset) ───────────────
	let recoveryDialog = $state<HTMLDialogElement | null>(null);
	let recoveryLink = $state<string | null>(null);
	let recoveryLoading = $state(false);
	let recoveryCopied = $state(false);

	async function generateRecoveryLink() {
		if (recoveryLoading) return;
		recoveryLoading = true;
		recoveryLink = null;
		recoveryCopied = false;
		recoveryDialog?.showModal();
		const result = await apiPost<{ link: string }>(`/users/${username}/recovery-link`);
		result.match(
			(data) => { recoveryLink = data.link; },
			(e) => { toast.error(errorMessage(e)); recoveryDialog?.close(); }
		);
		recoveryLoading = false;
	}

	async function copyRecoveryLink() {
		if (!recoveryLink) return;
		try {
			await navigator.clipboard.writeText(recoveryLink);
			recoveryCopied = true;
			setTimeout(() => { recoveryCopied = false; }, 2000);
		} catch {
			toast.error($t('users.copy_failed', 'Copy failed'));
		}
	}

	async function revokeToken(e: Event) {
		e.preventDefault();
		if (revokeTokenLoading) return;
		revokeTokenLoading = true;
		const result = await apiDelete(`/tokens/${revokeTokenTarget}`);
		result.match(
			() => {
				toast.success('Token revoked');
				revokeTokenDialog?.close();
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		revokeTokenLoading = false;
	}

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
				toast.success('Device approved');
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
			() => { toast.success('Device rejected'); load(); },
			(e) => toast.error(errorMessage(e))
		);
		actionLoading[deviceId] = false;
	}

	async function revokeDevice(deviceId: string) {
		if (actionLoading[deviceId]) return;
		actionLoading[deviceId] = true;
		const result = await apiPost(`/devices/${deviceId}/revoke`);
		result.match(
			() => { toast.success('Device revoked'); load(); },
			(e) => toast.error(errorMessage(e))
		);
		actionLoading[deviceId] = false;
	}

	function fmt(dateStr: string | null) {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString('zh-TW', { hour12: false });
	}

	function truncateToken(id: string) {
		return id.length > 12 ? id.slice(0, 12) + '…' : id;
	}

	const tabLabels: Record<string, () => string> = {
		tokens: () => $t('users.tabs.tokens', 'Tokens'),
		devices: () => $t('users.tabs.devices', 'Devices'),
		audit: () => $t('users.tabs.audit', 'Audit'),
	};
</script>

<svelte:head><title>{username} — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<!-- Back + header -->
	<div class="flex items-start gap-4">
		<button onclick={() => goto('/users')} class="mt-1 flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
			<ArrowLeft size={14} />
			{$t('users.title', 'Users')}
		</button>
	</div>

	{#if loading}
		<div class="space-y-4">
			<div class="h-36 animate-pulse rounded-xl border border-border bg-surface"></div>
			<div class="h-64 animate-pulse rounded-xl border border-border bg-surface"></div>
		</div>
	{:else if user}
		<!-- User info card -->
		<div class="rounded-xl border border-border bg-surface p-5">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="space-y-1">
					<div class="flex items-center gap-2">
						<h1 class="text-xl font-bold text-text-primary font-mono">{user.username}</h1>
						{#if user.role === 'admin'}
							<span class="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary">admin</span>
						{:else}
							<span class="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-text-secondary">user</span>
						{/if}
						{#if user.disabled}
							<span class="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">{$t('users.disabled', 'disabled')}</span>
						{:else}
							<span class="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">{$t('users.active', 'active')}</span>
						{/if}
					</div>
					{#if user.display_name}
						<p class="text-sm text-text-secondary">{user.display_name}</p>
					{/if}
					<div class="flex items-center gap-1.5">
						<p class="text-sm text-text-secondary">
							{user.email || $t('users.no_email', '(no email)')}
						</p>
						<button
							onclick={openEditEmail}
							aria-label={$t('users.edit_email', 'Edit email')}
							title={$t('users.edit_email', 'Edit email')}
							class="rounded p-0.5 text-text-disabled hover:bg-surface-raised hover:text-text-secondary">
							<Pencil size={12} />
						</button>
					</div>
					<p class="text-xs text-text-disabled">Created {fmt(user.created_at)}</p>
				</div>
				<div class="flex items-center gap-2">
					<button
						onclick={generateRecoveryLink}
						disabled={recoveryLoading}
						class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-raised hover:text-text-primary disabled:opacity-50"
						title={$t('users.recovery_help', 'Generate a password reset link for this user to log in via SSO')}
					>
						<KeyRound size={14} />
						{$t('users.recovery_link', 'Reset link')}
					</button>
					<button
						onclick={toggleUserStatus}
						disabled={toggleLoading}
						class={cn(
							'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50',
							user.disabled
								? 'bg-success-bg text-success hover:bg-success/20'
								: 'bg-danger-bg text-danger hover:bg-danger/20'
						)}
					>
						{#if user.disabled}
							<UserCheck size={14} />
							{toggleLoading ? $t('common.saving', 'Saving…') : $t('users.enable', 'Enable')}
						{:else}
							<UserX size={14} />
							{toggleLoading ? $t('common.saving', 'Saving…') : $t('users.disable', 'Disable')}
						{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- Tabs -->
		<div>
			<div class="flex gap-1 border-b border-border">
				{#each (['tokens', 'devices', 'audit'] as const) as tab}
					<button
						onclick={() => activeTab = tab}
						class={cn(
							'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
							activeTab === tab
								? 'border-primary text-primary'
								: 'border-transparent text-text-secondary hover:text-text-primary'
						)}
					>
						{tabLabels[tab]()}
						{#if tab === 'tokens'}
							<span class="ml-1 rounded-full bg-surface-raised px-1.5 text-xs text-text-secondary">{tokens.length}</span>
						{:else if tab === 'devices'}
							<span class="ml-1 rounded-full bg-surface-raised px-1.5 text-xs text-text-secondary">{devices.length}</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Tokens tab -->
			{#if activeTab === 'tokens'}
				<div class="mt-4">
					{#if tokens.length === 0}
						<div class="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-12 text-text-secondary">
							<p class="text-sm">{$t('common.no_data', 'No data')}</p>
						</div>
					{:else}
						<div class="overflow-hidden rounded-xl border border-border bg-surface">
							<div class="overflow-x-auto">
								<table class="w-full">
									<thead>
										<tr>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">Token ID</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('tokens.scopes', 'Scopes')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('tokens.issued_at', 'Issued')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('tokens.expires_at', 'Expires')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('common.status', 'Status')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('common.actions', 'Actions')}</th>
										</tr>
									</thead>
									<tbody>
										{#each tokens as token}
											{@const expired = new Date(token.expires_at) < new Date()}
											<tr class={cn('border-t border-border hover:bg-surface-raised transition-colors', (token.revoked || expired) && 'opacity-50')}>
												<td class="px-5 py-3 text-sm font-mono text-text-primary">{truncateToken(token.token_id)}</td>
												<td class="px-5 py-3 text-sm text-text-secondary">{token.scopes.join(', ')}</td>
												<td class="px-5 py-3 text-sm text-text-secondary">{fmt(token.issued_at)}</td>
												<td class="px-5 py-3 text-sm text-text-secondary">{fmt(token.expires_at)}</td>
												<td class="px-5 py-3 text-sm">
													{#if token.revoked}
														<span class="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">{$t('tokens.revoked', 'revoked')}</span>
													{:else if expired}
														<span class="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">{$t('tokens.expired', 'expired')}</span>
													{:else}
														<span class="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">{$t('tokens.active', 'active')}</span>
													{/if}
												</td>
												<td class="px-5 py-3 text-sm">
													{#if !token.revoked && !expired}
														<button
															onclick={() => openRevokeTokenDialog(token.token_id)}
															class="rounded-md bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/20"
														>
															{$t('tokens.revoke', 'Revoke')}
														</button>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Devices tab -->
			{#if activeTab === 'devices'}
				<div class="mt-4">
					{#if devices.length === 0}
						<div class="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-12 text-text-secondary">
							<p class="text-sm">{$t('common.no_data', 'No data')}</p>
						</div>
					{:else}
						<div class="overflow-hidden rounded-xl border border-border bg-surface">
							<div class="overflow-x-auto">
								<table class="w-full">
									<thead>
										<tr>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('devices.device_name', 'Device Name')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('common.status', 'Status')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('devices.allowed_ip', 'Allowed IP')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('devices.requested_at', 'Requested')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('common.actions', 'Actions')}</th>
										</tr>
									</thead>
									<tbody>
										{#each devices as device}
											<tr class="border-t border-border hover:bg-surface-raised transition-colors">
												<td class="px-5 py-3 text-sm text-text-primary">{device.device_name}</td>
												<td class="px-5 py-3 text-sm">
													{#if device.status === 'pending'}
														<span class="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">{$t('devices.pending', 'pending')}</span>
													{:else if device.status === 'approved'}
														<span class="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">{$t('devices.approved', 'approved')}</span>
													{:else}
														<span class="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">{device.status}</span>
													{/if}
												</td>
												<td class="px-5 py-3 text-sm font-mono text-text-secondary">{device.allowed_ip ?? '—'}</td>
												<td class="px-5 py-3 text-sm text-text-secondary">{fmt(device.requested_at)}</td>
												<td class="px-5 py-3 text-sm">
													<div class="flex gap-1.5">
														{#if device.status === 'pending'}
															<button
																onclick={(e) => { e.stopPropagation(); openApproveDialog(device.device_id); }}
																disabled={actionLoading[device.device_id]}
																class="rounded-md bg-success-bg px-2.5 py-1 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50"
															>
																{$t('devices.approve', 'Approve')}
															</button>
															<button
																onclick={(e) => { e.stopPropagation(); rejectDevice(device.device_id); }}
																disabled={actionLoading[device.device_id]}
																class="rounded-md bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
															>
																{$t('devices.reject', 'Reject')}
															</button>
														{:else if device.status === 'approved'}
															<button
																onclick={(e) => { e.stopPropagation(); revokeDevice(device.device_id); }}
																disabled={actionLoading[device.device_id]}
																class="rounded-md bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
															>
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
				</div>
			{/if}

			<!-- Audit tab -->
			{#if activeTab === 'audit'}
				<div class="mt-4">
					{#if audit.length === 0}
						<div class="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-12 text-text-secondary">
							<p class="text-sm">{$t('audit.no_events', 'No audit events')}</p>
						</div>
					{:else}
						<div class="overflow-hidden rounded-xl border border-border bg-surface">
							<div class="overflow-x-auto">
								<table class="w-full">
									<thead>
										<tr>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('audit.event_type', 'Event')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('audit.ip', 'IP')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('dashboard.time', 'Time')}</th>
											<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">{$t('audit.detail', 'Detail')}</th>
										</tr>
									</thead>
									<tbody>
										{#each audit as event}
											<tr class="border-t border-border hover:bg-surface-raised transition-colors">
												<td class="px-5 py-3 text-sm font-mono text-text-primary">{event.event_type}</td>
												<td class="px-5 py-3 text-sm font-mono text-text-secondary">{event.ip_address ?? '—'}</td>
												<td class="px-5 py-3 text-sm text-text-secondary">{fmt(event.created_at)}</td>
												<td class="px-5 py-3 text-sm">
													{#if event.details}
														<button
															onclick={() => toggleAuditDetail(event.id)}
															class="text-xs text-text-secondary hover:text-text-primary underline"
														>
															{expandedAudit.has(event.id) ? $t('audit.collapse', 'hide') : $t('audit.expand', 'show')}
														</button>
														{#if expandedAudit.has(event.id)}
															<pre class="mt-1 max-w-xs overflow-auto rounded bg-background p-2 text-xs text-text-secondary">{event.details}</pre>
														{/if}
													{:else}
														<span class="text-text-disabled text-xs">—</span>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
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
				<label for="approve-ip" class="mb-1 block text-xs font-medium text-text-secondary">{$t('devices.allowed_ip', 'Allowed IP')} (optional)</label>
				<input
					id="approve-ip"
					bind:value={approveIp}
					placeholder={$t('devices.allowed_ip_placeholder', 'Leave blank to allow any IP')}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
				<p class="mt-1 text-xs text-text-disabled">Leave blank to allow any IP</p>
			</div>
			<div>
				<label for="approve-note" class="mb-1 block text-xs font-medium text-text-secondary">{$t('common.note', 'Note')} (optional)</label>
				<input
					id="approve-note"
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

<!-- Revoke Token Dialog -->
<dialog bind:this={revokeTokenDialog}>
	<div class="px-6 py-5">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">{$t('tokens.revoke', 'Revoke Token')}</h2>
			<button onclick={() => revokeTokenDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		<p class="mb-5 text-sm text-text-secondary">
			{$t('tokens.confirm_revoke', 'Revoke this token?')} <span class="font-mono font-medium text-text-primary">{truncateToken(revokeTokenTarget)}</span>
		</p>
		<form onsubmit={revokeToken}>
			<div class="flex justify-end gap-2">
				<button type="button" onclick={() => revokeTokenDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
					{$t('common.cancel', 'Cancel')}
				</button>
				<button
					type="submit"
					disabled={revokeTokenLoading}
					class="rounded-md bg-danger-bg px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
				>
					{revokeTokenLoading ? $t('common.saving', 'Saving…') : $t('tokens.revoke', 'Revoke')}
				</button>
			</div>
		</form>
	</div>
</dialog>

<!-- Password recovery link dialog -->
<dialog bind:this={recoveryDialog}>
	<div class="px-6 py-5">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">{$t('users.recovery_title', 'Password Reset Link')}</h2>
			<button onclick={() => recoveryDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		<p class="mb-4 text-sm text-text-secondary">
			{$t('users.recovery_desc', 'Share this one-time link with')}
			<span class="font-mono font-medium text-text-primary">{username}</span>
			{$t('users.recovery_desc2', 'so they can set their own password and sign in via SSO. The link is single-use and expires.')}
		</p>

		{#if recoveryLoading}
			<div class="h-20 animate-pulse rounded-md border border-border bg-surface-raised"></div>
		{:else if recoveryLink}
			<div class="flex items-stretch gap-2">
				<input
					type="text"
					readonly
					value={recoveryLink}
					class="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-text-secondary"
				/>
				<button
					onclick={copyRecoveryLink}
					class="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
				>
					{#if recoveryCopied}
						<Check size={13} /> {$t('common.copied', 'Copied')}
					{:else}
						<Copy size={13} /> {$t('common.copy', 'Copy')}
					{/if}
				</button>
			</div>
			<p class="mt-3 flex items-start gap-1.5 text-xs text-warning">
				<AlertCircle size={13} class="mt-0.5 shrink-0" />
				{$t('users.recovery_warn', 'Send via a secure channel. Anyone with this link can set the password. This action was recorded in the audit log.')}
			</p>
		{/if}

		<div class="mt-5 flex justify-end">
			<button type="button" onclick={() => recoveryDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
				{$t('common.close', 'Close')}
			</button>
		</div>
	</div>
</dialog>

<!-- Edit email dialog -->
<dialog bind:this={editEmailDialog}>
	<div class="px-6 py-5">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">{$t('users.edit_email_title', 'Edit Email')}</h2>
			<button onclick={() => editEmailDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		<form onsubmit={saveEmail}>
			<label for="edit-email" class="mb-1.5 block text-xs font-medium text-text-secondary">
				{$t('users.email', 'Email')}
			</label>
			<input
				id="edit-email"
				type="email"
				bind:value={editEmailValue}
				placeholder={$t('users.email_placeholder', 'alice@company.com')}
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
			/>
			<p class="mt-2 text-xs text-text-disabled">
				{$t('users.email_unique_hint', 'Must be unique. Leave blank to clear. Changes sync to SSO.')}
			</p>
			<div class="mt-5 flex justify-end gap-2">
				<button type="button" onclick={() => editEmailDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
					{$t('common.cancel', 'Cancel')}
				</button>
				<button
					type="submit"
					disabled={editEmailLoading}
					class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
					{editEmailLoading ? $t('common.saving', 'Saving…') : $t('common.save', 'Save')}
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
