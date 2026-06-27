<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost, apiDelete } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { Building2, Plus, Trash2, Users, TrendingUp, AlertCircle, Pencil } from '@lucide/svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Department {
		id: string;
		slug: string;
		display_name: string;
		description: string | null;
		max_budget: number | null;
		tpm_limit: number | null;
		rpm_limit: number | null;
		created_at: string;
		created_by: string;
		spend: number | null;   // null = spend not yet loaded
		litellm_members: { user_id: string; role: string }[];
	}

	let departments = $state<Department[]>([]);
	let loading = $state(true);
	let spendLoading = $state(false);
	let litellmAvailable = $state(true);

	// Create / Edit dialog
	let formDialog = $state<HTMLDialogElement | null>(null);
	let editTarget = $state<Department | null>(null);
	let fSlug = $state('');
	let fName = $state('');
	let fDesc = $state('');
	let fBudget = $state('');
	let fTpm = $state('');
	let fRpm = $state('');
	let formLoading = $state(false);

	const isEditing = $derived(editTarget !== null);
	const slugValid = $derived(!isEditing ? /^[a-z0-9\-_]+$/.test(fSlug) && fSlug.length > 0 : true);
	const canSubmit = $derived(fName.trim().length > 0 && (isEditing || slugValid) && !formLoading);

	// Add member dialog
	let memberDialog = $state<HTMLDialogElement | null>(null);
	let memberTarget = $state('');
	let memberUsername = $state('');
	let memberLoading = $state(false);

	onMount(load);

	async function load() {
		loading = true;
		const result = await apiGet<Department[]>('/departments', { silent: true });
		result.match(
			(data) => { departments = data; litellmAvailable = true; },
			() => { litellmAvailable = false; }
		);
		loading = false;
		// Load spend separately so the list isn't blocked on slow LiteLLM calls
		loadSpend();
	}

	async function loadSpend() {
		spendLoading = true;
		// silent: this card-level "載入用量中" is the loading indicator, not the global bar
		const result = await apiGet<Record<string, { spend: number; litellm_members: { user_id: string; role: string }[] }>>('/departments/spend', { silent: true });
		result.match(
			(spendMap) => {
				departments = departments.map(d => ({
					...d,
					spend: spendMap[d.id]?.spend ?? 0,
					litellm_members: spendMap[d.id]?.litellm_members ?? [],
				}));
			},
			() => {
				// LiteLLM unreachable — show 0 rather than perpetual loading
				departments = departments.map(d => ({ ...d, spend: d.spend ?? 0 }));
			}
		);
		spendLoading = false;
	}

	function openCreate() {
		editTarget = null;
		fSlug = ''; fName = ''; fDesc = ''; fBudget = ''; fTpm = ''; fRpm = '';
		formDialog?.showModal();
	}

	function openEdit(dept: Department) {
		editTarget = dept;
		fSlug = dept.slug;
		fName = dept.display_name;
		fDesc = dept.description ?? '';
		fBudget = dept.max_budget?.toString() ?? '';
		fTpm = dept.tpm_limit?.toString() ?? '';
		fRpm = dept.rpm_limit?.toString() ?? '';
		formDialog?.showModal();
	}

	async function submitForm(e: Event) {
		e.preventDefault();
		if (!canSubmit) return;
		formLoading = true;
		const body: Record<string, unknown> = {
			display_name: fName.trim(),
			description: fDesc.trim() || null,
			max_budget: fBudget ? parseFloat(fBudget) : null,
			tpm_limit: fTpm ? parseInt(fTpm) : null,
			rpm_limit: fRpm ? parseInt(fRpm) : null,
		};

		let result;
		if (isEditing && editTarget) {
			result = await apiPost(`/departments/${editTarget.id}`, body);
		} else {
			body.slug = fSlug.trim();
			result = await apiPost('/departments', body);
		}

		result.match(
			() => {
				toast.success(isEditing ? `Department updated` : `Department "${fName}" created`);
				formDialog?.close();
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		formLoading = false;
	}

	async function deleteDepartment(dept: Department) {
		if (!confirm(`Delete "${dept.display_name}" (${dept.slug})?\n\nExisting tokens with this department will not be revoked, but new tokens cannot be assigned to it.`)) return;
		const result = await apiDelete(`/departments/${dept.id}`);
		result.match(
			() => { toast.success('Department deleted'); load(); },
			(e) => toast.error(errorMessage(e))
		);
	}

	async function addMember(e: Event) {
		e.preventDefault();
		if (memberLoading || !memberUsername.trim()) return;
		memberLoading = true;
		const result = await apiPost(`/departments/${memberTarget}/members/add`, { username: memberUsername.trim() });
		result.match(
			() => { toast.success(`${memberUsername} added`); memberDialog?.close(); load(); },
			(e) => toast.error(errorMessage(e))
		);
		memberLoading = false;
	}

	async function removeMember(deptId: string, userId: string) {
		const result = await apiPost(`/departments/${deptId}/members/remove`, { username: userId });
		result.match(
			() => { toast.success(`${userId} removed`); load(); },
			(e) => toast.error(errorMessage(e))
		);
	}

	function budgetPct(dept: Department): number {
		if (!dept.max_budget || dept.max_budget <= 0 || dept.spend == null) return 0;
		return Math.min(100, Math.round((dept.spend / dept.max_budget) * 100));
	}

	function budgetColor(pct: number): string {
		if (pct >= 90) return 'bg-danger';
		if (pct >= 70) return 'bg-warning';
		return 'bg-success';
	}

	// Auto-generate slug from display name
	function onNameInput() {
		if (!isEditing && !fSlug) {
			fSlug = fName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
		}
	}
</script>

<svelte:head><title>Departments — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4 flex-wrap">
		<div>
			<h1 class="text-xl font-bold text-text-primary">Department Quota</h1>
			<p class="mt-1 text-sm text-text-secondary">
				管理部門的 AI 用量配額，透過 LiteLLM team 功能隔離各部門用量。
			</p>
		</div>
		<button onclick={openCreate}
			class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
			<Plus size={14} /> New Department
		</button>
	</div>

	{#if !litellmAvailable}
	<div class="flex items-start gap-3 rounded-xl border border-warning bg-warning-bg p-5">
		<AlertCircle size={18} class="text-warning shrink-0 mt-0.5" />
		<div class="text-sm space-y-1">
			<p class="font-medium text-text-primary">LiteLLM DB not configured</p>
			<p class="text-text-secondary">部門 quota 功能需要 LiteLLM 連接 PostgreSQL。</p>
			<code class="block text-xs bg-background px-3 py-2 rounded mt-2 text-text-secondary font-mono">
				# 設定 LITELLM_DB_PASSWORD 後重啟<br>
				sudo ./setup.sh init && docker compose --env-file .env -f docker/compose.litellm.yml up -d --force-recreate
			</code>
		</div>
	</div>
	{:else if loading}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each [1,2,3] as _}
				<SkeletonCard lines={3} />
			{/each}
		</div>
	{:else if departments.length === 0}
		<div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface py-16 text-text-secondary">
			<Building2 size={36} />
			<p class="text-sm">尚未建立任何部門</p>
			<button onclick={openCreate}
				class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
				<Plus size={14} /> 建立第一個部門
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
			{#each departments as dept}
			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<!-- Header -->
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<div class="flex items-center gap-2 flex-wrap">
							<Building2 size={15} class="text-primary shrink-0" />
							<span class="font-semibold text-text-primary truncate">{dept.display_name}</span>
							<code class="text-xs text-text-disabled bg-background px-1.5 py-0.5 rounded font-mono">{dept.slug}</code>
						</div>
						{#if dept.description}
						<p class="mt-1 text-xs text-text-secondary line-clamp-2">{dept.description}</p>
						{/if}
					</div>
					<div class="flex gap-1.5 shrink-0">
						<button onclick={() => openEdit(dept)} class="p-1.5 rounded text-text-disabled hover:text-text-primary hover:bg-surface-raised transition-colors" title="Edit">
							<Pencil size={13} />
						</button>
						<button onclick={() => deleteDepartment(dept)} class="p-1.5 rounded text-text-disabled hover:text-danger transition-colors" title="Delete">
							<Trash2 size={13} />
						</button>
					</div>
				</div>

				<!-- Budget bar -->
				{#if dept.max_budget}
				{@const pct = budgetPct(dept)}
				<div class="space-y-1.5">
					<div class="flex justify-between text-xs">
						<span class="text-text-secondary">月度用量</span>
						<span class={pct >= 90 ? 'text-danger font-medium' : 'text-text-secondary'}>
							{#if dept.spend == null}
								<span class="inline-flex items-center gap-1 text-text-disabled"><Spinner size={11} /> 載入用量中…</span>
							{:else}
								{dept.spend.toLocaleString()} / {dept.max_budget.toLocaleString()} tokens ({pct}%)
							{/if}
						</span>
					</div>
					<div class="h-1.5 overflow-hidden rounded-full bg-border">
						<div class={cn('h-full rounded-full transition-all', budgetColor(pct))} style="width:{pct}%"></div>
					</div>
				</div>
				{:else}
				<p class="text-xs text-text-disabled">
					{#if dept.spend == null}
						<span class="inline-flex items-center gap-1"><Spinner size={11} /> 載入用量中…</span>
					{:else}
						無月度配額限制 · 已用 {dept.spend.toLocaleString()} tokens
					{/if}
				</p>
				{/if}

				<!-- Rate limits -->
				{#if dept.tpm_limit || dept.rpm_limit}
				<div class="flex gap-4 text-xs text-text-secondary">
					{#if dept.tpm_limit}
					<span class="flex items-center gap-1"><TrendingUp size={11} />{dept.tpm_limit.toLocaleString()} TPM</span>
					{/if}
					{#if dept.rpm_limit}
					<span>{dept.rpm_limit} RPM</span>
					{/if}
				</div>
				{/if}

				<!-- Members -->
				<div>
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-medium text-text-secondary flex items-center gap-1">
							<Users size={11} /> 成員 ({dept.litellm_members?.length ?? 0})
						</span>
						<button onclick={() => { memberTarget=dept.id; memberUsername=''; memberDialog?.showModal(); }}
							class="text-xs text-text-link hover:underline">+ 新增</button>
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each (dept.litellm_members ?? []) as m}
						<span class="flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs text-text-secondary">
							{m.user_id}
							<button onclick={() => removeMember(dept.id, m.user_id)} class="text-text-disabled hover:text-danger">×</button>
						</span>
						{:else}
						<span class="text-xs text-text-disabled">尚無成員</span>
						{/each}
					</div>
				</div>
			</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Create / Edit Dialog -->
<dialog bind:this={formDialog}>
	<div class="p-5 border-b border-border flex items-center justify-between">
		<h3 class="text-sm font-semibold text-text-primary">
			{isEditing ? `Edit — ${editTarget?.display_name}` : 'New Department'}
		</h3>
		<button onclick={() => formDialog?.close()} class="text-text-disabled hover:text-text-primary text-lg">×</button>
	</div>
	<form onsubmit={submitForm} class="p-5 space-y-4">
		<!-- Display name -->
		<div>
			<label for="f-name" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
				顯示名稱 <span class="text-danger">*</span>
			</label>
			<input id="f-name" type="text" bind:value={fName} oninput={onNameInput} required
				placeholder="工程部"
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary" />
		</div>

		<!-- Slug (create only) -->
		{#if !isEditing}
		<div>
			<label for="f-slug" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
				識別碼 (slug) <span class="text-danger">*</span>
			</label>
			<input id="f-slug" type="text" bind:value={fSlug} required
				placeholder="engineering"
				pattern="[a-z0-9\-_]+"
				style="font-family:monospace"
				class={cn(
					'w-full rounded-md border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary',
					fSlug && !slugValid ? 'border-danger' : 'border-border'
				)} />
			<p class="mt-1 text-xs text-text-disabled">小寫英文、數字、連字號（建立後不可修改）</p>
			{#if fSlug && !slugValid}
			<p class="mt-0.5 text-xs text-danger">只允許小寫英文、數字、- 和 _</p>
			{/if}
		</div>
		{/if}

		<!-- Description -->
		<div>
			<label for="f-desc" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">說明</label>
			<textarea id="f-desc" bind:value={fDesc} rows={2} placeholder="部門用途說明..."
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary resize-none"></textarea>
		</div>

		<!-- Budget + limits -->
		<div class="grid grid-cols-3 gap-3">
			<div>
				<label for="f-budget" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">月度 Token 上限</label>
				<input id="f-budget" type="number" bind:value={fBudget} min="0" placeholder="無限制"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary" />
			</div>
			<div>
				<label for="f-tpm" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">TPM 限制</label>
				<input id="f-tpm" type="number" bind:value={fTpm} min="0" placeholder="無限制"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary" />
			</div>
			<div>
				<label for="f-rpm" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">RPM 限制</label>
				<input id="f-rpm" type="number" bind:value={fRpm} min="0" placeholder="無限制"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary" />
			</div>
		</div>

		<div class="flex justify-end gap-2 pt-2">
			<button type="button" onclick={() => formDialog?.close()}
				class="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised">Cancel</button>
			<button type="submit" disabled={!canSubmit}
				class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{formLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Department'}
			</button>
		</div>
	</form>
</dialog>

<!-- Add Member Dialog -->
<dialog bind:this={memberDialog}>
	<div class="p-5 border-b border-border">
		<h3 class="text-sm font-semibold text-text-primary">Add Member</h3>
	</div>
	<form onsubmit={addMember} class="p-5 space-y-4">
		<div>
			<label for="m-user" class="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
				Username <span class="text-danger">*</span>
			</label>
			<input id="m-user" type="text" bind:value={memberUsername} required placeholder="alice"
				style="font-family:monospace"
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-primary" />
			<p class="mt-1 text-xs text-text-disabled">加入後，此用戶核發的 token 會被計入此部門的用量。</p>
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
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 10px;
	padding: 0;
	width: 520px;
	max-width: 95vw;
	color: var(--color-text-primary);
	position: fixed;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	margin: 0;
	box-shadow: 0 8px 32px rgba(0,0,0,.4);
}
dialog::backdrop { background: rgba(0,0,0,.55); }
</style>
