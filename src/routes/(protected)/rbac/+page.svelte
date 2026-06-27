<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { hasRole, currentRole, type AdminRole } from '$lib/stores/auth';
	import { t } from '$lib/stores/i18n';
	import { get } from 'svelte/store';
	import { Shield, UserCheck, Plus, RefreshCw, Info, X } from '@lucide/svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';

	interface RoleDefinition {
		id: string;
		label: string;
		description: string;
	}

	interface RoleAssignment {
		username: string;
		role: string;
		group: string;
	}

	interface RolesResponse {
		roles: RoleDefinition[];
		group_map: Record<string, string>;
	}

	// ── State ──────────────────────────────────────────────────────────────────
	let roles = $state<RoleDefinition[]>([]);
	let assignments = $state<RoleAssignment[]>([]);
	let loading = $state(true);
	let saving = $state(false);

	// Assign dialog
	let showAssign = $state(false);
	let assignUsername = $state('');
	let assignRole = $state<string>('user_admin');
	let assignLoading = $state(false);

	const isSuperAdmin = $derived(hasRole($currentRole as AdminRole, 'super_admin'));

	// Role display config
	const ROLE_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
		super_admin: { color: 'text-danger',  bg: 'bg-danger-bg',  icon: '👑' },
		ops_admin:   { color: 'text-warning', bg: 'bg-warning-bg', icon: '🔧' },
		user_admin:  { color: 'text-primary', bg: 'bg-primary/10', icon: '👥' },
		viewer:      { color: 'text-text-secondary', bg: 'bg-surface-raised', icon: '👁' },
	};

	// ── Load ───────────────────────────────────────────────────────────────────
	async function load() {
		loading = true;
		const [rolesResult, usersResult] = await Promise.all([
			apiGet<RolesResponse>('/rbac/roles', { silent: true }),
			apiGet<RoleAssignment[]>('/rbac/users', { silent: true }),
		]);
		rolesResult.match((d) => { roles = d.roles; }, (e) => toast.error(errorMessage(e)));
		usersResult.match((d) => { assignments = d; }, () => {});
		loading = false;
	}

	onMount(load);

	// ── Actions ────────────────────────────────────────────────────────────────
	async function assignRole_() {
		if (!assignUsername.trim() || !assignRole) return;
		assignLoading = true;
		const result = await apiPost('/rbac/assign', {
			username: assignUsername.trim(),
			role: assignRole,
		});
		result.match(
			() => {
				toast.success(`${assignUsername} ${get(t)('rbac.toast_assigned_as', '已指派為')} ${roles.find(r => r.id === assignRole)?.label}`);
				showAssign = false;
				assignUsername = '';
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		assignLoading = false;
	}

	// Group assignments by role for display
	const byRole = $derived(
		roles.map(r => ({
			...r,
			members: assignments.filter(a => a.role === r.id),
		}))
	);
</script>

<svelte:head><title>{$t('rbac.page_title', '角色管理')} — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-bold text-text-primary">{$t('rbac.title', '角色管理')}</h1>
			<p class="mt-1 text-sm text-text-secondary">{$t('rbac.subtitle', '管理管理員的存取權限，基於 Authentik 群組自動同步')}</p>
		</div>
		<div class="flex gap-2">
			<button onclick={load} class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
				{$t('rbac.refresh', '重新整理')}
			</button>
			{#if isSuperAdmin}
			<button onclick={() => showAssign = true}
				class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
				<Plus size={14} />
				{$t('rbac.assign_role', '指派角色')}
			</button>
			{/if}
		</div>
	</div>

	<!-- Role legend -->
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		{#each roles as role}
		{@const cfg = ROLE_CONFIG[role.id]}
		<div class="rounded-xl border border-border bg-surface p-4 space-y-2">
			<div class="flex items-center gap-2">
				<span class="text-lg">{cfg?.icon}</span>
				<span class={cn('text-sm font-semibold', cfg?.color)}>{role.label}</span>
				<span class={cn('ml-auto rounded-full px-2 py-0.5 text-xs font-mono', cfg?.bg, cfg?.color)}>
					{byRole.find(r => r.id === role.id)?.members.length ?? 0}
				</span>
			</div>
			<p class="text-xs text-text-secondary leading-relaxed">{role.description}</p>
		</div>
		{/each}
	</div>

	<!-- Authentik group note -->
	<div class="flex gap-3 rounded-xl border border-info/30 bg-info-bg px-5 py-3 text-sm text-text-secondary">
		<Info size={16} class="text-info shrink-0 mt-0.5" />
		<div>
			<span class="font-medium text-text-primary">{$t('rbac.note_title', '角色由 Authentik 群組決定')}</span>
			<span class="ml-2">{$t('rbac.note_body', '登入時自動從 OIDC token 的 groups claim 同步。修改後用戶需重新登入才生效。')}</span>
			<span class="ml-1">{$t('rbac.note_group_names', '群組名稱：')}</span>
			<code class="ml-1 rounded bg-background px-1.5 py-0.5 text-xs">yid-super-admin</code>
			<code class="ml-1 rounded bg-background px-1.5 py-0.5 text-xs">yid-ops-admin</code>
			<code class="ml-1 rounded bg-background px-1.5 py-0.5 text-xs">yid-user-admin</code>
			<code class="ml-1 rounded bg-background px-1.5 py-0.5 text-xs">yid-viewer</code>
		</div>
	</div>

	<!-- Current assignments -->
	{#if loading}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each [1,2,3,4] as _}
			<SkeletonCard lines={3} />
			{/each}
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each byRole as role}
			{@const cfg = ROLE_CONFIG[role.id]}
			<div class="rounded-xl border border-border bg-surface overflow-hidden">
				<div class={cn('px-4 py-2.5 border-b border-border flex items-center gap-2', cfg?.bg)}>
					<span>{cfg?.icon}</span>
					<span class={cn('text-sm font-semibold', cfg?.color)}>{role.label}</span>
				</div>
				<div class="p-2 space-y-1 min-h-12">
					{#if role.members.length === 0}
					<p class="px-2 py-2 text-xs text-text-disabled">{$t('rbac.no_members', '無成員')}</p>
					{:else}
					{#each role.members as member}
					<div class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-raised">
						<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
							{member.username.slice(0,1).toUpperCase()}
						</div>
						<span class="text-sm font-mono text-text-primary truncate">{member.username}</span>
					</div>
					{/each}
					{/if}
				</div>
			</div>
			{/each}
		</div>
	{/if}

	<!-- Access matrix -->
	<div class="rounded-xl border border-border bg-surface overflow-hidden">
		<div class="border-b border-border px-5 py-3">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-text-secondary">{$t('rbac.access_matrix', '存取權限矩陣')}</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead>
					<tr class="border-b border-border">
						<th class="px-5 py-2.5 text-left text-xs font-medium text-text-secondary">{$t('rbac.matrix_module_col', '功能模組')}</th>
						{#each roles as role}
						{@const cfg = ROLE_CONFIG[role.id]}
						<th class="px-4 py-2.5 text-center text-xs font-medium whitespace-nowrap {cfg?.color}">{role.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each [
						{ key: 'rbac.module_warroom', name: '戰情室', roles: ['viewer', 'user_admin', 'ops_admin', 'super_admin'] },
						{ key: 'rbac.module_dashboard', name: '儀表板', roles: ['viewer', 'user_admin', 'ops_admin', 'super_admin'] },
						{ key: 'rbac.module_audit_log', name: '稽核日誌', roles: ['viewer', 'user_admin', 'ops_admin', 'super_admin'] },
						{ key: 'rbac.module_user_mgmt', name: '用戶管理', roles: ['user_admin', 'ops_admin', 'super_admin'] },
						{ key: 'rbac.module_device_mgmt', name: '裝置管理', roles: ['user_admin', 'ops_admin', 'super_admin'] },
						{ key: 'rbac.module_token_mgmt', name: 'Token 管理', roles: ['user_admin', 'ops_admin', 'super_admin'] },
						{ key: 'rbac.module_dept_mgmt', name: '部門管理', roles: ['user_admin', 'ops_admin', 'super_admin'] },
						{ key: 'rbac.module_usage_report', name: '用量報表', roles: ['user_admin', 'ops_admin', 'super_admin'] },
						{ key: 'rbac.module_model_mgmt', name: '模型管理', roles: ['ops_admin', 'super_admin'] },
						{ key: 'rbac.module_service_mgmt', name: '服務管理', roles: ['ops_admin', 'super_admin'] },
						{ key: 'rbac.module_sso_groups', name: 'SSO 群組', roles: ['ops_admin', 'super_admin'] },
						{ key: 'rbac.module_skills_mgmt', name: 'Skills 管理', roles: ['ops_admin', 'super_admin'] },
						{ key: 'rbac.module_push_notif', name: '推播通知', roles: ['ops_admin', 'super_admin'] },
						{ key: 'rbac.module_license_mgmt', name: '授權管理', roles: ['super_admin'] },
						{ key: 'rbac.module_role_mgmt', name: '角色管理', roles: ['super_admin'] },
					] as row}
					<tr class="border-t border-border hover:bg-surface-raised">
						<td class="px-5 py-2.5 text-sm text-text-primary">{$t(row.key, row.name)}</td>
						{#each roles as role}
						<td class="px-4 py-2.5 text-center">
							{#if row.roles.includes(role.id)}
							<span class="text-success">✓</span>
							{:else}
							<span class="text-border">—</span>
							{/if}
						</td>
						{/each}
					</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Assign Role Dialog -->
{#if showAssign}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
	role="presentation" onclick={() => showAssign = false}
	onkeydown={e => e.key === 'Escape' && (showAssign = false)}>
	<div class="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl"
		role="dialog" aria-modal="true" tabindex="-1"
		onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()}>
		<div class="flex items-center justify-between border-b border-border px-5 py-4">
			<h2 class="text-sm font-semibold text-text-primary flex items-center gap-2">
				<UserCheck size={16} class="text-primary" />
				{$t('rbac.assign_role', '指派角色')}
			</h2>
			<button onclick={() => showAssign = false} class="rounded p-1 text-text-disabled hover:text-text-primary">
				<X size={16} />
			</button>
		</div>
		<div class="p-5 space-y-4">
			<div>
				<label for="assign-user" class="mb-1 block text-xs font-medium text-text-secondary">{$t('rbac.field_username', '用戶名稱')}</label>
				<input id="assign-user" bind:value={assignUsername}
					placeholder="alice"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary" />
			</div>
			<div>
				<label for="assign-role" class="mb-1 block text-xs font-medium text-text-secondary">{$t('rbac.field_role', '角色')}</label>
				<select id="assign-role" bind:value={assignRole}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
					{#each roles as role}
					{@const cfg = ROLE_CONFIG[role.id]}
					<option value={role.id}>{cfg?.icon} {role.label} — {role.description}</option>
					{/each}
				</select>
			</div>
			<div class="rounded-lg bg-surface-raised px-4 py-3 text-xs text-text-secondary">
				<p>{$t('rbac.dialog_group_prefix', '將把用戶加入 Authentik 群組')} <code class="bg-background px-1 rounded">yid-{assignRole.replace('_', '-')}</code>{$t('rbac.dialog_group_suffix', '。')}</p>
				<p class="mt-1">{$t('rbac.dialog_relogin_note', '用戶需重新登入後角色才會生效。')}</p>
			</div>
		</div>
		<div class="flex justify-end gap-2 border-t border-border px-5 py-4">
			<button onclick={() => showAssign = false}
				class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised">
				{$t('rbac.cancel', '取消')}
			</button>
			<button onclick={assignRole_} disabled={!assignUsername.trim() || assignLoading}
				class="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{#if assignLoading}<RefreshCw size={13} class="animate-spin" />{:else}<UserCheck size={13} />{/if}
				{$t('rbac.submit_assign', '指派')}
			</button>
		</div>
	</div>
</div>
{/if}
