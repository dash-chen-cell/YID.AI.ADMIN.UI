<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost, apiDelete } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { Shield, Plus, Trash2, UserPlus, UserMinus, RefreshCw, ExternalLink } from '@lucide/svelte';

	interface AkGroup {
		pk: string;
		name: string;
		num_pk: number;
		users_obj: { pk: number; username: string; name: string }[];
		attributes: Record<string, unknown>;
	}

	let groups = $state<AkGroup[]>([]);
	let loading = $state(true);
	let authentikAvailable = $state(true);

	// Create group dialog
	let createDialog = $state<HTMLDialogElement | null>(null);
	let newGroupName = $state('');
	let createLoading = $state(false);

	// Add member dialog
	let memberDialog = $state<HTMLDialogElement | null>(null);
	let memberTargetPk = $state('');
	let memberTargetName = $state('');
	let memberUsername = $state('');
	let memberLoading = $state(false);

	const SYSTEM_GROUPS = ['yid-admins', 'yid-users'];

	onMount(load);

	async function load() {
		loading = true;
		const result = await apiGet<AkGroup[]>('/authentik/groups');
		result.match(
			(data) => { groups = data; authentikAvailable = true; },
			() => { authentikAvailable = false; }
		);
		loading = false;
	}

	async function createGroup(e: Event) {
		e.preventDefault();
		if (createLoading || !newGroupName.trim()) return;
		createLoading = true;
		const result = await apiPost('/authentik/groups', { name: newGroupName.trim() });
		result.match(
			() => { toast.success(`Group "${newGroupName}" created`); createDialog?.close(); load(); },
			(e) => toast.error(errorMessage(e))
		);
		createLoading = false;
	}

	async function deleteGroup(pk: string, name: string) {
		if (SYSTEM_GROUPS.includes(name)) {
			toast.error(`"${name}" is a system group and cannot be deleted`);
			return;
		}
		if (!confirm(`Delete group "${name}"?`)) return;
		const result = await apiDelete(`/authentik/groups/${pk}`);
		result.match(
			() => { toast.success(`Group "${name}" deleted`); load(); },
			(e) => toast.error(errorMessage(e))
		);
	}

	function openAddMember(group: AkGroup) {
		memberTargetPk = group.pk;
		memberTargetName = group.name;
		memberUsername = '';
		memberDialog?.showModal();
	}

	async function addMember(e: Event) {
		e.preventDefault();
		if (memberLoading || !memberUsername.trim()) return;
		memberLoading = true;
		const result = await apiPost(`/authentik/groups/${memberTargetPk}/members/add`, { username: memberUsername.trim() });
		result.match(
			() => { toast.success(`${memberUsername} added to ${memberTargetName}`); memberDialog?.close(); load(); },
			(e) => toast.error(errorMessage(e))
		);
		memberLoading = false;
	}

	async function removeMember(groupPk: string, groupName: string, username: string) {
		const result = await apiPost(`/authentik/groups/${groupPk}/members/remove`, { username });
		result.match(
			() => { toast.success(`${username} removed from ${groupName}`); load(); },
			(e) => toast.error(errorMessage(e))
		);
	}

	const authUrl = 'https://auth.yid.office.tw/if/admin/#/core/groups';
</script>

