<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet, apiPost, apiDelete } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { t } from '$lib/stores/i18n';
	import { get } from 'svelte/store';
	import { Server, Plus, RefreshCw, Trash2, Pencil, X, CheckCircle, XCircle, AlertCircle, Terminal, Copy, Check, Download } from '@lucide/svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';

	interface FleetServer {
		id: string;
		name: string;
		prometheus_url: string;
		litellm_url: string;
		ssh_host: string;
		tags: string[];
		labels: Record<string, string>;
		enabled: boolean;
		note: string | null;
		created_at: string;
		status?: 'pending' | 'approved';
		agent_version?: string;
		agent_url?: string;
		health?: 'online' | 'offline' | 'checking';
		models_running?: number;
	}

	interface HealthResult {
		id: string;
		online: boolean;
		latency_ms: number | null;
		models_running: number;
	}

	let servers = $state<FleetServer[]>([]);
	let loading = $state(true);
	let healthLoading = $state(false);

	// Dialog
	let showDialog = $state(false);
	let editingId = $state<string | null>(null);
	let form = $state({
		name: '',
		prometheus_url: 'http://',
		litellm_url: '',
		ssh_host: '',
		tags: '',
		note: '',
		enabled: true,
	});
	let saving = $state(false);

	async function load() {
		loading = true;
		const result = await apiGet<FleetServer[]>('/fleet', { silent: true });
		result.match(
			(d) => { servers = d.map(s => ({ ...s, health: undefined })); },
			(e) => toast.error(errorMessage(e))
		);
		loading = false;
	}

	async function checkHealth() {
		healthLoading = true;
		const result = await apiGet<HealthResult[]>('/fleet/health/all');
		result.match(
			(results) => {
				const byId = new Map(results.map(r => [r.id, r]));
				servers = servers.map(s => {
					const h = byId.get(s.id);
					return {
						...s,
						health: (h?.online ? 'online' : 'offline') as 'online' | 'offline',
						models_running: h?.models_running ?? 0,
					};
				});
			},
			() => {
				servers = servers.map(s => ({ ...s, health: 'offline' as const }));
			}
		);
		healthLoading = false;
	}

	onMount(async () => {
		await load();
		checkHealth();
	});

	function openCreate() {
		editingId = null;
		form = { name: '', prometheus_url: 'http://', litellm_url: '', ssh_host: '', tags: '', note: '', enabled: true };
		showDialog = true;
	}

	function openEdit(s: FleetServer) {
		editingId = s.id;
		form = {
			name: s.name,
			prometheus_url: s.prometheus_url,
			litellm_url: s.litellm_url || '',
			ssh_host: s.ssh_host || '',
			tags: s.tags.join(', '),
			note: s.note || '',
			enabled: s.enabled,
		};
		showDialog = true;
	}

	async function save() {
		if (saving) return;
		saving = true;
		const body = {
			name: form.name.trim(),
			prometheus_url: form.prometheus_url.trim(),
			litellm_url: form.litellm_url.trim() || null,
			ssh_host: form.ssh_host.trim() || null,
			tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
			note: form.note.trim() || null,
			enabled: form.enabled,
		};

		let result;
		if (editingId) {
			result = await fetch(`/api/fleet/${editingId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify(body),
			}).then(r => r.ok ? { ok: true } : null);
		} else {
			const r = await apiPost('/fleet', body);
			result = r.isOk() ? { ok: true } : null;
		}

		if (result) {
			toast.success(editingId ? get(t)('fleet.toast_updated', '已更新') : get(t)('fleet.toast_created', '已新增'));
			showDialog = false;
			load();
		} else {
			toast.error(get(t)('fleet.toast_save_failed', '儲存失敗'));
		}
		saving = false;
	}

	async function remove(id: string, name: string) {
		if (!confirm(get(t)('fleet.confirm_remove', '確定移除 "{name}"？').replace('{name}', name))) return;
		const result = await apiDelete(`/fleet/${id}`);
		result.match(
			() => { toast.success(get(t)('fleet.toast_removed', '已移除')); load(); },
			(e) => toast.error(errorMessage(e))
		);
	}

	async function toggleEnabled(s: FleetServer) {
		await fetch(`/api/fleet/${s.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({ enabled: !s.enabled }),
		});
		load();
	}

	// ── Enrollment (auto-registration) ──────────────────────────────────────────
	interface RegistryStatus { configured: boolean; reachable: boolean; has_image: boolean; registry_host: string; }
	let showEnroll = $state(false);
	let enrollCmd = $state('');
	let enrollLoading = $state(false);
	let enrollCopied = $state(false);
	let registry = $state<RegistryStatus | null>(null);

	async function generateEnroll() {
		enrollLoading = true;
		enrollCmd = '';
		const [regResult, enrollResult] = await Promise.all([
			apiGet<RegistryStatus>('/fleet/registry-status'),
			apiPost<{ install_command: string }>('/fleet/enroll', { control_url: window.location.origin }),
		]);
		regResult.match((d) => { registry = d; }, () => {});
		enrollResult.match(
			(d) => { enrollCmd = d.install_command; },
			(e) => toast.error(errorMessage(e))
		);
		enrollLoading = false;
	}

	function openEnroll() { showEnroll = true; generateEnroll(); }

	async function copyEnroll() {
		await navigator.clipboard.writeText(enrollCmd);
		enrollCopied = true;
		setTimeout(() => { enrollCopied = false; }, 2000);
	}

	async function approveServer(id: string) {
		const result = await apiPost(`/fleet/${id}/approve`, {});
		result.match(() => { toast.success(get(t)('fleet.approve', '核准')); load(); }, (e) => toast.error(errorMessage(e)));
	}

	async function updateAgent(id: string, name: string) {
		if (!confirm(`${get(t)('fleet.update_agent', '更新 Agent')}: ${name}?`)) return;
		const result = await apiPost(`/fleet/${id}/update-agent`, {});
		result.match(() => { toast.success(get(t)('fleet.update_agent', '更新 Agent') + ' ✓'); }, (e) => toast.error(errorMessage(e)));
	}

	const pendingServers = $derived(servers.filter(s => s.status === 'pending'));
</script>

<svelte:head><title>{$t('fleet.page_title', 'Fleet 管理')} — YID AI Admin</title></svelte:head>

<div class="space-y-5">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-bold text-text-primary">{$t('fleet.title', 'Fleet 管理')}</h1>
			<p class="mt-1 text-sm text-text-secondary">{$t('fleet.subtitle', '管理多台 AI 伺服器，統一監控與操作')}</p>
		</div>
		<div class="flex gap-2">
			<button onclick={checkHealth} disabled={healthLoading}
				class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised disabled:opacity-50">
				<RefreshCw size={14} class={healthLoading ? 'animate-spin' : ''} />
				{$t('fleet.health_check', '健康檢查')}
			</button>
			<button onclick={load}
				class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
				{$t('fleet.refresh', '重新整理')}
			</button>
			<button onclick={openCreate}
				class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<Plus size={14} />
				{$t('fleet.add_server', '手動加入')}
			</button>
			<button onclick={openEnroll}
				class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
				<Terminal size={14} />
				{$t('fleet.add_device', '加入裝置')}
			</button>
		</div>
	</div>

	{#if loading}
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each [1,2,3] as _}
		<SkeletonCard lines={3} />
		{/each}
	</div>
	{:else if servers.length === 0}
	<div class="rounded-xl border border-border bg-surface py-16 text-center space-y-3">
		<Server size={36} class="mx-auto text-text-disabled" />
		<p class="text-sm text-text-secondary">{$t('fleet.empty', '尚無伺服器')}</p>
		<button onclick={openCreate}
			class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
			<Plus size={14} /> {$t('fleet.add_first', '加入第一台')}
		</button>
	</div>
	{:else}
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each servers as s}
		<div class={cn(
			'rounded-xl border bg-surface p-4 space-y-3 transition-opacity',
			!s.enabled && 'opacity-60'
		)}>
			<!-- Header -->
			<div class="flex items-start justify-between gap-2">
				<div class="flex items-center gap-2">
					{#if s.health === 'online'}
						<CheckCircle size={14} class="text-success shrink-0" />
					{:else if s.health === 'offline'}
						<XCircle size={14} class="text-danger shrink-0" />
					{:else}
						<AlertCircle size={14} class="text-text-disabled shrink-0" />
					{/if}
					<a href={`/fleet/${s.id}`} class="text-sm font-semibold text-text-primary truncate hover:text-text-link hover:underline">{s.name}</a>
					{#if s.status === 'pending'}
					<span class="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">{$t('fleet.pending', '待核准')}</span>
					{/if}
				</div>
				<div class="flex items-center gap-1 shrink-0">
					<button onclick={() => toggleEnabled(s)}
						class={cn('rounded px-2 py-0.5 text-xs font-medium transition-colors',
							s.enabled ? 'bg-success-bg text-success hover:bg-success/20' : 'bg-surface-raised text-text-disabled hover:bg-border')}>
						{s.enabled ? $t('fleet.enabled', '啟用') : $t('fleet.disabled', '停用')}
					</button>
					<button onclick={() => openEdit(s)}
						class="p-1 rounded text-text-disabled hover:text-text-primary hover:bg-surface-raised">
						<Pencil size={12} />
					</button>
					{#if s.id !== 'local'}
					<button onclick={() => remove(s.id, s.name)}
						class="p-1 rounded text-text-disabled hover:text-danger hover:bg-danger-bg">
						<Trash2 size={12} />
					</button>
					{/if}
				</div>
			</div>

			<!-- URLs -->
			<div class="space-y-1 text-xs">
				<div class="flex items-center gap-2">
					<span class="w-20 text-text-disabled shrink-0">Prometheus</span>
					<code class="font-mono text-text-secondary truncate">{s.prometheus_url}</code>
				</div>
				{#if s.litellm_url}
				<div class="flex items-center gap-2">
					<span class="w-20 text-text-disabled shrink-0">LiteLLM</span>
					<code class="font-mono text-text-secondary truncate">{s.litellm_url}</code>
				</div>
				{/if}
				{#if s.ssh_host}
				<div class="flex items-center gap-2">
					<span class="w-20 text-text-disabled shrink-0">SSH</span>
					<code class="font-mono text-text-secondary truncate">{s.ssh_host}</code>
				</div>
				{/if}
			</div>

			<!-- Tags -->
			{#if s.tags.length > 0}
			<div class="flex flex-wrap gap-1">
				{#each s.tags as tag}
				<span class="rounded-full bg-primary-subtle px-2 py-0.5 text-xs text-primary">{tag}</span>
				{/each}
			</div>
			{/if}

			{#if s.note}
			<p class="text-xs text-text-disabled">{s.note}</p>
			{/if}

			{#if s.status === 'pending'}
			<button onclick={() => approveServer(s.id)}
				class="w-full rounded-md bg-warning-bg py-1.5 text-xs font-medium text-warning hover:bg-warning/20">
				✓ {$t('fleet.approve', '核准')}
			</button>
			{/if}

			<!-- Footer: models running + agent version + manage link -->
			<div class="flex items-center justify-between border-t border-border pt-2 mt-1">
				<span class="text-xs text-text-secondary">
					{#if s.models_running !== undefined && s.health === 'online'}
						<span class="text-success font-medium">{s.models_running}</span> {$t('fleet.ov_models', '運行模型')}
					{:else if s.health === 'offline'}
						<span class="text-text-disabled">{$t('fleet.offline', '離線')}</span>
					{:else}
						<span class="text-text-disabled">—</span>
					{/if}
					{#if s.agent_version}<span class="ml-2 text-text-disabled">agent {s.agent_version}</span>{/if}
				</span>
				<div class="flex items-center gap-2">
					{#if s.agent_url}
					<button onclick={() => updateAgent(s.id, s.name)}
						class="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary" title={$t('fleet.update_agent', '更新 Agent')}>
						<Download size={11} />
					</button>
					{/if}
					<a href={`/fleet/${s.id}`}
						class="text-xs font-medium text-text-link hover:underline">{$t('fleet.manage', '進入管理')} →</a>
				</div>
			</div>
		</div>
		{/each}
	</div>
	{/if}
</div>

<!-- Enrollment Dialog -->
{#if showEnroll}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
	role="presentation" onclick={() => showEnroll = false}
	onkeydown={e => e.key === 'Escape' && (showEnroll = false)}>
	<div class="w-full max-w-2xl rounded-xl border border-border bg-surface shadow-2xl"
		role="dialog" aria-modal="true" tabindex="-1"
		onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()}>
		<div class="flex items-center justify-between border-b border-border px-5 py-4">
			<h2 class="text-sm font-semibold text-text-primary flex items-center gap-2">
				<Terminal size={15} class="text-primary" /> {$t('fleet.add_device', '加入裝置')}
			</h2>
			<button onclick={() => showEnroll = false} class="rounded p-1 text-text-disabled hover:text-text-primary"><X size={16} /></button>
		</div>
		<div class="p-5 space-y-4">
			<p class="text-sm text-text-secondary">{$t('fleet.enroll_desc', '在遠端 AI 伺服器執行此指令以加入中控')}</p>
			{#if registry && (!registry.configured || !registry.reachable || !registry.has_image)}
			<div class="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-bg px-4 py-2.5 text-xs text-warning">
				<AlertCircle size={14} class="shrink-0 mt-0.5" />
				<div>
					{#if !registry.configured}
						<p class="font-medium">{$t('fleet.registry_not_set', 'Registry 未設定')}</p>
						<p class="text-text-secondary mt-0.5">{$t('fleet.registry_hint', '中控需先啟動 image registry：sudo ./setup.sh registry && sudo ./setup.sh push-image <中控IP>:5000，並設定 REGISTRY_HOST')}</p>
					{:else if !registry.reachable}
						<p class="font-medium">{$t('fleet.registry_unreachable', 'Registry 無法連線')} ({registry.registry_host})</p>
					{:else if !registry.has_image}
						<p class="font-medium">{$t('fleet.registry_no_image', 'Registry 尚無 yid-platform image')}</p>
						<p class="text-text-secondary mt-0.5">sudo ./setup.sh push-image {registry.registry_host}</p>
					{/if}
				</div>
			</div>
			{:else if registry?.has_image}
			<div class="flex items-center gap-2 rounded-lg border border-success/30 bg-success-bg px-4 py-2 text-xs text-success">
				<CheckCircle size={13} /> {$t('fleet.registry_ready', 'Registry 就緒')} ({registry.registry_host})
			</div>
			{/if}
			{#if enrollLoading}
				<div class="h-20 animate-pulse rounded-lg bg-surface-raised"></div>
			{:else}
				<div class="relative">
					<pre class="overflow-x-auto rounded-lg border border-border bg-background p-4 pr-12 font-mono text-xs text-text-primary whitespace-pre-wrap break-all">{enrollCmd}</pre>
					<button onclick={copyEnroll} class="absolute right-2 top-2 rounded-md p-1.5 text-text-disabled hover:text-primary hover:bg-surface-raised">
						{#if enrollCopied}<Check size={14} class="text-success" />{:else}<Copy size={14} />{/if}
					</button>
				</div>
				<div class="rounded-lg bg-surface-raised px-4 py-2.5 text-xs text-text-secondary space-y-1">
					<p>• {$t('fleet.enroll_step1', '')}</p>
					<p>• {$t('fleet.enroll_step2', '')}</p>
					<p>• {$t('fleet.enroll_step3', '')}</p>
				</div>
			{/if}
		</div>
		<div class="flex justify-end gap-2 border-t border-border px-5 py-4">
			<button onclick={generateEnroll} disabled={enrollLoading}
				class="flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised disabled:opacity-50">
				<RefreshCw size={13} class={enrollLoading ? 'animate-spin' : ''} /> {$t('fleet.enroll', '產生加入指令')}
			</button>
			<button onclick={() => showEnroll = false} class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
				{$t('fleet.cancel', '取消')}
			</button>
		</div>
	</div>
</div>
{/if}

<!-- Add/Edit Dialog -->
{#if showDialog}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
	role="presentation" onclick={() => showDialog = false}
	onkeydown={e => e.key === 'Escape' && (showDialog = false)}>
	<div class="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl"
		role="dialog" aria-modal="true" tabindex="-1"
		onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()}>
		<div class="flex items-center justify-between border-b border-border px-5 py-4">
			<h2 class="text-sm font-semibold text-text-primary">
				{editingId ? $t('fleet.dialog_edit_title', '編輯伺服器') : $t('fleet.dialog_add_title', '加入伺服器')}
			</h2>
			<button onclick={() => showDialog = false} class="rounded p-1 text-text-disabled hover:text-text-primary">
				<X size={16} />
			</button>
		</div>
		<div class="p-5 space-y-3">
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<label for="fleet-name" class="mb-1 block text-xs font-medium text-text-secondary">{$t('fleet.field_name', '名稱 *')}</label>
					<input id="fleet-name" bind:value={form.name} placeholder="Production Server 01"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
				</div>
				<div class="sm:col-span-2">
					<label for="fleet-prom" class="mb-1 block text-xs font-medium text-text-secondary">Prometheus URL *</label>
					<input id="fleet-prom" bind:value={form.prometheus_url} placeholder="http://192.168.1.10:9090"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary" />
				</div>
				<div>
					<label for="fleet-litellm" class="mb-1 block text-xs font-medium text-text-secondary">LiteLLM URL</label>
					<input id="fleet-litellm" bind:value={form.litellm_url} placeholder="http://192.168.1.10:4000"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary" />
				</div>
				<div>
					<label for="fleet-ssh" class="mb-1 block text-xs font-medium text-text-secondary">SSH Host</label>
					<input id="fleet-ssh" bind:value={form.ssh_host} placeholder="user@192.168.1.10"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary" />
				</div>
				<div class="sm:col-span-2">
					<label for="fleet-tags" class="mb-1 block text-xs font-medium text-text-secondary">{$t('fleet.field_tags', '標籤（逗號分隔）')}</label>
					<input id="fleet-tags" bind:value={form.tags} placeholder="gpu, prod, tw"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
				</div>
				<div class="sm:col-span-2">
					<label for="fleet-note" class="mb-1 block text-xs font-medium text-text-secondary">{$t('fleet.field_note', '備註')}</label>
					<input id="fleet-note" bind:value={form.note} placeholder={$t('fleet.placeholder_note', '台北機房 / GB202 96GB')}
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
				</div>
				<div class="flex items-center gap-2">
					<input type="checkbox" id="fleet-enabled" bind:checked={form.enabled} class="accent-primary" />
					<label for="fleet-enabled" class="text-sm text-text-secondary">{$t('fleet.enabled', '啟用')}</label>
				</div>
			</div>
		</div>
		<div class="flex justify-end gap-2 border-t border-border px-5 py-4">
			<button onclick={() => showDialog = false}
				class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised">
				{$t('fleet.cancel', '取消')}
			</button>
			<button onclick={save} disabled={!form.name.trim() || !form.prometheus_url.trim() || saving}
				class="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{#if saving}<RefreshCw size={13} class="animate-spin" />{:else}<Server size={13} />{/if}
				{editingId ? $t('fleet.save', '儲存') : $t('fleet.add', '加入')}
			</button>
		</div>
	</div>
</div>
{/if}
