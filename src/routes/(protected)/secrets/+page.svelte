<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost, apiPatch, apiDelete } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { currentUser } from '$lib/stores/auth';
	import { t } from '$lib/stores/i18n';
	import { get } from 'svelte/store';
	import {
		Key, Plus, RefreshCw, Eye, EyeOff, Copy, Check,
		Pencil, Trash2, X, AlertTriangle, ExternalLink, Lock
	} from '@lucide/svelte';
	import SkeletonTable from '$lib/components/ui/SkeletonTable.svelte';

	// ── Types ──────────────────────────────────────────────────────────────────
	interface SecretStatus {
		configured: boolean;
		reachable: boolean;
		url: string;
		project_id: string;
		env: string;
	}

	interface SecretMeta {
		id: string;
		key: string;
		has_value: boolean;
		comment: string;
		created_at: string;
		updated_at: string;
		source?: 'infisical' | 'env';
		readonly?: boolean;
	}

	// ── State ──────────────────────────────────────────────────────────────────
	let status = $state<SecretStatus | null>(null);
	let secrets = $state<SecretMeta[]>([]);
	let loading = $state(true);
	let searchQ = $state('');

	// Reveal state: key → value (fetched on demand)
	let revealedValues = $state<Record<string, string>>({});
	let revealLoading = $state<Record<string, boolean>>({});
	let copiedKey = $state<string | null>(null);

	interface ImpactInfo {
		key: string;
		affected_services: { service: string; impact: string; risk: string }[];
		risk: 'high' | 'medium' | 'low';
		requires_restart: boolean;
		restart_services: string[];
	}

	// Edit dialog
	let editDialog = $state<{key: string; value: string; comment: string; isNew: boolean} | null>(null);
	let editLoading = $state(false);
	let editImpact = $state<ImpactInfo | null>(null);
	let editConfirmText = $state('');

	// Delete confirm
	let deleteTarget = $state<string | null>(null);
	let deleteConfirmText = $state('');
	let deleteImpact = $state<ImpactInfo | null>(null);

	const isFallbackMode = $derived(
		secrets.length > 0 && secrets.every(s => s.source === 'env')
	);

	const filteredSecrets = $derived(
		searchQ.trim()
			? secrets.filter(s => s.key.toLowerCase().includes(searchQ.toLowerCase()) ||
				s.comment.toLowerCase().includes(searchQ.toLowerCase()))
			: secrets
	);

	// Group secrets by prefix (e.g. AUTHENTIK_, LITELLM_, OAUTH2_)
	const grouped = $derived(() => {
		const groups: Record<string, SecretMeta[]> = {};
		for (const s of filteredSecrets) {
			const prefix = s.key.includes('_') ? s.key.split('_')[0] : 'OTHER';
			if (!groups[prefix]) groups[prefix] = [];
			groups[prefix].push(s);
		}
		return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
	});

	// ── Load ───────────────────────────────────────────────────────────────────
	async function load() {
		loading = true;
		const [statusResult, secretsResult] = await Promise.all([
			apiGet<SecretStatus>('/secrets/status', { silent: true }),
			apiGet<SecretMeta[]>('/secrets', { silent: true }),
		]);
		statusResult.match((d) => { status = d; }, () => {});
		secretsResult.match(
			(d) => { secrets = d; },
			() => { secrets = []; }
		);
		loading = false;
	}

	onMount(load);

	// ── Actions ────────────────────────────────────────────────────────────────
	async function revealSecret(key: string) {
		if (revealedValues[key] !== undefined) {
			// Toggle hide
			const next = { ...revealedValues };
			delete next[key];
			revealedValues = next;
			return;
		}
		revealLoading = { ...revealLoading, [key]: true };
		const result = await apiGet<{ key: string; value: string }>(`/secrets/${key}`);
		result.match(
			(d) => { revealedValues = { ...revealedValues, [key]: d.value }; },
			(e) => toast.error(errorMessage(e))
		);
		revealLoading = { ...revealLoading, [key]: false };
	}

	async function copySecret(key: string) {
		let value = revealedValues[key];
		if (!value) {
			const result = await apiGet<{ value: string }>(`/secrets/${key}`);
			if (result.isErr()) return toast.error(get(t)('secrets.toast_fetch_value_failed', '無法取得值'));
			value = result.value.value;
		}
		await navigator.clipboard.writeText(value);
		copiedKey = key;
		setTimeout(() => { copiedKey = null; }, 2000);
		toast.success(get(t)('secrets.toast_copied', '已複製') + ` ${key}`);
	}

	const editConfirmRequired = $derived(
		editDialog && !editDialog.isNew && editImpact?.risk === 'high'
	);
	const editCanSave = $derived(
		editDialog && editDialog.value.trim() &&
		(editDialog.isNew || !editConfirmRequired || editConfirmText === editDialog.key)
	);

	async function saveSecret() {
		if (!editDialog || editLoading || !editCanSave) return;
		editLoading = true;
		const { key, value, comment, isNew } = editDialog;

		// Create → POST /secrets ; Update → PATCH /secrets/{key}
		const result = isNew
			? await apiPost('/secrets', { key, value, comment })
			: await apiPatch(`/secrets/${key}`, { value, comment });

		result.match(
			() => {
				toast.success(`Secret "${key}" ` + (isNew
					? get(t)('secrets.toast_created', '已建立')
					: get(t)('secrets.toast_updated', '已更新')));
				editDialog = null;
				if (revealedValues[key]) {
					const next = { ...revealedValues };
					delete next[key];
					revealedValues = next;
				}
				load();
			},
			(e) => toast.error(errorMessage(e))
		);
		editLoading = false;
	}

	async function deleteSecret(key: string) {
		const result = await apiDelete(`/secrets/${key}`);
		result.match(
			() => { toast.success(`Secret "${key}" ` + get(t)('secrets.toast_deleted', '已刪除')); deleteTarget = null; load(); },
			(e) => toast.error(errorMessage(e))
		);
	}

	function openNew() {
		editDialog = { key: '', value: '', comment: '', isNew: true };
	}

	async function openEdit(s: SecretMeta) {
		editDialog = { key: s.key, value: revealedValues[s.key] ?? '', comment: s.comment, isNew: false };
		editConfirmText = '';
		editImpact = null;
		// Load impact analysis
		const result = await apiGet<ImpactInfo>(`/secrets/${s.key}/impact`);
		result.match((d) => { editImpact = d; }, () => {});
	}

	async function openDelete(key: string) {
		deleteTarget = key;
		deleteConfirmText = '';
		deleteImpact = null;
		const result = await apiGet<ImpactInfo>(`/secrets/${key}/impact`);
		result.match((d) => { deleteImpact = d; }, () => {});
	}

	function fmt(dateStr: string) {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString('zh-TW', { hour12: false });
	}
