<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost, apiDelete } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { Key, Plus, Copy, Check, AlertCircle, ShieldAlert } from '@lucide/svelte';
	import type { Token, IssuedToken, User } from '$lib/types';
	import { t } from '$lib/stores/i18n';
	import SkeletonTable from '$lib/components/ui/SkeletonTable.svelte';

	interface ScopeIssue {
		token_id: string;
		user: string;
		issue: string;
		severity: 'high' | 'medium' | 'low';
		suggestion: string;
	}

	// ── State ──────────────────────────────────────────────────────────────────
	let tokens = $state<Token[]>([]);
	let users = $state<User[]>([]);
	let loading = $state(true);
	let showRevoked = $state(false);
	let activeTab = $state<'list' | 'scope-review'>('list');
	let scopeIssues = $state<ScopeIssue[]>([]);
	let scopeLoading = $state(false);
	let scopeTotal = $state(0);

	async function loadScopeReview() {
		if (scopeLoading) return;
		scopeLoading = true;
		const result = await apiGet<{ total_tokens: number; issues: ScopeIssue[] }>('/tokens/scope-review');
		result.match(
			(d) => { scopeIssues = d.issues; scopeTotal = d.total_tokens; },
			() => {}
		);
		scopeLoading = false;
	}

	// Issue token dialog
	let issueDialog = $state<HTMLDialogElement | null>(null);
	let issueUser = $state('');
	let issueScopes = $state('chat,completions');
	let issueTtl = $state(365);
	let issueNote = $state('');
	let issueLoading = $state(false);

	// Issued token display dialog
	let issuedDialog = $state<HTMLDialogElement | null>(null);
	let issuedToken = $state<IssuedToken | null>(null);
	let copied = $state(false);

	// Revoke dialog
	let revokeDialog = $state<HTMLDialogElement | null>(null);
	let revokeTarget = $state<string>('');
	let revokeLoading = $state(false);

	// ── Derived ────────────────────────────────────────────────────────────────
	const filteredTokens = $derived(
		showRevoked ? tokens : tokens.filter(t => !t.revoked)
	);

	// ── Load ───────────────────────────────────────────────────────────────────
	async function load() {
		loading = true;
		const [tokensResult, usersResult] = await Promise.all([
			apiGet<Token[]>(`/tokens?include_revoked=${showRevoked}`, { silent: true }),
			apiGet<User[]>('/users')
		]);
		tokensResult.match(
			(data) => { tokens = data; },
			(e) => toast.error(errorMessage(e))
		);
		usersResult.match(
			(data) => {
				users = data;
				if (!issueUser && data.length > 0) issueUser = data[0].username;
			},
			() => {} // silently ignore; users list is supplementary
		);
		loading = false;
	}

	// Initial load on mount only
	onMount(load);

	// Reload ONLY when user explicitly toggles showRevoked checkbox
	function toggleShowRevoked() {
		showRevoked = !showRevoked;
		load();
	}

	// ── Dialog helpers ──────────────────────────────────────────────────────────
	function openIssueDialog() {
		issueUser = users.length > 0 ? users[0].username : '';
		issueScopes = 'chat,completions';
		issueTtl = 365;
		issueNote = '';
		issueDialog?.showModal();
	}

	function openRevokeDialog(tokenId: string) {
		revokeTarget = tokenId;
		revokeDialog?.showModal();
	}

	async function copyToken() {
		if (!issuedToken) return;
		await navigator.clipboard.writeText(issuedToken.raw_token);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	// ── Actions ────────────────────────────────────────────────────────────────
	async function issueToken(e: Event) {
		e.preventDefault();
		if (issueLoading) return;
		if (!issueUser.trim()) return;
		issueLoading = true;
		const scopeList = issueScopes.split(',').map(s => s.trim()).filter(Boolean);
		const result = await apiPost<IssuedToken>('/tokens/issue', {
			user: issueUser.trim(),
			scopes: scopeList,
			ttl_days: Number(issueTtl),
			note: issueNote.trim() || null
		});
		result.match(
			(data) => {
				issueDialog?.close();
				issuedToken = data;
				copied = false;
				issuedDialog?.showModal();
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		issueLoading = false;
	}

	async function revokeToken(e: Event) {
		e.preventDefault();
		if (revokeLoading) return;
		revokeLoading = true;
		const result = await apiDelete(`/tokens/${revokeTarget}`);
		result.match(
			() => {
				toast.success('Token revoked');
				revokeDialog?.close();
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		revokeLoading = false;
	}

	function fmt(dateStr: string) {
		return new Date(dateStr).toLocaleString('zh-TW', { hour12: false });
	}

	function truncateToken(id: string) {
		return id.length > 12 ? id.slice(0, 12) + '…' : id;
	}

	function isExpired(expiresAt: string) {
		return new Date(expiresAt) < new Date();
	}
</script>

<svelte:head><title>Tokens — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4 flex-wrap">
		<div>
			<h1 class="text-xl font-bold text-text-primary">{$t('tokens.title', 'Tokens')}</h1>
			<p class="mt-1 text-sm text-text-secondary">{$t('tokens.subtitle', 'Manage API access tokens')}</p>
		</div>
		<div class="flex items-center gap-3">
			<label class="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
				<input
					type="checkbox"
					checked={showRevoked}
					onchange={toggleShowRevoked}
					class="rounded border-border accent-primary"
				/>
				{$t('tokens.show_revoked', 'Show revoked')}
			</label>
			<button onclick={openIssueDialog} class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				<Plus size={14} />
				{$t('tokens.issue', 'Issue Token')}
			</button>
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex gap-1 rounded-lg border border-border bg-surface p-1 w-fit">
		<button onclick={() => activeTab = 'list'}
			class={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
				activeTab === 'list' ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:bg-surface-raised')}>
			Token 列表
		</button>
		<button onclick={() => { activeTab = 'scope-review'; loadScopeReview(); }}
			class={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
				activeTab === 'scope-review' ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:bg-surface-raised')}>
			<ShieldAlert size={12} />
			權限審查
			{#if scopeIssues.length > 0}
			<span class={cn('rounded-full px-1.5 py-0.5 text-xs font-bold',
				activeTab === 'scope-review' ? 'bg-white/20' : 'bg-danger-bg text-danger')}>
				{scopeIssues.length}
			</span>
			{/if}
		</button>
	</div>

	{#if activeTab === 'scope-review'}
	<div class="space-y-3">
		{#if scopeLoading}
		<div class="h-32 animate-pulse rounded-xl border border-border bg-surface"></div>
		{:else if scopeIssues.length === 0 && scopeTotal > 0}
		<div class="flex items-center gap-3 rounded-xl border border-success/30 bg-success-bg px-5 py-4">
			<ShieldAlert size={20} class="text-success shrink-0" />
			<div>
				<p class="text-sm font-medium text-text-primary">所有 Token 權限正常</p>
				<p class="text-xs text-text-secondary mt-0.5">已審查 {scopeTotal} 個 Token，無異常。</p>
			</div>
		</div>
		{:else if scopeIssues.length > 0}
		<div class="space-y-2">
			{#each scopeIssues as issue}
			<div class={cn('rounded-xl border px-5 py-4 space-y-2',
				issue.severity === 'high' ? 'border-danger/30 bg-danger-bg' :
				issue.severity === 'medium' ? 'border-warning/30 bg-warning-bg' :
				'border-border bg-surface')}>
				<div class="flex items-center gap-3">
					<span class={cn('rounded-full px-2 py-0.5 text-xs font-medium',
						issue.severity === 'high' ? 'bg-danger text-white' :
						issue.severity === 'medium' ? 'bg-warning text-white' :
						'bg-border text-text-secondary')}>
						{issue.severity}
					</span>
					<code class="font-mono text-xs text-text-primary">{issue.token_id}</code>
					<span class="text-xs text-text-secondary">{issue.user}</span>
				</div>
				<p class="text-sm text-text-primary">{issue.issue}</p>
				<p class="text-xs text-text-secondary">建議：{issue.suggestion}</p>
			</div>
			{/each}
		</div>
		{/if}
	</div>
	{/if}

	<!-- Token List -->
	{#if activeTab === 'list'}
	{#if loading}
		<SkeletonTable rows={8} cols={8} />
	{:else if filteredTokens.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-16 text-text-secondary">
			<Key size={32} />
			<p class="text-sm">{$t('common.no_data', 'No data')}</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl border border-border bg-surface">
			<div class="overflow-x-auto">
				<table class="w-full border-collapse">
					<thead class="sticky top-0 z-10 bg-surface border-b border-border">
						<tr>
							<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="width:120px">Token ID</th>
							<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="width:120px">{$t('dashboard.user', 'User')}</th>
							<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="min-width:140px">{$t('tokens.scopes', 'Scopes')}</th>
							<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="width:140px">{$t('tokens.issued_at', 'Issued')}</th>
							<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="width:140px">{$t('tokens.expires_at', 'Expires')}</th>
							<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="min-width:120px; max-width:200px">{$t('common.note', 'Note')}</th>
							<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap" style="width:80px">{$t('common.status', 'Status')}</th>
							<th class="sticky right-0 z-20 bg-surface border-l border-border px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap">{$t('common.actions', 'Actions')}</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredTokens as token}
							{@const expired = isExpired(token.expires_at)}
							<tr class={cn(
								'border-t border-border hover:bg-surface-raised transition-colors',
								(token.revoked || expired) && 'opacity-60'
							)}>
								<td class="px-5 py-3 text-sm font-mono text-text-primary whitespace-nowrap" style="width:120px">{truncateToken(token.token_id)}</td>
								<td class="px-5 py-3 text-sm font-mono text-text-secondary whitespace-nowrap" style="width:120px">{token.user}</td>
								<td class="px-5 py-3 text-sm text-text-secondary whitespace-nowrap" style="min-width:140px">{token.scopes.join(', ')}</td>
								<td class="px-5 py-3 text-sm text-text-secondary whitespace-nowrap" style="width:140px">{fmt(token.issued_at)}</td>
								<td class="px-5 py-3 text-sm whitespace-nowrap" style="width:140px" class:text-danger={expired && !token.revoked} class:text-text-secondary={!expired || token.revoked}>
									{fmt(token.expires_at)}
								</td>
								<td class="px-5 py-3 text-sm text-text-secondary whitespace-nowrap" style="min-width:120px; max-width:200px; overflow:hidden; text-overflow:ellipsis">{token.note ?? '—'}</td>
								<td class="px-5 py-3 text-sm whitespace-nowrap" style="width:80px">
									{#if token.revoked}
										<span class="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">{$t('tokens.revoked', 'revoked')}</span>
									{:else if expired}
										<span class="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">{$t('tokens.expired', 'expired')}</span>
									{:else}
										<span class="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">{$t('tokens.active', 'active')}</span>
									{/if}
								</td>
								<td class="sticky right-0 z-20 bg-surface border-l border-border px-5 py-3 text-sm whitespace-nowrap">
									{#if !token.revoked && !expired}
										<button
											onclick={() => openRevokeDialog(token.token_id)}
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
	{/if}<!-- end list tab -->
</div>

<!-- Issue Token Dialog -->
<dialog bind:this={issueDialog}>
	<div class="px-6 py-5">
		<div class="mb-5 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">{$t('tokens.issue_title', 'Issue Token')}</h2>
			<button onclick={() => issueDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		<form onsubmit={issueToken} class="space-y-4">
			<div>
				<label for="issue-user" class="mb-1 block text-xs font-medium text-text-secondary">{$t('dashboard.user', 'User')} <span class="text-danger">*</span></label>
				{#if users.length > 0}
					<select
						id="issue-user"
						bind:value={issueUser}
						required
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
					>
						{#each users as u}
							<option value={u.username}>{u.username}{u.display_name ? ` (${u.display_name})` : ''}</option>
						{/each}
					</select>
				{:else}
					<input
						id="issue-user"
						bind:value={issueUser}
						required
						placeholder="username"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
					/>
				{/if}
			</div>
			<div>
				<label for="issue-scopes" class="mb-1 block text-xs font-medium text-text-secondary">{$t('tokens.scopes', 'Scopes')}</label>
				<input
					id="issue-scopes"
					bind:value={issueScopes}
					placeholder="chat,completions"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
				<p class="mt-1 text-xs text-text-disabled">Comma-separated list of scopes</p>
			</div>
			<div>
				<label for="issue-ttl" class="mb-1 block text-xs font-medium text-text-secondary">{$t('tokens.ttl_days', 'TTL (days)')}</label>
				<input
					id="issue-ttl"
					type="number"
					bind:value={issueTtl}
					min="1"
					max="3650"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
				/>
			</div>
			<div>
				<label for="issue-note" class="mb-1 block text-xs font-medium text-text-secondary">{$t('common.note', 'Note')} (optional)</label>
				<input
					id="issue-note"
					bind:value={issueNote}
					placeholder="Purpose of this token…"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary"
				/>
			</div>
			<div class="flex justify-end gap-2 pt-2">
				<button type="button" onclick={() => issueDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
					{$t('common.cancel', 'Cancel')}
				</button>
				<button
					type="submit"
					disabled={issueLoading || !issueUser.trim()}
					class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
				>
					{issueLoading ? $t('common.saving', 'Saving…') : $t('tokens.issue', 'Issue Token')}
				</button>
			</div>
		</form>
	</div>
</dialog>

<!-- Issued Token Display Dialog -->
<dialog bind:this={issuedDialog}>
	<div class="px-6 py-5">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">{$t('tokens.issue_title', 'Token Issued')}</h2>
			<button onclick={() => issuedDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		{#if issuedToken}
			<div class="mb-4 flex items-start gap-2 rounded-lg border border-warning bg-warning-bg p-3">
				<AlertCircle size={16} class="mt-0.5 shrink-0 text-warning" />
				<p class="text-xs text-warning">{$t('tokens.issued_once', 'Copy this token now — it will not be shown again.')}</p>
			</div>
			<div class="mb-4">
				<p class="mb-1 text-xs font-medium text-text-secondary">Raw Token</p>
				<div class="flex items-center gap-2 rounded-lg border border-border bg-background p-3">
					<code class="flex-1 break-all text-xs font-mono text-text-primary">{issuedToken.raw_token}</code>
					<button
						onclick={copyToken}
						class="shrink-0 rounded-md p-1.5 text-text-secondary hover:bg-surface-raised hover:text-text-primary"
						title={$t('tokens.copy', 'Copy token')}
					>
						{#if copied}
							<Check size={14} class="text-success" />
						{:else}
							<Copy size={14} />
						{/if}
					</button>
				</div>
			</div>
			<div class="space-y-1 text-xs text-text-secondary">
				<div class="flex gap-2">
					<span class="text-text-disabled w-16 shrink-0">User:</span>
					<span class="font-mono text-text-primary">{issuedToken.user}</span>
				</div>
				<div class="flex gap-2">
					<span class="text-text-disabled w-16 shrink-0">Scopes:</span>
					<span class="text-text-primary">{issuedToken.scopes.join(', ')}</span>
				</div>
				<div class="flex gap-2">
					<span class="text-text-disabled w-16 shrink-0">Expires:</span>
					<span class="text-text-primary">{new Date(issuedToken.expires_at).toLocaleString('zh-TW', { hour12: false })}</span>
				</div>
			</div>
			<div class="mt-5 flex justify-end">
				<button onclick={() => issuedDialog?.close()} class="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
					{$t('common.confirm', 'Done')}
				</button>
			</div>
		{/if}
	</div>
</dialog>

<!-- Revoke Token Dialog -->
<dialog bind:this={revokeDialog}>
	<div class="px-6 py-5">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-text-primary">{$t('tokens.revoke', 'Revoke Token')}</h2>
			<button onclick={() => revokeDialog?.close()} class="text-text-secondary hover:text-text-primary">✕</button>
		</div>
		<p class="mb-5 text-sm text-text-secondary">
			{$t('tokens.confirm_revoke', 'Revoke this token?')} <span class="font-mono font-medium text-text-primary">{truncateToken(revokeTarget)}</span>
		</p>
		<form onsubmit={revokeToken}>
			<div class="flex justify-end gap-2">
				<button type="button" onclick={() => revokeDialog?.close()} class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">
					{$t('common.cancel', 'Cancel')}
				</button>
				<button
					type="submit"
					disabled={revokeLoading}
					class="rounded-md bg-danger-bg px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
				>
					{revokeLoading ? $t('common.saving', 'Saving…') : $t('tokens.revoke', 'Revoke')}
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
