<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { t } from '$lib/stores/i18n';
	import { get } from 'svelte/store';
	import { Bell, RefreshCw, Save, AlertTriangle, CheckCircle, XCircle, Clock } from '@lucide/svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';
	import SkeletonTable from '$lib/components/ui/SkeletonTable.svelte';

	interface AlertRule {
		alert: string;
		expr: string;
		for: string;
		labels: Record<string, string>;
		annotations: Record<string, string>;
	}

	interface AlertGroup {
		name: string;
		interval?: string;
		rules: AlertRule[];
	}

	interface ActiveAlert {
		labels: Record<string, string>;
		annotations: Record<string, string>;
		startsAt: string;
		status: { state: string };
	}

	let groups = $state<AlertGroup[]>([]);
	let activeAlerts = $state<ActiveAlert[]>([]);
	let rawContent = $state('');
	let editMode = $state(false);
	let editContent = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let activeTab = $state<'rules' | 'active' | 'editor'>('active');

	async function load() {
		loading = true;
		const [rulesResult, rawResult, activeResult] = await Promise.all([
			apiGet<{ groups: AlertGroup[] }>('/alerting/rules', { silent: true }),
			apiGet<{ content: string }>('/alerting/rules/raw', { silent: true }),
			apiGet<ActiveAlert[]>('/alerting/active', { silent: true }),
		]);
		rulesResult.match((d) => { groups = d.groups || []; }, () => {});
		rawResult.match((d) => { rawContent = d.content; editContent = d.content; }, () => {});
		activeResult.match((d) => { activeAlerts = Array.isArray(d) ? d : []; }, () => {});
		loading = false;
	}

	onMount(load);

	async function saveRules() {
		saving = true;
		const result = await fetch('/api/alerting/rules/raw', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({ content: editContent }),
		});
		const data = await result.json().catch(() => ({}));
		if (result.ok) {
			toast.success(data.reloaded ? get(t)('alerting.toast_saved_reloaded', '告警規則已更新並重載 Prometheus') : get(t)('alerting.toast_saved_reload_failed', '告警規則已更新（Prometheus 重載失敗，請手動重啟）'));
			rawContent = editContent;
			editMode = false;
			load();
		} else {
			toast.error(`${get(t)('alerting.toast_save_failed', '儲存失敗')}：${data.detail || get(t)('alerting.unknown_error', '未知錯誤')}`);
		}
		saving = false;
	}

	function severityColor(severity: string): string {
		switch (severity) {
			case 'critical': return 'text-danger bg-danger-bg';
			case 'warning': return 'text-warning bg-warning-bg';
			default: return 'text-info bg-info-bg';
		}
	}

	function fmt(dateStr: string) {
		return new Date(dateStr).toLocaleString('zh-TW', { hour12: false });
	}

	const totalRules = $derived(groups.reduce((sum, g) => sum + g.rules.length, 0));
</script>

<svelte:head><title>{$t('alerting.page_title', '告警規則')} — YID AI Admin</title></svelte:head>

