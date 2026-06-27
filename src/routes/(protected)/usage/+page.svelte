<script lang="ts">
	import { onMount } from 'svelte';
	import { apiGet } from '$lib/api/client';
	import { errorMessage } from '$lib/utils/error';
	import { cn } from '$lib/utils/cn';
	import { toast } from 'svelte-sonner';
	import { TrendingUp, Zap, DollarSign, RefreshCw, BarChart3, Users } from '@lucide/svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';

	interface UsageSummary {
		period_days: number;
		total_requests: number;
		total_input_tokens: number;
		total_output_tokens: number;
		total_tokens: number;
		by_model: Record<string, { requests: number; input_tokens: number; output_tokens: number }>;
		by_user: Record<string, { requests: number; tokens: number }>;
		openai_equivalent_cost_usd: number;
		openai_compare_model: string;
		gpu_cost_twd: number;
		gpu_power_watts?: number;
	}

	interface DailyUsage {
		date: string;
		requests: number;
		tokens: number;
	}

	interface ROI {
		period_days: number;
		total_requests: number;
		total_tokens: number;
		openai_equivalent_usd: number;
		openai_equivalent_twd: number;
		gpu_electricity_cost_twd: number;
		estimated_savings_twd: number;
		roi_ratio: number | null;
		compare_model: string;
		usd_to_twd_rate: number;
	}

	let summary = $state<UsageSummary | null>(null);
	let daily = $state<DailyUsage[]>([]);
	let roi = $state<ROI | null>(null);
	let loading = $state(true);
	let days = $state(30);

	onMount(() => load());

	async function load() {
		loading = true;
		const [s, d, r] = await Promise.all([
			apiGet<UsageSummary>(`/usage/summary?days=${days}`, { silent: true }),
			apiGet<DailyUsage[]>(`/usage/daily?days=${days}`, { silent: true }),
			apiGet<ROI>(`/usage/roi?days=${days}`, { silent: true }),
		]);
		s.match((data) => { summary = data; }, (e) => toast.error(errorMessage(e)));
		d.match((data) => { daily = data; }, () => {});
		r.match((data) => { roi = data; }, () => {});
		loading = false;
	}

	function fmt(n: number, decimals = 0): string {
		return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
	}

	function fmtTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}

	// Simple bar chart: normalize daily requests to max
	const maxRequests = $derived(Math.max(...daily.map(d => d.requests), 1));
	const recentDays  = $derived(daily.slice(-14));  // show last 14 days

	const topModels = $derived(
		summary
			? Object.entries(summary.by_model)
				.sort((a, b) => b[1].requests - a[1].requests)
				.slice(0, 5)
			: []
	);

	const topUsers = $derived(
		summary
			? Object.entries(summary.by_user)
				.sort((a, b) => b[1].tokens - a[1].tokens)
				.slice(0, 10)
			: []
	);
</script>