</script>

<svelte:head><title>{$t('secrets.title', 'Secrets 管理')} — YID AI Admin</title></svelte:head>

<div class="space-y-5">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-bold text-text-primary flex items-center gap-2">
				<Lock size={20} class="text-primary" />
				{$t('secrets.title', 'Secrets 管理')}
			</h1>
			<p class="mt-1 text-sm text-text-secondary">{$t('secrets.subtitle', '透過 Infisical 管理所有平台密鑰')}</p>
		</div>
		<div class="flex gap-2">
			<button onclick={load}
				class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
				{$t('secrets.refresh', '重新整理')}
			</button>
			{#if !isFallbackMode}
			<button onclick={openNew}
				class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
				<Plus size={14} />
				{$t('secrets.add_secret', '新增 Secret')}
			</button>
			{/if}
		</div>
	</div>

	<!-- Infisical status -->
	{#if status}
	<div class={cn(
		'flex items-center gap-3 rounded-xl border px-5 py-3 text-sm',
		status.reachable ? 'border-success/30 bg-success-bg' : 'border-warning/30 bg-warning-bg'
	)}>
		<div class={cn('h-2 w-2 rounded-full', status.reachable ? 'bg-success' : 'bg-warning animate-pulse')}></div>
		<div class="flex-1">
			{#if status.reachable}
				<span class="text-success font-medium">{$t('secrets.status_connected', 'Infisical 連線正常')}</span>
				<span class="text-text-secondary ml-2">env: {status.env} · project: {status.project_id.slice(0, 8)}…</span>
			{:else if status.configured}
				<span class="text-warning font-medium">{$t('secrets.status_unreachable', 'Infisical 無法連線')}</span>
				<span class="text-text-secondary ml-2">{status.url}</span>
			{:else}
				<span class="text-warning font-medium">{$t('secrets.status_not_configured', 'Infisical 未設定')}</span>
				<span class="text-text-secondary ml-2">{$t('secrets.status_not_configured_hint', '需設定 INFISICAL_TOKEN_PLATFORM 和 INFISICAL_PROJECT_ID')}</span>
			{/if}
		</div>
		<a href={status.url} target="_blank"
			class="flex items-center gap-1 text-xs text-text-link hover:underline">
			<ExternalLink size={11} /> {$t('secrets.open', '開啟')}
		</a>
	</div>
	{/if}

	<!-- Fallback mode banner (Infisical unreachable, showing .env vars) -->
	{#if isFallbackMode}
	<div class="flex items-start gap-3 rounded-xl border border-info/30 bg-info-bg px-5 py-3 text-sm">
		<Lock size={16} class="text-info shrink-0 mt-0.5" />
		<div class="text-xs text-text-secondary space-y-1">
			<p class="text-sm font-medium text-text-primary">{$t('secrets.fallback_title', 'Fallback 模式 — 顯示目前 .env 環境變數（唯讀）')}</p>
			<p>{$t('secrets.fallback_desc', 'Infisical 尚未啟動或無法連線。可查看現有 secrets，但無法新增/修改/刪除。')}</p>
			<p class="pt-1">{$t('secrets.fallback_enable_prefix', '啟用完整管理：①')} <code class="bg-background px-1.5 py-0.5 rounded">sudo ./setup.sh infisical</code> {$t('secrets.fallback_enable_step2', '② 設定')} <code class="bg-background px-1 rounded">INFISICAL_TOKEN_PLATFORM</code> + <code class="bg-background px-1 rounded">INFISICAL_PROJECT_ID</code>{$t('secrets.fallback_enable_suffix', '（參考 docs/infisical-setup.md）')}</p>
		</div>
	</div>
	{/if}

	<!-- Empty placeholder (no secrets) -->
	{#if !loading && secrets.length === 0}
	<div class="rounded-xl border border-border bg-surface p-8 text-center space-y-3">
		<Lock size={36} class="mx-auto text-text-disabled" />
		{#if status?.configured}
			<!-- Infisical is connected, just has no secrets yet -->
			<p class="text-sm font-medium text-text-primary">{$t('secrets.empty_connected_title', 'Infisical 已連線，尚無任何 Secret')}</p>
			<p class="text-xs text-text-secondary">{$t('secrets.empty_connected_hint', '點上方「新增 Secret」開始建立，或於各功能頁（如通知通道）設定時自動寫入。')}</p>
		{:else}
			<!-- Infisical not configured -->
			<p class="text-sm font-medium text-text-primary">{$t('secrets.empty_title', '尚未設定 Infisical 且無可用環境變數')}</p>
			<div class="text-xs text-text-secondary space-y-1">
				<p>{$t('secrets.empty_step1_prefix', '1. 執行')} <code class="bg-background px-2 py-0.5 rounded">sudo ./setup.sh infisical</code> {$t('secrets.empty_step1_suffix', '啟動服務')}</p>
				<p>{$t('secrets.empty_step2', '2. 在 Infisical UI 建立 project，取得 Machine Identity（Universal Auth）')}</p>
				<p>{$t('secrets.empty_step3_prefix', '3. 設定')} <code class="bg-background px-1 rounded">INFISICAL_CLIENT_ID</code> / <code class="bg-background px-1 rounded">INFISICAL_CLIENT_SECRET</code> / <code class="bg-background px-1 rounded">INFISICAL_PROJECT_ID</code> {$t('secrets.empty_step3_suffix', '到 .env')}</p>
			</div>
		{/if}
	</div>

	<!-- Secrets list -->
	{:else}

	<!-- Search -->
	<div class="flex items-center gap-2">
		<input bind:value={searchQ} placeholder={$t('secrets.search_placeholder', '搜尋 secret key...')}
			class="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
		<span class="text-xs text-text-disabled">{filteredSecrets.length} / {secrets.length} {$t('secrets.count_unit', '個')}</span>
	</div>

	<!-- Secrets list -->
	{#if loading}
		<SkeletonTable rows={6} cols={4} />
	{:else if secrets.length === 0}
		<div class="rounded-xl border border-border bg-surface py-16 text-center text-text-secondary">
			<Key size={32} class="mx-auto mb-2" />
			<p class="text-sm">{$t('secrets.none', '尚無 Secrets')}</p>
		</div>
	{:else}
		<!-- Grouped by prefix -->
		<div class="space-y-4">
			{#each grouped() as [prefix, items]}
			<div class="overflow-hidden rounded-xl border border-border bg-surface">
				<div class="border-b border-border bg-surface-raised px-5 py-2.5">
					<span class="text-xs font-semibold uppercase tracking-wide text-text-secondary">{prefix}</span>
					<span class="ml-2 text-xs text-text-disabled">{items.length} {$t('secrets.count_unit', '個')}</span>
				</div>
				<table class="w-full">
					<tbody>
						{#each items as s}
						<tr class="border-t border-border first:border-0 hover:bg-surface-raised transition-colors">
							<!-- Key -->
							<td class="px-5 py-3 w-80">
								<span class="font-mono text-sm font-medium text-text-primary">{s.key}</span>
								{#if s.comment}
								<div class="text-xs text-text-disabled mt-0.5">{s.comment}</div>
								{/if}
							</td>
							<!-- Value (masked) — fixed width, truncates so it never pushes other columns -->
							<td class="px-3 py-3 w-full max-w-0">
								{#if revealedValues[s.key] !== undefined}
									<code class="text-xs bg-background rounded px-2 py-1 font-mono text-text-primary block truncate">
										{revealedValues[s.key] || '(empty)'}
									</code>
								{:else}
									<span class="text-xs text-text-disabled font-mono">{'•'.repeat(16)}</span>
								{/if}
							</td>
							<!-- Updated -->
							<td class="px-3 py-3 text-xs text-text-disabled whitespace-nowrap hidden lg:table-cell">
								{fmt(s.updated_at)}
							</td>
							<!-- Actions — always right-aligned, fixed -->
							<td class="px-4 py-3 whitespace-nowrap text-right">
								<div class="flex items-center justify-end gap-1">
									<!-- Reveal/Hide -->
									<button onclick={() => revealSecret(s.key)}
										disabled={revealLoading[s.key]}
										class="p-1.5 rounded text-text-disabled hover:text-text-primary hover:bg-surface-raised transition-colors"
										title={revealedValues[s.key] !== undefined ? $t('secrets.hide', '隱藏') : $t('secrets.show', '顯示')}>
										{#if revealLoading[s.key]}
											<RefreshCw size={13} class="animate-spin" />
										{:else if revealedValues[s.key] !== undefined}
											<EyeOff size={13} />
										{:else}
											<Eye size={13} />
										{/if}
									</button>
									<!-- Copy -->
									<button onclick={() => copySecret(s.key)}
										class="p-1.5 rounded text-text-disabled hover:text-primary hover:bg-surface-raised transition-colors"
										title={$t('secrets.copy_value', '複製值')}>
										{#if copiedKey === s.key}
											<Check size={13} class="text-success" />
										{:else}
											<Copy size={13} />
										{/if}
									</button>
									{#if s.source !== 'env'}
									<!-- Edit -->
									<button onclick={() => openEdit(s)}
										class="p-1.5 rounded text-text-disabled hover:text-text-primary hover:bg-surface-raised transition-colors"
										title={$t('secrets.edit', '編輯')}>
										<Pencil size={13} />
									</button>
									<!-- Delete -->
									<button onclick={() => openDelete(s.key)}
										class="p-1.5 rounded text-text-disabled hover:text-danger hover:bg-danger-bg transition-colors"
										title={$t('secrets.delete', '刪除')}>
										<Trash2 size={13} />
									</button>
									{/if}
								</div>
							</td>
						</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{/each}
		</div>
	{/if}
	{/if}
</div>

<!-- Edit/Create Dialog -->
{#if editDialog}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
	role="presentation" onclick={() => editDialog = null}
	onkeydown={e => e.key === 'Escape' && (editDialog = null)}>
	<div class="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl"
		role="dialog" aria-modal="true" tabindex="-1"
		onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()}>
		<div class="flex items-center justify-between border-b border-border px-5 py-4">
			<h2 class="text-sm font-semibold text-text-primary">
				{editDialog.isNew ? $t('secrets.add_secret', '新增 Secret') : $t('secrets.edit', '編輯') + ` ${editDialog.key}`}
			</h2>
			<button onclick={() => editDialog = null} class="rounded p-1 text-text-disabled hover:text-text-primary">
				<X size={16} />
			</button>
		</div>
		<div class="p-5 space-y-4">
			{#if editDialog.isNew}
			<div>
				<label for="secret-key" class="mb-1 block text-xs font-medium text-text-secondary">Key</label>
				<input id="secret-key" bind:value={editDialog.key}
					placeholder="EXAMPLE_SECRET_KEY"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary" />
			</div>
			{/if}
			<div>
				<label for="secret-val" class="mb-1 block text-xs font-medium text-text-secondary">{$t('secrets.field_value', '值')}</label>
				<textarea id="secret-val" bind:value={editDialog.value}
					rows={3}
					placeholder="secret value..."
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary resize-none"></textarea>
			</div>
			<div>
				<label for="secret-comment" class="mb-1 block text-xs font-medium text-text-secondary">{$t('secrets.field_comment', '說明（選填）')}</label>
				<input id="secret-comment" bind:value={editDialog.comment}
					placeholder={$t('secrets.field_comment_placeholder', '用途說明...')}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
			</div>
			{#if !editDialog.isNew && editImpact}
			<!-- Impact analysis -->
			<div class={cn(
				'rounded-lg border px-4 py-3 text-xs space-y-2',
				editImpact.risk === 'high' ? 'border-danger/30 bg-danger-bg' :
				editImpact.risk === 'medium' ? 'border-warning/30 bg-warning-bg' :
				'border-border bg-surface-raised'
			)}>
				<div class="flex items-center gap-2 font-medium">
					<AlertTriangle size={13} class={editImpact.risk === 'high' ? 'text-danger' : 'text-warning'} />
					<span class={editImpact.risk === 'high' ? 'text-danger' : 'text-warning'}>
						{editImpact.risk === 'high' ? $t('secrets.risk_high', '⚠️ 高風險操作') : editImpact.risk === 'medium' ? $t('secrets.risk_medium', '注意：中等風險') : $t('secrets.risk_low', '低風險操作')}
					</span>
				</div>
				{#if editImpact.affected_services.length > 0}
				<div class="space-y-1">
					<p class="text-text-secondary font-medium">{$t('secrets.impact_scope', '影響範圍：')}</p>
					{#each editImpact.affected_services as svc}
					<div class="flex items-start gap-2">
						<code class="shrink-0 rounded bg-background px-1.5 py-0.5">{svc.service}</code>
						<span class="text-text-secondary">{svc.impact}</span>
					</div>
					{/each}
				</div>
				{/if}
				{#if editImpact.requires_restart}
				<p class="text-text-secondary">{$t('secrets.requires_restart', '修改後需重啟以上服務才會生效。')}</p>
				{/if}
			</div>
			<!-- High risk: require typing key name -->
			{#if editImpact.risk === 'high'}
			<div>
				<label for="edit-confirm" class="mb-1 block text-xs font-medium text-text-secondary">
					{$t('secrets.confirm_type_prefix', '輸入')} <code class="bg-background px-1 rounded font-mono">{editDialog.key}</code> {$t('secrets.confirm_action_suffix', '確認操作：')}
				</label>
				<input id="edit-confirm" bind:value={editConfirmText}
					placeholder={editDialog.key}
					class="w-full rounded-md border border-danger/40 bg-background px-3 py-2 text-sm font-mono outline-none focus:border-danger" />
			</div>
			{/if}
			{/if}
		</div>
		<div class="flex justify-end gap-2 border-t border-border px-5 py-4">
			<button onclick={() => editDialog = null}
				class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised">
				{$t('secrets.cancel', '取消')}
			</button>
			<button onclick={saveSecret}
				disabled={editLoading || !editCanSave}
				class="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{#if editLoading}<RefreshCw size={13} class="animate-spin" />{/if}
				{editDialog.isNew ? $t('secrets.create', '建立') : $t('secrets.save', '儲存')}
			</button>
		</div>
	</div>
</div>
{/if}

<!-- Delete Confirm -->
{#if deleteTarget}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
	role="presentation" onclick={() => deleteTarget = null}
	onkeydown={e => e.key === 'Escape' && (deleteTarget = null)}>
	<div class="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl p-6 space-y-4"
		role="dialog" aria-modal="true" tabindex="-1"
		onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()}>
		<div class="flex items-center gap-3">
			<AlertTriangle size={20} class="text-danger shrink-0" />
			<div>
				<p class="text-sm font-semibold text-text-primary">{$t('secrets.delete_confirm_title', '確定刪除？')}</p>
				<p class="text-xs text-text-secondary mt-0.5">
					{$t('secrets.delete_permanent_prefix', '將永久刪除')} <code class="font-mono bg-background px-1 rounded">{deleteTarget}</code>
				</p>
			</div>
		</div>

		{#if deleteImpact && deleteImpact.affected_services.length > 0}
		<div class={cn(
			'rounded-lg border px-4 py-3 text-xs space-y-1',
			deleteImpact.risk === 'high' ? 'border-danger/30 bg-danger-bg' : 'border-warning/30 bg-warning-bg'
		)}>
			<p class={cn('font-medium', deleteImpact.risk === 'high' ? 'text-danger' : 'text-warning')}>
				{$t('secrets.impact_scope_short', '⚠️ 影響範圍')}
			</p>
			{#each deleteImpact.affected_services as svc}
			<div class="flex items-start gap-2 text-text-secondary">
				<code class="shrink-0 rounded bg-background px-1.5 py-0.5">{svc.service}</code>
				<span>{svc.impact}</span>
			</div>
			{/each}
		</div>
		{/if}

		{#if deleteImpact?.risk === 'high'}
		<div>
			<label for="delete-confirm" class="mb-1 block text-xs font-medium text-text-secondary">
				{$t('secrets.confirm_type_prefix', '輸入')} <code class="bg-background px-1 rounded font-mono">{deleteTarget}</code> {$t('secrets.confirm_delete_suffix', '確認刪除：')}
			</label>
			<input id="delete-confirm" bind:value={deleteConfirmText}
				placeholder={deleteTarget ?? ''}
				class="w-full rounded-md border border-danger/40 bg-background px-3 py-2 text-sm font-mono outline-none focus:border-danger" />
		</div>
		{/if}

		<div class="flex gap-2 justify-end">
			<button onclick={() => { deleteTarget = null; deleteConfirmText = ''; deleteImpact = null; }}
				class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised">
				{$t('secrets.cancel', '取消')}
			</button>
			<button onclick={() => deleteSecret(deleteTarget!)}
				disabled={deleteImpact?.risk === 'high' && deleteConfirmText !== deleteTarget}
				class="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50">
				{$t('secrets.delete', '刪除')}
			</button>
		</div>
	</div>
</div>
{/if}