<div class="space-y-5">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-bold text-text-primary">{$t('alerting.title', '告警規則管理')}</h1>
			<p class="mt-1 text-sm text-text-secondary">{groups.length} {$t('alerting.groups_count', '個群組')} · {totalRules} {$t('alerting.rules_count', '條規則')}</p>
		</div>
		<div class="flex gap-2">
			<button onclick={load}
				class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
				{$t('alerting.refresh', '重新整理')}
			</button>
			{#if activeTab === 'editor'}
			<button onclick={saveRules} disabled={saving || editContent === rawContent}
				class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
				{#if saving}<RefreshCw size={14} class="animate-spin" />{:else}<Save size={14} />{/if}
				{$t('alerting.save_and_reload', '儲存並重載')}
			</button>
			{/if}
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex gap-1 rounded-lg border border-border bg-surface p-1 w-fit">
		<button onclick={() => activeTab = 'active'}
			class={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
				activeTab === 'active' ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:bg-surface-raised')}>
			<Bell size={12} />
			{$t('alerting.tab_active', '目前告警')}
			{#if activeAlerts.length > 0}
			<span class={cn('rounded-full px-1.5 py-0.5 text-xs font-bold',
				activeTab === 'active' ? 'bg-white/20 text-white' : 'bg-danger-bg text-danger')}>
				{activeAlerts.length}
			</span>
			{/if}
		</button>
		<button onclick={() => activeTab = 'rules'}
			class={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
				activeTab === 'rules' ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:bg-surface-raised')}>
			{$t('alerting.tab_rules', '規則列表')}
		</button>
		<button onclick={() => activeTab = 'editor'}
			class={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
				activeTab === 'editor' ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:bg-surface-raised')}>
			{$t('alerting.tab_editor', 'YAML 編輯器')}
		</button>
	</div>

	<!-- Active Alerts Tab -->
	{#if activeTab === 'active'}
	{#if loading}
		<div class="space-y-2">
			{#each [1,2,3] as _}
			<SkeletonCard lines={2} />
			{/each}
		</div>
	{:else if activeAlerts.length === 0}
		<div class="flex items-center gap-3 rounded-xl border border-success/30 bg-success-bg px-5 py-4">
			<CheckCircle size={20} class="text-success shrink-0" />
			<div>
				<p class="text-sm font-medium text-text-primary">{$t('alerting.no_active_alerts', '目前沒有告警')}</p>
				<p class="text-xs text-text-secondary mt-0.5">{$t('alerting.all_services_normal', '所有服務運行正常')}</p>
			</div>
		</div>
	{:else}
		<div class="space-y-2">
			{#each activeAlerts as alert}
			{@const severity = alert.labels.severity || 'info'}
			<div class={cn('rounded-xl border px-5 py-4 space-y-2',
				severity === 'critical' ? 'border-danger/30 bg-danger-bg' : 'border-warning/30 bg-warning-bg')}>
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-center gap-2">
						{#if severity === 'critical'}
							<XCircle size={16} class="text-danger shrink-0" />
						{:else}
							<AlertTriangle size={16} class="text-warning shrink-0" />
						{/if}
						<span class="text-sm font-semibold text-text-primary">{alert.labels.alertname || 'Unknown'}</span>
						<span class={cn('rounded-full px-2 py-0.5 text-xs font-medium', severityColor(severity))}>
							{severity}
						</span>
					</div>
					<div class="flex items-center gap-1 text-xs text-text-disabled shrink-0">
						<Clock size={11} />
						{fmt(alert.startsAt)}
					</div>
				</div>
				{#if alert.annotations.summary}
				<p class="text-sm text-text-primary">{alert.annotations.summary}</p>
				{/if}
				{#if alert.annotations.description}
				<p class="text-xs text-text-secondary">{alert.annotations.description}</p>
				{/if}
			</div>
			{/each}
		</div>
	{/if}
	{/if}

	<!-- Rules List Tab -->
	{#if activeTab === 'rules'}
	{#if loading}
		<SkeletonTable rows={6} cols={4} />
	{:else}
		<div class="space-y-4">
			{#each groups as group}
			<div class="overflow-hidden rounded-xl border border-border bg-surface">
				<div class="border-b border-border bg-surface-raised px-5 py-2.5 flex items-center gap-3">
					<span class="text-xs font-semibold uppercase tracking-wide text-text-secondary">{group.name}</span>
					{#if group.interval}
					<span class="text-xs text-text-disabled">interval: {group.interval}</span>
					{/if}
					<span class="ml-auto text-xs text-text-disabled">{group.rules.length} {$t('alerting.rules_unit', '條')}</span>
				</div>
				<table class="w-full">
					<thead>
						<tr class="border-b border-border">
							<th class="px-5 py-2 text-left text-xs font-medium text-text-secondary">{$t('alerting.col_rule_name', '規則名稱')}</th>
							<th class="px-5 py-2 text-left text-xs font-medium text-text-secondary">{$t('alerting.col_severity', '嚴重度')}</th>
							<th class="px-5 py-2 text-left text-xs font-medium text-text-secondary hidden md:table-cell">{$t('alerting.col_duration', '持續時間')}</th>
							<th class="px-5 py-2 text-left text-xs font-medium text-text-secondary hidden lg:table-cell">{$t('alerting.col_description', '說明')}</th>
						</tr>
					</thead>
					<tbody>
						{#each group.rules as rule}
						<tr class="border-t border-border hover:bg-surface-raised">
							<td class="px-5 py-3 text-sm font-mono font-medium text-text-primary whitespace-nowrap">{rule.alert}</td>
							<td class="px-5 py-3">
								{#if rule.labels?.severity}
								<span class={cn('rounded-full px-2 py-0.5 text-xs font-medium', severityColor(rule.labels.severity))}>
									{rule.labels.severity}
								</span>
								{/if}
							</td>
							<td class="px-5 py-3 text-xs text-text-secondary hidden md:table-cell whitespace-nowrap">{rule.for || '—'}</td>
							<td class="px-5 py-3 text-xs text-text-secondary hidden lg:table-cell max-w-xs truncate">
								{rule.annotations?.summary || rule.annotations?.description || '—'}
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

	<!-- YAML Editor Tab -->
	{#if activeTab === 'editor'}
	<div class="space-y-3">
		<div class="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-bg px-4 py-2.5 text-xs text-warning">
			<AlertTriangle size={13} />
			{$t('alerting.editor_hint', '修改後點擊「儲存並重載」，Prometheus 會自動套用新規則。語法錯誤會被拒絕。')}
		</div>
		<div class="rounded-xl border border-border overflow-hidden">
			<textarea
				bind:value={editContent}
				rows={30}
				spellcheck={false}
				class="w-full bg-background px-5 py-4 font-mono text-xs text-text-primary outline-none resize-none leading-relaxed"
			></textarea>
		</div>
		{#if editContent !== rawContent}
		<div class="flex items-center gap-2 text-xs text-warning">
			<AlertTriangle size={12} />
			{$t('alerting.unsaved_changes', '有未儲存的變更')}
		</div>
		{/if}
	</div>
	{/if}
</div>
