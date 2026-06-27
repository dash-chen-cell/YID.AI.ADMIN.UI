<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiGet, apiPost } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { Users, Plus, UserCheck, UserX, AlertCircle, KeyRound } from '@lucide/svelte';
	import type { User } from '$lib/types';
	import { t } from '$lib/stores/i18n';
	import SkeletonTable from '$lib/components/ui/SkeletonTable.svelte';

	// ── State ──────────────────────────────────────────────────────────────────
	let users = $state<User[]>([]);
	let loading = $state(true);
	let filter = $state<'all' | 'active' | 'disabled'>('all');
	let actionLoading = $state<Record<string, boolean>>({});

	// New user dialog
	let newUserDialog = $state<HTMLDialogElement | null>(null);
	let newUsername = $state('');
	let newDisplayName = $state('');
	let newEmail = $state('');
	let newRole = $state<'admin' | 'user'>('user');
	let newUserLoading = $state(false);

	// Disable dialog
	let disableDialog = $state<HTMLDialogElement | null>(null);
	let disableTarget = $state<string>('');
	let disableReason = $state('');
	let disableLoading = $state(false);

	// Set password dialog
	let passwordDialog = $state<HTMLDialogElement | null>(null);
	let passwordTarget = $state<string>('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let passwordLoading = $state(false);
	const passwordMatch = $derived(newPassword === confirmPassword);
	const passwordValid = $derived(newPassword.length >= 8 && passwordMatch);

	// Search + filter
	let searchQ = $state('');

	const filteredUsers = $derived(users.filter(u => {
		if (filter === 'active' && u.disabled) return false;
		if (filter === 'disabled' && !u.disabled) return false;
		if (searchQ.trim()) {
			const q = searchQ.toLowerCase();
			return u.username.toLowerCase().includes(q) ||
				(u.display_name ?? '').toLowerCase().includes(q) ||
				(u.email ?? '').toLowerCase().includes(q);
		}
		return true;
	}));

	// Virtual scroll
	const ROW_HEIGHT = 56;
	const OVERSCAN = 5;
	let usersContainerEl = $state<HTMLDivElement | null>(null);
	let usersScrollTop = $state(0);
	let usersContainerH = $state(500);

	const usersVisibleRange = $derived(() => {
		const start = Math.max(0, Math.floor(usersScrollTop / ROW_HEIGHT) - OVERSCAN);
		const end = Math.min(filteredUsers.length, Math.ceil((usersScrollTop + usersContainerH) / ROW_HEIGHT) + OVERSCAN);
		return { start, end };
	});
	const usersVisible = $derived(filteredUsers.slice(usersVisibleRange().start, usersVisibleRange().end));
	const usersTotalH = $derived(filteredUsers.length * ROW_HEIGHT);
	const usersOffsetY = $derived(usersVisibleRange().start * ROW_HEIGHT);

	// ── Load ───────────────────────────────────────────────────────────────────
	async function load() {
		loading = true;
		const result = await apiGet<User[]>('/users', { silent: true });
		result.match(
			(data) => { users = data; },
			(e) => { toast.error(errorMessage(e)); }
		);
		loading = false;
	}

	onMount(() => {
		load();
		if (usersContainerEl) {
			const ro = new ResizeObserver(e => { usersContainerH = e[0].contentRect.height; });
			ro.observe(usersContainerEl);
			return () => ro.disconnect();
		}
	});

	// ── Dialog helpers ─────────────────────────────────────────────────────────
	function openNewUserDialog() {
		newUsername = '';
		newDisplayName = '';
		newEmail = '';
		newRole = 'user';
		newUserDialog?.showModal();
	}

	function openDisableDialog(username: string) {
		disableTarget = username;
		disableReason = '';
		disableDialog?.showModal();
	}

	function openPasswordDialog(username: string) {
		passwordTarget = username;
		newPassword = '';
		confirmPassword = '';
		passwordDialog?.showModal();
	}

	async function setPassword(e: Event) {
		e.preventDefault();
		if (passwordLoading || !passwordValid) return;
		passwordLoading = true;
		const result = await apiPost(`/users/${passwordTarget}/set-password`, { password: newPassword });
		result.match(
			() => {
				toast.success($t('users.password_set', 'Password set'));
				passwordDialog?.close();
			},
			(e) => toast.error(errorMessage(e))
		);
		passwordLoading = false;
	}

	// ── Actions ────────────────────────────────────────────────────────────────
	async function createUser(e: Event) {
		e.preventDefault();
		if (newUserLoading) return;
		if (!newUsername.trim()) return;
		newUserLoading = true;
		const result = await apiPost<User>('/users', {
			username: newUsername.trim(),
			display_name: newDisplayName.trim() || null,
			email: newEmail.trim() || null,
			role: newRole
		});
		result.match(
			() => {
				toast.success($t('users.created', 'User created'));
				toast.info($t('users.syncing', 'Syncing...'), { duration: 3000 });
				newUserDialog?.close();
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		newUserLoading = false;
	}

	async function enableUser(username: string) {
		if (actionLoading[username]) return;
		actionLoading[username] = true;
		const result = await apiPost(`/users/${username}/enable`);
		result.match(
			() => { toast.success($t('users.enabled', 'Enabled')); load(); },
			(e) => toast.error(errorMessage(e))
		);
		actionLoading[username] = false;
	}

	async function disableUser(e: Event) {
		e.preventDefault();
		if (disableLoading) return;
		disableLoading = true;
		const result = await apiPost(`/users/${disableTarget}/disable`, {
			reason: disableReason.trim() || undefined
		});
		result.match(
			() => {
				toast.success($t('users.disabled_toast', 'Disabled'));
				disableDialog?.close();
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		disableLoading = false;
	}

	function fmt(dateStr: string) {
		return new Date(dateStr).toLocaleString('zh-TW', { hour12: false });
	}

	const filterLabels: Record<string, () => string> = {
		all: () => $t('users.filter.all', 'All'),
		active: () => $t('users.filter.active', 'Active'),
		disabled: () => $t('users.filter.disabled', 'Disabled'),
	};
</script>

<svelte:head><title>Users — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-bold text-text-primary">{$t('users.title', 'Users')}</h1>
			<p class="mt-1 text-sm text-text-secondary">{$t('users.subtitle', 'Manage platform accounts')}</p>
		</div>
		<button onclick={openNewUserDialog} class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
			<Plus size={14} />
			{$t('users.new', 'New User')}
		</button>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap gap-2 items-center">
		<div class="flex gap-1 rounded-lg border border-border bg-surface p-1">
			{#each (['all', 'active', 'disabled'] as const) as tab}
				<button onclick={() => filter = tab}
					class={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
						filter === tab ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
					)}>
					{filterLabels[tab]()}
				</button>
			{/each}
		</div>
		<input bind:value={searchQ} placeholder={$t('users.search_placeholder', 'Search users...')}
			class="rounded-md border border-border bg-background py-1.5 px-3 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary w-48" />
		<span class="text-xs text-text-disabled">{filteredUsers.length} {$t('common.username', 'users')}</span>
	</div>

	<!-- Table -->
	{#if loading}
		<SkeletonTable rows={8} cols={7} />
	{:else if filteredUsers.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-16 text-text-secondary">
			<Users size={32} />
			<p class="text-sm">{$t('common.no_data', 'No data')}</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl border border-border bg-surface">
			<div bind:this={usersContainerEl}
				 onscroll={e => usersScrollTop = (e.currentTarget as HTMLDivElement).scrollTop}
				 class="overflow-auto"
				 style="height: min(520px, calc(100vh - 300px))">
				<table class="w-full border-collapse">
					<thead class="sticky top-0 z-10 bg-surface border-b border-border">
						<tr>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="width:120px">{$t('common.username', 'Username')}</th>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="min-width:130px">{$t('users.display_name', 'Name')}</th>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary hidden md:table-cell whitespace-nowrap" style="min-width:160px">{$t('users.email', 'Email')}</th>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="width:80px">{$t('common.role', 'Role')}</th>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="width:80px">{$t('common.status', 'Status')}</th>
							<th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary hidden lg:table-cell whitespace-nowrap" style="width:140px">{$t('common.created_at', 'Created')}</th>
							<th class="sticky right-0 z-20 bg-surface border-l border-border px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap">{$t('common.actions', 'Actions')}</th>
						</tr>
					</thead>
					<tbody>
						{#each usersVisible as user (user.username)}
							<tr class="cursor-pointer border-t border-border hover:bg-surface-raised transition-colors"
								onclick={() => goto(`/users/${user.username}`)}>
								<td class="px-4 py-3 text-sm font-mono font-medium text-text-primary whitespace-nowrap" style="width:120px">{user.username}</td>
								<td class="px-4 py-3 text-sm text-text-primary whitespace-nowrap" style="min-width:130px">{user.display_name ?? '—'}</td>
								<td class="px-4 py-3 text-sm text-text-secondary hidden md:table-cell whitespace-nowrap" style="min-width:160px; max-width:200px; overflow:hidden; text-overflow:ellipsis">{user.email ?? '—'}</td>
								<td class="px-4 py-3 text-sm whitespace-nowrap" style="width:80px">
									{#if user.role === 'admin'}
										<span class="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary">admin</span>
									{:else}
										<span class="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-text-secondary">user</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-sm whitespace-nowrap" style="width:80px">
									{#if user.disabled}
										<span class="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">{$t('users.disabled', 'disabled')}</span>
									{:else}
										<span class="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">{$t('users.active', 'active')}</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-sm text-text-secondary hidden lg:table-cell whitespace-nowrap" style="width:140px">{fmt(user.created_at)}</td>
								<td class="sticky right-0 z-20 bg-surface border-l border-border px-4 py-3 text-sm whitespace-nowrap" onclick={e => e.stopPropagation()}>
									<div class="flex items-center gap-1.5">
										{#if user.disabled}
											<button onclick={() => enableUser(user.username)} disabled={actionLoading[user.username]}
												class="flex items-center gap-1 rounded-md bg-success-bg px-2 py-1 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50">
													<UserCheck size={11} />{$t('users.enable', 'Enable')}
												</button>
											{:else}
												<button onclick={() => openDisableDialog(user.username)} disabled={actionLoading[user.username]}
													class="flex items-center gap-1 rounded-md bg-danger-bg px-2 py-1 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50">
													<UserX size={11} />{$t('users.disable', 'Disable')}
												</button>
											{/if}
											{#if user.role === 'admin'}
												<button onclick={() => openPasswordDialog(user.username)}
													class="flex items-center gap-1 rounded-md bg-surface-raised px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary">
													<KeyRound size={11} />{$t('users.set_password', 'Password')}
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

<!-- New User Dialog -->
<dialog bind:this={newUserDialog}>
	<div class="px-6 py-5">
		<div class="mb-5 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">{$t('users.create_title', 'New User')}</h2>
			<button onclick={() => newUserDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		<form onsubmit={createUser} class="space-y-4">
			<div>
				<label for="new-username" class="mb-1 block text-xs font-medium text-text-secondary">{$t('common.username', 'Username')} <span class="text-danger">*</span></label>
				<input
					id="new-username"
					bind:value={newUsername}
					required
					placeholder={$t('users.username_placeholder', 'alice')}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
			</div>
			<div>
				<label for="new-display-name" class="mb-1 block text-xs font-medium text-text-secondary">{$t('users.display_name', 'Display Name')}</label>
				<input
					id="new-display-name"
					bind:value={newDisplayName}
					placeholder={$t('users.display_name_placeholder', 'Alice Chen')}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
			</div>
			<div>
				<label for="new-email" class="mb-1 block text-xs font-medium text-text-secondary">{$t('users.email', 'Email')}</label>
				<input
					id="new-email"
					type="email"
					bind:value={newEmail}
					placeholder={$t('users.email_placeholder', 'alice@company.com')}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
			</div>
			<div>
				<label for="new-role" class="mb-1 block text-xs font-medium text-text-secondary">{$t('common.role', 'Role')}</label>
				<select
					id="new-role"
					bind:value={newRole}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
				>
					<option value="user">user</option>
					<option value="admin">admin</option>
				</select>
			</div>
			<div class="flex justify-end gap-2 pt-2">
				<button type="button" onclick={() => newUserDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
					{$t('common.cancel', 'Cancel')}
				</button>
				<button
					type="submit"
					disabled={newUserLoading || !newUsername.trim()}
					class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
				>
					{newUserLoading ? $t('common.saving', 'Saving…') : $t('users.new', 'New User')}
				</button>
			</div>
		</form>
	</div>
</dialog>

<!-- Disable User Dialog -->
<dialog bind:this={disableDialog}>
	<div class="px-6 py-5">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">{$t('users.disable', 'Disable User')}</h2>
			<button onclick={() => disableDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		<p class="mb-4 text-sm text-text-secondary">
			{$t('users.confirm_disable', 'Disable this user?')} <span class="font-mono font-medium text-text-primary">{disableTarget}</span>
		</p>
		<form onsubmit={disableUser} class="space-y-4">
			<div>
				<label for="disable-reason" class="mb-1 block text-xs font-medium text-text-secondary">{$t('users.disable_reason', 'Reason (optional)')}</label>
				<input
					id="disable-reason"
					bind:value={disableReason}
					placeholder={$t('common.reason', 'Reason…')}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
			</div>
			<div class="flex justify-end gap-2">
				<button type="button" onclick={() => disableDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
					{$t('common.cancel', 'Cancel')}
				</button>
				<button
					type="submit"
					disabled={disableLoading}
					class="rounded-md bg-danger-bg px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
				>
					{disableLoading ? $t('common.saving', 'Saving…') : $t('users.disable', 'Disable')}
				</button>
			</div>
		</form>
	</div>
</dialog>

<!-- Set Password Dialog -->
<dialog bind:this={passwordDialog}>
	<div class="p-5 border-b border-border flex items-center justify-between">
		<h3 class="text-sm font-semibold text-text-primary">
			<KeyRound size={14} class="inline mr-1.5 text-primary" />
			Set Admin UI Password — <span class="font-mono text-primary">{passwordTarget}</span>
		</h3>
		<button onclick={() => passwordDialog?.close()} class="text-text-disabled hover:text-text-primary text-lg leading-none">×</button>
	</div>
	<form onsubmit={setPassword} class="p-5 space-y-4">
		<p class="text-xs text-text-secondary">
			設定此管理者登入 Admin UI 的密碼（最少 8 個字元）。
		</p>
		<div>
			<label for="pw-new" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">新密碼 <span class="text-danger">*</span></label>
			<input
				id="pw-new"
				type="password"
				bind:value={newPassword}
				required
				minlength={8}
				placeholder="••••••••"
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
			/>
		</div>
		<div>
			<label for="pw-confirm" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">確認密碼 <span class="text-danger">*</span></label>
			<input
				id="pw-confirm"
				type="password"
				bind:value={confirmPassword}
				required
				placeholder="••••••••"
				class="w-full rounded-md border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary {confirmPassword && !passwordMatch ? 'border-danger' : 'border-border'}"
			/>
			{#if confirmPassword && !passwordMatch}
				<p class="mt-1 text-xs text-danger">密碼不符</p>
			{/if}
		</div>
		<div class="flex justify-end gap-2 pt-2">
			<button type="button" onclick={() => passwordDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
				{$t('common.cancel', 'Cancel')}
			</button>
			<button
				type="submit"
				disabled={passwordLoading || !passwordValid}
				class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
			>
				{passwordLoading ? $t('common.saving', 'Saving…') : 'Set Password'}
			</button>
		</div>
	</form>
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
