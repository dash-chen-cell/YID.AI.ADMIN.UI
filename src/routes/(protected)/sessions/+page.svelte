<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiDelete } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { Monitor, RefreshCw, LogOut, Trash2, Search } from '@lucide/svelte';
	import { t } from '$lib/stores/i18n';
	import { get } from 'svelte/store';
	import { currentUser } from '$lib/stores/auth';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';

	interface Session {
		id: string;
		full_id: string;
		username: string;
		role: string;
		ip_address: string | null;
		user_agent: string | null;
		created_at: string;
		last_seen: string;
	}

	let sessions = $state<Session[]>([]);
	let loading = $state(true);
	let filterUser = $state('');
	let revoking = $state<Set<string>>(new Set());

	const filteredSessions = $derived(
		filterUser.trim()
			? sessions.filter(s => s.username.toLowerCase().includes(filterUser.toLowerCase()))
			: sessions
	);

	// Group by user
	const byUser = $derived(() => {
		const groups: Record<string, Session[]> = {};
		for (const s of filteredSessions) {
			if (!groups[s.username]) groups[s.username] = [];
			groups[s.username].push(s);
		}
		return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
	});

	async function load() {
		loading = true;
		const result = await apiGet<Session[]>('/sessions', { silent: true });
		result.match((d) => { sessions = d; }, (e) => toast.error(errorMessage(e)));
		loading = false;
	}

	onMount(load);

	async function revokeSession(fullId: string, id: string) {
		if (!confirm(get(t)('sessions.confirm_revoke', '撤銷這個 session？對應裝置將被登出。'))) return;
		revoking = new Set([...revoking, id]);
		const result = await apiDelete(`/sessions/${fullId}`);
		result.match(
			() => { toast.success(get(t)('sessions.revoked', 'Session 已撤銷')); load(); },
			(e) => toast.error(errorMessage(e))
		);
		revoking = new Set([...revoking].filter(x => x !== id));
	}

	async function revokeAllUser(username: string) {
		if (!confirm(get(t)('sessions.confirm_revoke_all', '撤銷 {username} 的所有 Session？該用戶將被強制登出所有裝置。').replace('{username}', username))) return;
		const result = await apiDelete(`/sessions/user/${username}`);
		result.match(
			() => { toast.success(get(t)('sessions.revoked_all_user', '{username} 的所有 Session 已撤銷').replace('{username}', username)); load(); },
			(e) => toast.error(errorMessage(e))
		);
	}

	function fmt(dateStr: string) {
		return new Date(dateStr).toLocaleString('zh-TW', { hour12: false });
	}

	function parseUA(ua: string | null): string {
		if (!ua) return get(t)('sessions.unknown_device', '未知裝置');
		if (ua.includes('Chrome')) return `Chrome / ${ua.includes('Mac') ? 'Mac' : ua.includes('Windows') ? 'Windows' : 'Linux'}`;
		if (ua.includes('Safari')) return `Safari / Mac`;
		if (ua.includes('Firefox')) return 'Firefox';
		return ua.slice(0, 40);
	}

	const ROLE_COLORS: Record<string, string> = {
		super_admin: 'text-danger bg-danger-bg',
		ops_admin: 'text-warning bg-warning-bg',
		user_admin: 'text-primary bg-primary-subtle',
		viewer: 'text-text-secondary bg-surface-raised',
	};
</script>

<svelte:head><title>{$t('sessions.title', 'Session 管理')} — YID AI Admin</title></svelte:head>

<div class="space-y-5">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-bold text-text-primary">{$t('sessions.title', 'Session 管理')}</h1>
			<p class="mt-1 text-sm text-text-secondary">{$t('sessions.subtitle', '查看並撤銷管理員登入 Session（過去 8 小時）')}</p>
		</div>
		<button onclick={load}
			class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
			<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
			{$t('sessions.refresh', '重新整理')}
		</button>
	</div>

	<!-- Search -->
	<div class="flex items-center gap-2">
		<div class="relative">
			<Search size={13} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled" />
			<input bind:value={filterUser} placeholder={$t('sessions.search_placeholder', '搜尋用戶...')}
				class="w-48 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:border-primary" />
		</div>
		<span class="text-xs text-text-disabled">{filteredSessions.length} {$t('sessions.session_count_unit', '個 Session')}</span>
	</div>

	{#if loading}
	<div class="space-y-3">
		{#each [1,2,3] as _}
		<SkeletonCard lines={2} />
		{/each}
	</div>
	{:else if sessions.length === 0}
	<div class="rounded-xl border border-border bg-surface py-16 text-center text-text-secondary">
		<Monitor size={32} class="mx-auto mb-2" />
		<p class="text-sm">{$t('sessions.empty', '沒有活躍 Session')}</p>
	</div>
	{:else}
	<div class="space-y-4">
		{#each byUser() as [username, userSessions]}
		<div class="overflow-hidden rounded-xl border border-border bg-surface">
			<div class="flex items-center justify-between border-b border-border bg-surface-raised px-5 py-2.5">
				<div class="flex items-center gap-3">
					<div class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
						{username.slice(0,1).toUpperCase()}
					</div>
					<span class="text-sm font-semibold text-text-primary">{username}</span>
					<span class="text-xs text-text-disabled">{userSessions.length} {$t('sessions.device_count_unit', '個裝置')}</span>
					{#if username === $currentUser}
					<span class="rounded-full bg-primary-subtle px-2 py-0.5 text-xs text-primary">{$t('sessions.current', '目前')}</span>
					{/if}
				</div>
				{#if userSessions.length > 1 && username !== $currentUser}
				<button onclick={() => revokeAllUser(username)}
					class="flex items-center gap-1 rounded-md bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/20">
					<LogOut size={11} /> {$t('sessions.logout_all', '全部登出')}
				</button>
				{/if}
			</div>
			<div class="divide-y divide-border">
				{#each userSessions as s}
				<div class="flex items-center gap-4 px-5 py-3">
					<Monitor size={16} class="text-text-disabled shrink-0" />
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2">
							<span class="text-sm text-text-primary">{parseUA(s.user_agent)}</span>
							<span class={cn('rounded-full px-2 py-0.5 text-xs font-medium', ROLE_COLORS[s.role] || 'text-text-disabled bg-surface-raised')}>
								{s.role}
							</span>
						</div>
						<div class="flex items-center gap-3 mt-0.5 text-xs text-text-disabled">
							{#if s.ip_address}<span>{s.ip_address}</span>{/if}
							<span>{$t('sessions.last_activity', '最後活動')}: {fmt(s.last_seen)}</span>
							<span>{$t('sessions.created', '建立')}: {fmt(s.created_at)}</span>
						</div>
					</div>
					{#if username !== $currentUser}
					<button
						onclick={() => revokeSession(s.full_id, s.id)}
						disabled={revoking.has(s.id)}
						class="flex items-center gap-1 rounded-md bg-danger-bg px-2 py-1 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50 shrink-0">
						{#if revoking.has(s.id)}<RefreshCw size={11} class="animate-spin" />{:else}<Trash2 size={11} />{/if}
						{$t('sessions.revoke', '撤銷')}
					</button>
					{:else}
					<span class="text-xs text-text-disabled shrink-0">{$t('sessions.current_session', '目前 Session')}</span>
					{/if}
				</div>
				{/each}
			</div>
		</div>
		{/each}
	</div>
	{/if}
</div>
