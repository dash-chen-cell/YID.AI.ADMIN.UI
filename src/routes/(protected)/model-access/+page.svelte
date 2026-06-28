<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { Globe, Users, ShieldCheck, RefreshCw, FolderSync } from '@lucide/svelte';
	import SkeletonTable from '$lib/components/ui/SkeletonTable.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	// CCP-1: Open WebUI 模型權限中央集控 — 模型 × 部門 group 權限矩陣。
	// 後端走 Open WebUI API(/api/openwebui/*)。公開 = 所有人可用;
	// 否則只有勾選的部門 group 看得到該模型。

	interface OwuiModel {
		id: string;
		name: string;
		base_model_id: string | null;
		is_public: boolean;
		group_ids: string[];
	}
	interface OwuiGroup {
		id: string;
		name: string;
		is_dept: boolean;
	}

	let models = $state<OwuiModel[]>([]);
	let groups = $state<OwuiGroup[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let savingId = $state<string | null>(null);
	let syncing = $state(false);

	// 只顯示部門 group 當欄位(yid-dept-*);其他 group(角色)不在矩陣
	const deptGroups = $derived(groups.filter((g) => g.is_dept));

	async function load() {
		loading = true;
		loadError = null;
		const [mRes, gRes] = await Promise.all([
			apiGet<{ models: OwuiModel[] }>('/openwebui/models', { silent: true }),
			apiGet<{ groups: OwuiGroup[] }>('/openwebui/groups', { silent: true })
		]);
		mRes.match(
			(d) => {
				models = d.models ?? [];
			},
			(e) => {
				loadError = errorMessage(e);
			}
		);
		gRes.match(
			(d) => {
				groups = d.groups ?? [];
			},
			(e) => {
				loadError ??= errorMessage(e);
			}
		);
		loading = false;
	}

	onMount(load);

	// 同步部門:把 Authentik yid-dept-* group 主動建進 Open WebUI(免等員工登入)。
	interface SyncResult {
		created: string[];
		skipped: string[];
		failed: { name: string; error: string }[];
		authentik_dept_count: number;
	}
	async function syncDepartments() {
		if (syncing) return;
		syncing = true;
		const res = await apiPost<SyncResult>('/openwebui/groups/sync', {});
		await res.match(
			async (d) => {
				if (d.created.length > 0) {
					toast.success(`已同步 ${d.created.length} 個部門:${d.created.map((n) => n.replace('yid-dept-', '')).join('、')}`);
				} else {
					toast.info('部門已是最新,沒有需要同步的');
				}
				if (d.failed.length > 0) {
					toast.error(`${d.failed.length} 個部門同步失敗:${d.failed.map((f) => f.name).join('、')}`);
				}
				await load(); // 重新載入矩陣,新部門變成欄位
			},
			async (e) => {
				toast.error(errorMessage(e));
			}
		);
		syncing = false;
	}

	// 設某模型的存取:public 或 私有給 group_ids
	async function setAccess(model: OwuiModel, next: { public: boolean; group_ids: string[] }) {
		if (savingId) return;
		savingId = model.id;
		const res = await apiPost<{ ok: boolean }>(`/openwebui/models/${model.id}/access`, next);
		res.match(
			() => {
				model.is_public = next.public;
				model.group_ids = next.group_ids;
				toast.success(`已更新「${model.name}」的存取權限`);
			},
			(e) => {
				toast.error(errorMessage(e));
			}
		);
		savingId = null;
	}

	function togglePublic(model: OwuiModel) {
		// 切換公開:開 → 公開;關 → 私有(清空 group,變成沒人可見,需再勾部門)
		setAccess(model, { public: !model.is_public, group_ids: model.is_public ? model.group_ids : [] });
	}

	function toggleGroup(model: OwuiModel, groupId: string) {
		// 勾部門 = 私有 + 該 group。勾任一部門會自動取消公開。
		const has = model.group_ids.includes(groupId);
		const next = has
			? model.group_ids.filter((g) => g !== groupId)
			: [...model.group_ids, groupId];
		setAccess(model, { public: false, group_ids: next });
	}

	function accessLabel(m: OwuiModel): { text: string; cls: string } {
		if (m.is_public) return { text: '公開', cls: 'text-success bg-success-bg' };
		if (m.group_ids.length > 0)
			return { text: `${m.group_ids.length} 部門`, cls: 'text-primary bg-primary-subtle' };
		return { text: '私有(無人)', cls: 'text-warning bg-warning-bg' };
	}
</script>

<div class="space-y-5">
	<header class="flex items-start justify-between gap-4">
		<div>
			<h1 class="flex items-center gap-2 text-lg font-semibold text-text-primary">
				<ShieldCheck size={20} /> 模型存取權限
			</h1>
			<p class="mt-1 text-sm text-text-secondary">
				中央集控 Open WebUI 模型權限。公開 = 全員可用;否則只有勾選的部門看得到。
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<button
				onclick={syncDepartments}
				disabled={syncing || loading}
				title="把 Authentik 部門 group 主動建進 Open WebUI(免等員工登入)"
				class={cn(
					'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm',
					'text-text-secondary hover:bg-surface-raised disabled:opacity-50'
				)}
			>
				<FolderSync size={14} class={syncing ? 'animate-spin' : ''} /> 同步部門
			</button>
			<button
				onclick={load}
				disabled={loading}
				class={cn(
					'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm',
					'text-text-secondary hover:bg-surface-raised disabled:opacity-50'
				)}
			>
				<RefreshCw size={14} class={loading ? 'animate-spin' : ''} /> 重新整理
			</button>
		</div>
	</header>

	{#if loading}
		<SkeletonTable rows={8} cols={4} />
	{:else if loadError}
		<div class="rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger">
			{loadError}
		</div>
	{:else if deptGroups.length === 0}
		<div class="rounded-lg border border-warning bg-warning-bg p-4 text-sm text-warning">
			目前沒有部門 group(yid-dept-*)可指派。按右上角「同步部門」即可把 Authentik
			的部門 group 主動建進 Open WebUI(不必等員工登入)。
		</div>
	{:else}
		<div class="overflow-x-auto rounded-xl border border-border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border bg-background text-text-secondary">
						<th class="px-4 py-3 text-left font-medium">模型</th>
						<th class="px-3 py-3 text-center font-medium">
							<span class="inline-flex items-center gap-1"><Globe size={13} /> 公開</span>
						</th>
						{#each deptGroups as g (g.id)}
							<th class="px-3 py-3 text-center font-medium whitespace-nowrap">
								{g.name.replace('yid-dept-', '')}
							</th>
						{/each}
						<th class="px-3 py-3 text-center font-medium">狀態</th>
					</tr>
				</thead>
				<tbody>
					{#each models as m (m.id)}
						{@const busy = savingId === m.id}
						{@const label = accessLabel(m)}
						<tr class="border-b border-border last:border-0 hover:bg-surface-raised/50">
							<td class="px-4 py-2.5">
								<div class="font-mono text-xs font-medium text-text-primary">{m.id}</div>
								{#if m.name && m.name !== m.id}
									<div class="text-xs text-text-secondary">{m.name}</div>
								{/if}
							</td>
							<td class="px-3 py-2.5 text-center">
								<input
									type="checkbox"
									checked={m.is_public}
									disabled={busy}
									onchange={() => togglePublic(m)}
									class="size-4 accent-success disabled:opacity-40"
								/>
							</td>
							{#each deptGroups as g (g.id)}
								<td class="px-3 py-2.5 text-center">
									<input
										type="checkbox"
										checked={m.group_ids.includes(g.id)}
										disabled={busy || m.is_public}
										onchange={() => toggleGroup(m, g.id)}
										class="size-4 accent-primary disabled:opacity-30"
									/>
								</td>
							{/each}
							<td class="px-3 py-2.5 text-center">
								{#if busy}
									<Spinner size={14} />
								{:else}
									<span class={cn('inline-block rounded px-2 py-0.5 text-xs font-medium', label.cls)}>
										{label.text}
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="flex items-center gap-1.5 text-xs text-text-secondary">
			<Users size={13} /> 勾「公開」= 全員可用;勾部門 = 只該部門可見(自動轉私有)。跨部門可勾多欄。
		</p>
	{/if}
</div>