<svelte:head><title>Authentik Groups — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4 flex-wrap">
		<div>
			<h1 class="text-xl font-bold text-text-primary">Authentik 群組管理</h1>
			<p class="mt-1 text-sm text-text-secondary">
				管理 SSO 用戶群組。<code class="text-xs bg-background px-1.5 py-0.5 rounded">yid-admins</code> 和 <code class="text-xs bg-background px-1.5 py-0.5 rounded">yid-users</code> 為系統群組，會隨用戶角色自動同步。
			</p>
		</div>
		<div class="flex gap-2">
			<a href={authUrl} target="_blank"
				class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<ExternalLink size={14} />
				Authentik UI
			</a>
			<button onclick={load}
				class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
				重新整理
			</button>
			<button onclick={() => { newGroupName = ''; createDialog?.showModal(); }}
				class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
				<Plus size={14} /> New Group
			</button>
		</div>
	</div>

	{#if !authentikAvailable}
	<div class="rounded-xl border border-warning bg-warning-bg p-5 text-sm">
		<p class="font-medium text-text-primary">Authentik 未連接</p>
		<p class="text-text-secondary mt-1">請確認 <code class="text-xs">AUTHENTIK_API_TOKEN</code> 已設定且 Authentik 服務正常運行。</p>
	</div>
	{:else if loading}
		{#each [1,2,3] as _}
			<div class="h-32 animate-pulse rounded-xl border border-border bg-surface"></div>
		{/each}
	{:else if groups.length === 0}
		<div class="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface py-16 text-text-secondary">
			<Shield size={32} />
			<p class="text-sm">尚無群組</p>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2">
			{#each groups as group}
			{@const isSystem = SYSTEM_GROUPS.includes(group.name)}
			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<!-- Header -->
				<div class="flex items-start justify-between">
					<div class="flex items-center gap-2">
						<Shield size={15} class="text-primary shrink-0" />
						<span class="font-semibold text-text-primary">{group.name}</span>
						{#if isSystem}
						<span class="rounded-full bg-primary-subtle px-2 py-0.5 text-xs text-primary">system</span>
						{/if}
					</div>
					<div class="flex gap-1.5">
						<button onclick={() => openAddMember(group)}
							class="p-1.5 rounded text-text-disabled hover:text-success transition-colors" title="Add member">
							<UserPlus size={14} />
						</button>
						{#if !isSystem}
						<button onclick={() => deleteGroup(group.pk, group.name)}
							class="p-1.5 rounded text-text-disabled hover:text-danger transition-colors" title="Delete group">
							<Trash2 size={14} />
						</button>
						{/if}
					</div>
				</div>

				<!-- Members -->
				<div>
					<p class="text-xs text-text-secondary mb-2">
						成員 ({group.users_obj?.length ?? 0})
					</p>
					<div class="flex flex-wrap gap-1.5">
						{#each (group.users_obj ?? []) as user}
						<span class="flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs text-text-secondary">
							{user.username}
							<button onclick={() => removeMember(group.pk, group.name, user.username)}
								class="text-text-disabled hover:text-danger ml-0.5">×</button>
						</span>
						{:else}
						<span class="text-xs text-text-disabled">尚無成員</span>
						{/each}
					</div>
				</div>
			</div>
			{/each}
		</div>

		<!-- Sync info -->
		<div class="rounded-xl border border-border bg-surface px-5 py-4 text-xs text-text-secondary space-y-1">
			<p class="font-medium text-text-primary">自動同步規則</p>
			<ul class="list-disc list-inside space-y-0.5">
				<li>新增 <strong>admin</strong> 用戶 → 自動加入 <code class="bg-background px-1 rounded">yid-admins</code></li>
				<li>新增 <strong>user</strong> 用戶 → 自動加入 <code class="bg-background px-1 rounded">yid-users</code></li>
				<li>停用用戶 → Authentik 帳號同步停用（無法 SSO 登入）</li>
				<li>重新啟用用戶 → Authentik 帳號同步啟用</li>
				<li>若 Authentik 用戶不存在，請先在 Admin UI 新增用戶觸發同步</li>
			</ul>
		</div>
	{/if}
</div>

<!-- Create Group Dialog -->
<dialog bind:this={createDialog}>
	<div class="p-5 border-b border-border flex justify-between items-center">
		<h3 class="text-sm font-semibold text-text-primary">New Authentik Group</h3>
		<button onclick={() => createDialog?.close()} class="text-text-disabled hover:text-text-primary text-lg">×</button>
	</div>
	<form onsubmit={createGroup} class="p-5 space-y-4">
		<div>
			<label for="grp-name" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
				Group Name <span class="text-danger">*</span>
			</label>
			<input id="grp-name" type="text" bind:value={newGroupName} required placeholder="e.g. yid-engineers"
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary" />
		</div>
		<div class="flex justify-end gap-2">
			<button type="button" onclick={() => createDialog?.close()}
				class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">Cancel</button>
			<button type="submit" disabled={createLoading || !newGroupName.trim()}
				class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{createLoading ? 'Creating...' : 'Create Group'}
			</button>
		</div>
	</form>
</dialog>

<!-- Add Member Dialog -->
<dialog bind:this={memberDialog}>
	<div class="p-5 border-b border-border flex justify-between items-center">
		<h3 class="text-sm font-semibold text-text-primary">
			Add Member to <span class="font-mono text-primary">{memberTargetName}</span>
		</h3>
		<button onclick={() => memberDialog?.close()} class="text-text-disabled hover:text-text-primary text-lg">×</button>
	</div>
	<form onsubmit={addMember} class="p-5 space-y-4">
		<div>
			<label for="mem-user" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
				Username <span class="text-danger">*</span>
			</label>
			<input id="mem-user" type="text" bind:value={memberUsername} required placeholder="alice"
				style="font-family:monospace"
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary" />
			<p class="mt-1 text-xs text-text-disabled">用戶必須已在 Authentik 中存在（新增平台用戶後自動建立）。</p>
		</div>
		<div class="flex justify-end gap-2">
			<button type="button" onclick={() => memberDialog?.close()}
				class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">Cancel</button>
			<button type="submit" disabled={memberLoading}
				class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{memberLoading ? 'Adding...' : 'Add Member'}
			</button>
		</div>
	</form>
</dialog>

<style>
dialog {
	background: var(--color-surface); border: 1px solid var(--color-border);
	border-radius: 10px; padding: 0; width: 480px; max-width: 95vw;
	color: var(--color-text-primary); position: fixed;
	top: 50%; left: 50%; transform: translate(-50%, -50%); margin: 0;
	box-shadow: 0 8px 32px rgba(0,0,0,.4);
}
dialog::backdrop { background: rgba(0,0,0,.55); }
</style>