<svelte:head><title>Usage & ROI — YID AI Admin</title></svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4 flex-wrap">
		<div>
			<h1 class="text-xl font-bold text-text-primary">用量報表 & ROI</h1>
			<p class="mt-1 text-sm text-text-secondary">
				AI 平台使用量分析與 OpenAI 費用對比。
			</p>
		</div>
		<div class="flex items-center gap-3">
			<!-- Period selector -->
			<div class="flex gap-1 rounded-lg border border-border bg-surface p-1">
				{#each [7, 30, 90] as d}
				<button onclick={() => { days = d; load(); }}
					class={cn('rounded px-3 py-1 text-xs font-medium transition-colors',
						days === d ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:text-text-primary')}>
					{d}天
				</button>
				{/each}
			</div>
			<button onclick={load} class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
				<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
			</button>
		</div>
	</div>

	{#if loading}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			{#each [1,2,3,4] as _}
				<SkeletonCard lines={2} />
			{/each}
		</div>
	{:else if summary && roi}
		<!-- KPI cards -->
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			<div class="rounded-xl border border-border bg-surface p-4">
				<div class="flex items-center gap-2 text-xs text-text-secondary mb-2">
					<BarChart3 size={13} /> API 請求數
				</div>
				<div class="text-2xl font-bold text-text-primary">{fmt(summary.total_requests)}</div>
				<div class="text-xs text-text-disabled mt-1">過去 {days} 天</div>
			</div>
			<div class="rounded-xl border border-border bg-surface p-4">
				<div class="flex items-center gap-2 text-xs text-text-secondary mb-2">
					<TrendingUp size={13} /> Token 總量
				</div>
				<div class="text-2xl font-bold text-text-primary">{fmtTokens(summary.total_tokens)}</div>
				<div class="text-xs text-text-disabled mt-1">輸入 {fmtTokens(summary.total_input_tokens)} + 輸出 {fmtTokens(summary.total_output_tokens)}</div>
			</div>
			<div class="rounded-xl border border-border bg-surface p-4">
				<div class="flex items-center gap-2 text-xs text-text-secondary mb-2">
					<DollarSign size={13} /> 若用 {roi.compare_model}
				</div>
				<div class="text-2xl font-bold text-warning">NT$ {fmt(roi.openai_equivalent_twd)}</div>
				<div class="text-xs text-text-disabled mt-1">≈ US$ {roi.openai_equivalent_usd.toFixed(2)}</div>
			</div>
			<div class="rounded-xl border border-border bg-surface p-4">
				<div class="flex items-center gap-2 text-xs text-text-secondary mb-2">
					<Zap size={13} /> 電費成本
				</div>
				<div class="text-2xl font-bold text-success">NT$ {fmt(roi.gpu_electricity_cost_twd)}</div>
				{#if summary.gpu_power_watts}
				<div class="text-xs text-text-disabled mt-1">{summary.gpu_power_watts}W × {days}天</div>
				{/if}
			</div>
		</div>

		<!-- ROI highlight -->
		{#if roi.estimated_savings_twd > 0}
		<div class="rounded-xl border border-success bg-success-bg p-5 flex items-center gap-6 flex-wrap">
			<div>
				<p class="text-xs text-success/70 uppercase tracking-wide font-medium mb-1">估算節省金額（{days} 天）</p>
				<div class="text-3xl font-bold text-success">NT$ {fmt(roi.estimated_savings_twd)}</div>
			</div>
			{#if roi.roi_ratio}
			<div class="border-l border-success/30 pl-6">
				<p class="text-xs text-success/70 mb-1">ROI 倍數</p>
				<div class="text-3xl font-bold text-success">{roi.roi_ratio}x</div>
				<p class="text-xs text-success/70 mt-1">自建成本 vs {roi.compare_model}</p>
			</div>
			{/if}
			<div class="text-xs text-success/70 ml-auto">
				基於 {roi.compare_model} 定價<br>
				匯率 1 USD = {roi.usd_to_twd_rate} TWD
			</div>
		</div>
		{/if}

		<!-- Daily usage chart (simple CSS bars) -->
		{#if recentDays.length > 0}
		<div class="rounded-xl border border-border bg-surface p-5">
			<h2 class="text-sm font-semibold text-text-primary mb-4">每日請求量（最近 14 天）</h2>
			<div class="flex items-end gap-1 h-24">
				{#each recentDays as day}
				<div class="flex-1 flex flex-col items-center gap-1 group relative" title="{day.date}: {day.requests} 次">
					<div class="w-full bg-primary/20 rounded-t transition-all hover:bg-primary/40"
						style="height: {Math.max(4, (day.requests / maxRequests) * 88)}px">
					</div>
					<span class="text-xs text-text-disabled rotate-45 origin-left hidden sm:block" style="font-size:9px">
						{day.date.slice(5)}
					</span>
				</div>
				{/each}
			</div>
			{#if recentDays.every(d => d.requests === 0)}
			<p class="text-xs text-text-disabled text-center mt-2">尚無使用數據（LiteLLM DB 可能尚未有請求記錄）</p>
			{/if}
		</div>
		{/if}

		<!-- By model + By user -->
		<div class="grid gap-4 md:grid-cols-2">
			<!-- Top models -->
			<div class="rounded-xl border border-border bg-surface p-5">
				<h2 class="text-sm font-semibold text-text-primary mb-4">模型使用排行</h2>
				{#if topModels.length === 0}
				<p class="text-xs text-text-disabled">尚無數據</p>
				{:else}
				<div class="space-y-2">
					{#each topModels as [model, stats]}
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs text-text-primary truncate min-w-0 flex-1">{model}</span>
						<span class="text-xs text-text-secondary shrink-0">{fmt(stats.requests)} 次</span>
						<span class="text-xs text-text-disabled shrink-0">{fmtTokens(stats.input_tokens + stats.output_tokens)}</span>
					</div>
					{/each}
				</div>
				{/if}
			</div>

			<!-- Top users -->
			<div class="rounded-xl border border-border bg-surface p-5">
				<h2 class="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
					<Users size={14} /> 用戶用量排行
				</h2>
				{#if topUsers.length === 0}
				<p class="text-xs text-text-disabled">尚無數據</p>
				{:else}
				<div class="space-y-2">
					{#each topUsers as [user, stats], i}
					{@const maxT = topUsers[0]?.[1]?.tokens || 1}
					<div class="space-y-0.5">
						<div class="flex items-center justify-between">
							<span class="font-mono text-xs text-text-primary">{user}</span>
							<span class="text-xs text-text-secondary">{fmtTokens(stats.tokens)}</span>
						</div>
						<div class="h-1.5 rounded-full bg-border overflow-hidden">
							<div class="h-full bg-primary rounded-full" style="width:{stats.tokens/maxT*100}%"></div>
						</div>
					</div>
					{/each}
				</div>
				{/if}
			</div>
		</div>

		<!-- Cost breakdown note -->
		<div class="rounded-xl border border-border bg-surface px-5 py-4 text-xs text-text-secondary space-y-1">
			<p class="font-medium text-text-primary">說明</p>
			<ul class="list-disc list-inside space-y-0.5">
				<li>OpenAI 費用對比基於 {roi.compare_model} 定價（輸入 $2.50/1M tokens，輸出 $10.00/1M tokens）</li>
				<li>電費成本基於目前 GPU 功耗（{summary.gpu_power_watts ?? 'N/A'}W）× 電費 NT$ {_KWH_PRICE_TWD}/kWh</li>
				<li>Token 數據來自 LiteLLM 日誌（需要 PostgreSQL 已連接且有請求記錄）</li>
				<li>可在 .env 設定 <code class="bg-background px-1 rounded">USD_TO_TWD</code> 和 <code class="bg-background px-1 rounded">KWH_PRICE_TWD</code> 調整計算參數</li>
			</ul>
		</div>
	{/if}
</div>

<script module lang="ts">
	const _KWH_PRICE_TWD = 4.5;
</script>
