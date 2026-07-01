<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { Terminal, Plus } from '@lucide/svelte';
	import type { TerminalGrant, User } from '$lib/types';
	import { t } from '$lib/stores/i18n';
	import SkeletonTable from '$lib/components/ui/SkeletonTable.svelte';

	let grants = $state<TerminalGrant[]>([]);
	let users = $state<User[]>([]);
	let loading = $state(true);
	let filter = $state<'all' | 'pending' | 'approved' | 'revoked'>('all');
	let actionLoading = $state<Record<string, boolean>>({});

	// 主動建立授權
	let createUser = $state('');
	let createHostId = $state('');
	let createAddr = $state('');
	let createDays = $state<number | ''>(90);
	let createLoading = $state(false);
	// 建立成功後給可複製的連線網址(傳給員工)
	let createdUrl = $state('');
	let copiedUrl = $state(false);

	async function copyUrl() {
		await navigator.clipboard.writeText(createdUrl);
		copiedUrl = true;
		setTimeout(() => { copiedUrl = false; }, 2000);
	}

	// 核准 dialog
	let approveDialog = $state<HTMLDialogElement | null>(null);
	let approveTarget = $state<TerminalGrant | null>(null);
	let approveAddr = $state('');
	let approveDays = $state<number | ''>(90);
	let approveLoading = $state(false);

	const pendingCount = $derived(grants.filter(g => g.status === 'pending').length);
	const filtered = $derived(grants.filter(g => filter === 'all' || g.status === filter));

	async function load() {
		loading = true;
		const [gr, ur] = await Promise.all([
			apiGet<TerminalGrant[]>('/terminal-grants'),
			apiGet<User[]>('/users', { silent: true }),
		]);
		gr.match((data) => { grants = data; }, (e) => { toast.error(errorMessage(e)); });
		ur.match((data) => { users = data.filter(u => !u.disabled); }, () => {});
		loading = false;
	}
	onMount(load);

	async function createGrant(event: Event) {
		event.preventDefault();
		if (!createUser || !createHostId.trim() || createLoading) return;
		createLoading = true;
		const r = await apiPost('/terminal-grants/create', {
			user: createUser,
			host_id: createHostId.trim(),
			host_addr: createAddr.trim() || null,
			expires_days: createDays === '' ? null : Number(createDays),
		});
		const host = createHostId.trim();
		r.match(
			() => {
				createLoading = false;
				// 給可複製的連線路徑(員工在平台站台登入後即可開啟)
				createdUrl = `/terminal/${host}/`;
				createUser = ''; createHostId = ''; createAddr = ''; createDays = 90;
				toast.success('已建立授權');
				load();
			},
			(e) => { createLoading = false; toast.error(errorMessage(e)); }
		);
	}

	function openApprove(g: TerminalGrant) {
		approveTarget = g;
		approveAddr = g.host_addr ?? '';
		approveDays = 90;
		approveDialog?.showModal();
	}

	async function doApprove() {
		if (!approveTarget || approveLoading) return;
		approveLoading = true;
		const r = await apiPost(`/terminal-grants/${approveTarget.id}/approve`, {
			host_addr: approveAddr.trim() || null,
			expires_days: approveDays === '' ? null : Number(approveDays),
		});
		r.match(
			() => { approveLoading = false; approveDialog?.close(); toast.success('已核准'); load(); },
			(e) => { approveLoading = false; toast.error(errorMessage(e)); }
		);
	}

	async function revoke(g: TerminalGrant) {
		if (actionLoading[g.id]) return;
		actionLoading = { ...actionLoading, [g.id]: true };
		const r = await apiPost(`/terminal-grants/${g.id}/revoke`);
		r.match(
			() => { toast.success('已撤銷'); load(); },
			(e) => { toast.error(errorMessage(e)); }
		);
		actionLoading = { ...actionLoading, [g.id]: false };
	}

	function badge(s: TerminalGrant['status']): string {
		return s === 'approved' ? 'bg-success-bg text-success'
			: s === 'pending' ? 'bg-warning-bg text-warning'
			: 'bg-danger-bg text-danger';
	}
	function label(s: TerminalGrant['status']): string {
		return s === 'approved' ? '已授權' : s === 'pending' ? '待審核' : '已撤銷';
	}
	// 健康狀態(平台每 30s 主動探員工機 code-server 是否有回應)
	function healthColor(h: TerminalGrant['health']): string {
		return h === 'up' ? 'text-success' : h === 'down' ? 'text-danger' : 'text-text-disabled';
	}
	function healthLabel(h: TerminalGrant['health']): string {
		return h === 'up' ? '線上' : h === 'down' ? '離線' : '未知';
	}
	function fmt(s: string | null): string {
		return s ? new Date(s).toLocaleString('zh-TW', { hour12: false }) : '—';
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Terminal size={18} class="text-text-secondary" />
			<h1 class="text-base font-semibold text-text-primary">Web 終端授權</h1>
			{#if pendingCount > 0}
			<span class="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
				{pendingCount} 待審核
			</span>
			{/if}
		</div>
		<div class="flex gap-1 rounded-lg border border-border bg-surface p-1">
			{#each (['all', 'pending', 'approved', 'revoked'] as const) as f}
			<button
				onclick={() => filter = f}
				class={cn(
					'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
					filter === f ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:text-text-primary'
				)}>
				{f === 'all' ? '全部' : label(f as TerminalGrant['status'])}
			</button>
			{/each}
		</div>
	</div>

	<!-- 主動建立授權(user 下拉,不必員工先申請)-->
	<form onsubmit={createGrant} class="rounded-xl border border-border bg-surface p-4">
		<div class="flex items-center gap-1.5 mb-3">
			<Plus size={14} class="text-text-secondary" />
			<span class="text-sm font-medium text-text-primary">主動建立授權</span>
		</div>
		<div class="grid gap-2 sm:grid-cols-4">
			<select bind:value={createUser}
				class="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none">
				<option value="" disabled>選擇用戶</option>
				{#each users as u}
				<option value={u.username}>{u.display_name ? `${u.display_name} (${u.username})` : u.username}</option>
				{/each}
			</select>
			<input bind:value={createHostId} placeholder="開發機代號(英數與-)"
				class="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-primary focus:outline-none" />
			<input bind:value={createAddr} placeholder="VPN 位址 IP:port"
				class="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-primary focus:outline-none" />
			<div class="flex gap-2">
				<input type="number" bind:value={createDays} min="1" placeholder="有效天數"
					class="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none" />
				<button type="submit" disabled={!createUser || !createHostId.trim() || createLoading}
					class="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-50">
					{createLoading ? '建立中…' : '建立'}
				</button>
			</div>
		</div>
		<p class="mt-2 text-xs text-text-disabled">
			VPN 位址須能從平台反代到員工機 ttyd(經 VPN)。代號任意,每台機器唯一即可(Mac/Windows/筆電皆可)。
		</p>

		<!-- 建立成功後:可複製的連線連結(傳給員工)-->
		{#if createdUrl}
		<div class="mt-3 flex items-center gap-2 rounded-lg border border-success/40 bg-success-bg px-3 py-2">
			<span class="text-xs text-text-secondary shrink-0">員工連線連結:</span>
			<code class="flex-1 min-w-0 truncate font-mono text-xs text-text-primary">{createdUrl}</code>
			<button type="button" onclick={copyUrl}
				class="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors">
				{copiedUrl ? '已複製 ✓' : '複製'}
			</button>
		</div>
		<p class="mt-1 text-xs text-text-disabled">
			完整網址 = <span class="font-medium">Portal 域名</span> + 此路徑(如 https://portal.你的網域{createdUrl})。
			員工登入 Portal 後從「遠端開發」分頁開啟,或直接開此網址。
		</p>
		{/if}
	</form>

	{#if loading}
		<SkeletonTable rows={6} cols={5} />
	{:else if filtered.length === 0}
		<div class="rounded-xl border border-border bg-surface py-12 text-center text-text-secondary">
			<Terminal size={28} class="mx-auto mb-2" />
			<p class="text-sm">無符合條件的授權</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl border border-border bg-surface">
			<table class="w-full text-sm">
				<thead class="border-b border-border bg-background text-xs text-text-secondary">
					<tr>
						<th class="px-4 py-2.5 text-left font-medium">用戶</th>
						<th class="px-4 py-2.5 text-left font-medium">開發機</th>
						<th class="px-4 py-2.5 text-left font-medium">狀態</th>
						<th class="px-4 py-2.5 text-left font-medium">申請 / 到期</th>
						<th class="px-4 py-2.5 text-right font-medium">操作</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as g (g.id)}
					<tr class="border-b border-border last:border-0">
						<td class="px-4 py-3 font-mono text-text-primary">{g.user}</td>
						<td class="px-4 py-3">
							<code class="text-text-primary">{g.host_id}</code>
							{#if g.host_addr}<span class="block text-xs text-text-disabled">{g.host_addr}</span>{/if}
						</td>
						<td class="px-4 py-3">
							<span class={cn('rounded-full px-2 py-0.5 text-xs font-medium', badge(g.status))}>{label(g.status)}</span>
							{#if g.status === 'approved'}
							<span class={cn('mt-1 flex items-center gap-1 text-xs font-medium', healthColor(g.health))}>
								<span class="inline-block h-2 w-2 rounded-full bg-current"></span>{healthLabel(g.health)}
							</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-xs text-text-secondary">
							<div>申請 {fmt(g.requested_at)}</div>
							{#if g.expires_at}<div>到期 {fmt(g.expires_at)}</div>{/if}
						</td>
						<td class="px-4 py-3 text-right">
							{#if g.status === 'pending'}
							<button onclick={() => openApprove(g)}
								class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover transition-colors">
								核准
							</button>
							{:else if g.status === 'approved'}
							<button onclick={() => revoke(g)} disabled={actionLoading[g.id]}
								class="rounded-md border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg transition-colors disabled:opacity-50">
								撤銷
							</button>
							{/if}
						</td>
					</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- 核准 dialog -->
<dialog bind:this={approveDialog} class="rounded-xl border border-border bg-surface p-0 backdrop:bg-black/50 max-w-md w-full">
	<div class="p-5 space-y-4">
		<h2 class="text-sm font-semibold text-text-primary">
			核准授權:{approveTarget?.user} → {approveTarget?.host_id}
		</h2>
		<div class="space-y-1.5">
			<span class="block text-xs font-medium text-text-secondary">開發機 VPN 位址(nginx 反代用)</span>
			<input bind:value={approveAddr} placeholder="VPN 位址 IP:port"
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-primary focus:outline-none" />
			<p class="text-xs text-text-disabled">須與 nginx 00-shared 的 map 對應(目前 map 寫死;多機要同步)。</p>
		</div>
		<div class="space-y-1.5">
			<span class="block text-xs font-medium text-text-secondary">有效期(天)</span>
			<input type="number" bind:value={approveDays} min="1"
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none" />
			<p class="text-xs text-text-disabled">留空 = 無到期(不建議,逼定期 re-grant 較安全)。</p>
		</div>
		<div class="flex justify-end gap-2 pt-1">
			<button onclick={() => approveDialog?.close()}
				class="rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-surface-raised transition-colors">取消</button>
			<button onclick={doApprove} disabled={approveLoading}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-50">
				{approveLoading ? '核准中…' : '核准'}
			</button>
		</div>
	</div>
</dialog>
